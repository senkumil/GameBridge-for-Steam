return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local lru = deps.lru_cache
local USER_AGENT = deps.user_agent or "NativeGameLink-for-Steam/2.0.0"
local M = {}

local published_preview_cache = {}
local PUBLISHED_PREVIEW_CACHE_LIMIT = 96

function M.fetch_published_file_previews(file_ids_csv)
    local results = {}
    for id in tostring(file_ids_csv or ""):gmatch("(%d+)") do
        if #results >= 12 then break end
        if published_preview_cache[id] then
            lru.touch(published_preview_cache[id])
            table.insert(results, published_preview_cache[id].value)
        else
            local url = "https://steamcommunity.com/sharedfiles/filedetails/?id=" .. id
            local ok, res = pcall(http.get, url, {
                headers = { ["Accept"] = "text/html,*/*" },
                timeout = 10
            })
            local entry = { id = id, image = "" }
            if ok and res and res.status == 200 and res.body then
                local img = res.body:match('<meta%s+property="og:image"%s+content="([^"]+)"')
                if img then entry.image = img:gsub("&amp;", "&") end
            end
            lru.put(published_preview_cache, id, { value = entry }, PUBLISHED_PREVIEW_CACHE_LIMIT)
            table.insert(results, entry)
        end
    end
    logger:info("Published file previews: " .. tostring(#results) .. " resolved")
    return cjson.encode(results)
end

-- ── Friend review scraping (from public community profiles) ────────────
local review_cache = {}
local REVIEW_CACHE_LIMIT = 64

local function strip_html(s)
    s = s:gsub("<br%s*/?>", "\n"):gsub("<[^>]+>", "")
    s = s:gsub("&quot;", '"'):gsub("&#39;", "'"):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&nbsp;", " "):gsub("&amp;", "&")
    return s:match("^%s*(.-)%s*$") or ""
end

function M.fetch_friend_review(steam_id64, steam_app_id)
    local sid = tostring(steam_id64 or ""):match("(%d+)") or ""
    local appid = tostring(steam_app_id or ""):match("(%d+)") or ""
    -- SteamID64s are 17 digits, appids far shorter; undo swapped arguments
    -- (same Linux argument-order quirk as fetch_partner_events)
    if #sid < 15 and #appid >= 15 then
        sid, appid = appid, sid
    end
    local key = sid .. "_" .. appid
    if review_cache[key] then
        lru.touch(review_cache[key])
        return review_cache[key].value
    end

    local public_url = "https://steamcommunity.com/profiles/" .. sid .. "/recommended/" .. appid .. "/"
    local out = { found = false, url = public_url }

    -- l=english pins the rating summary text so voted_up detection is stable
    local ok, res = pcall(http.get, public_url .. "?l=english", {
        headers = { ["Accept"] = "text/html,*/*" },
        timeout = 10
    })
    if ok and res and res.status == 200 and res.body then
        local body = res.body
        local rating = body:match('<div class="ratingSummary">%s*(.-)%s*</div>')
        local playtime = body:match('<div class="playTime">%s*(.-)%s*</div>')
        local text = body:match('<div id="ReviewText">(.-)</div>')
        if rating and text then
            out.found = true
            out.voted_up = (rating:lower():find("not recommended", 1, true) == nil)
            out.rating = strip_html(rating)
            out.hours = playtime and strip_html(playtime) or ""
            out.text = strip_html(text)
        end
    end

    local encoded = cjson.encode(out)
    lru.put(review_cache, key, { value = encoded }, REVIEW_CACHE_LIMIT)
    return encoded
end

-- ── Friend persona fetching (batch, cached) ───────────────────────────
local friend_persona_cache = {}
local FRIEND_PERSONA_CACHE_LIMIT = 128
local FRIEND_PERSONA_MAX_REQUESTS = 32
local FRIEND_PERSONA_CACHE_SECONDS = 15 * 60
local FRIEND_PERSONA_FAILURE_CACHE_SECONDS = 60

function M.fetch_friend_personas(steam_ids_csv)
    local ids, seen = {}, {}
    for id in tostring(steam_ids_csv or ""):gmatch("(%d+)") do
        if not seen[id] and #ids < FRIEND_PERSONA_MAX_REQUESTS then
            seen[id] = true
            table.insert(ids, id)
        end
    end

    local results = {}
    local now = os.time()
    for _, sid in ipairs(ids) do
        local cached = friend_persona_cache[sid]
        if cached and cached.expires_at > now then
            lru.touch(cached)
            table.insert(results, cached.entry)
        else
            local url = "https://steamcommunity.com/profiles/" .. sid .. "/?xml=1"
            local ok_req, res = pcall(http.get, url, { timeout = 8 })
            local entry = { steamid = sid, name = "", avatar = "" }
            if ok_req and res and res.status == 200 and res.body then
                local name = res.body:match("<steamID><!%[CDATA%[(.-)%]%]></steamID>")
                if not name then name = res.body:match("<steamID>(.-)</steamID>") end
                local avatar = res.body:match("<avatarMedium><!%[CDATA%[(.-)%]%]></avatarMedium>")
                if not avatar then avatar = res.body:match("<avatarMedium>(.-)</avatarMedium>") end
                if not avatar or avatar == "" then
                    avatar = res.body:match("<avatarFull><!%[CDATA%[(.-)%]%]></avatarFull>")
                        or res.body:match("<avatarFull>(.-)</avatarFull>")
                        or res.body:match("<avatarIcon><!%[CDATA%[(.-)%]%]></avatarIcon>")
                        or res.body:match("<avatarIcon>(.-)</avatarIcon>")
                end
                entry.name = name or ""
                entry.avatar = avatar or ""
            end
            lru.put(friend_persona_cache, sid, {
                entry = entry,
                -- Cache a transient failed lookup briefly to prevent repeated
                -- synchronous timeouts while the Community service is down.
                expires_at = now + ((entry.name ~= "" or entry.avatar ~= "")
                    and FRIEND_PERSONA_CACHE_SECONDS or FRIEND_PERSONA_FAILURE_CACHE_SECONDS),
            }, FRIEND_PERSONA_CACHE_LIMIT)
            table.insert(results, entry)
        end
    end

    return cjson.encode(results)
end

-- ── Community Activity scraping (from public community feeds) ────────────
local activity_cache = {}
local ACTIVITY_CACHE_LIMIT = 32
local ACTIVITY_CACHE_SECONDS = 30

function M.fetch_community_activity(steam_app_id, steam_id64)
    local appid = tostring(steam_app_id or ""):match("(%d+)") or ""
    local sid = tostring(steam_id64 or ""):match("(%d+)") or ""
    if appid == "" and sid == "" then return "[]" end

    local cache_key = appid .. "_" .. sid
    local now = os.time()
    local cached = activity_cache[cache_key]
    if cached and cached.expires_at > now then
        lru.touch(cached)
        return cached.value
    end

    local events = {}
    local seen_keys = {}

    local urls = {}
    if sid ~= "" and #sid >= 15 then
        table.insert(urls, "https://steamcommunity.com/profiles/" .. sid .. "/home/")
    end
    if appid ~= "" then
        table.insert(urls, "https://steamcommunity.com/app/" .. appid .. "/home/")
    end

    local function process_post(chunk)
        if not chunk or chunk == "" then return end
        local has_app = (appid == "" or chunk:find("/app/" .. appid, 1, true) ~= nil or chunk:find("app/" .. appid, 1, true) ~= nil)
        if not has_app then return end

        local actor_sid = chunk:match('profiles/(%d+)') or ""
        local actor_name = chunk:match('<a%s+class="whiteLink"%s+href="[^"]*">(.-)</a>')
            or chunk:match('<span%s+class="persona[^"]*">(.-)</span>')
            or chunk:match('class="blotter_author_block.-<a[^>]*>(.-)</a>') or ""
        local actor_avatar = chunk:match('<img%s+src="([^"]*avatars[^"]*)"')
            or chunk:match('<img%s+src="([^"]*avatar[^"]*)"') or ""
        local status_text = chunk:match('<div%s+class="blotter_userstatus_content[^"]*">%s*(.-)%s*</div>')
            or chunk:match('<div%s+class="blotter_status_text[^"]*">%s*(.-)%s*</div>')
            or chunk:match('<blockquote[^>]*>%s*(.-)%s*</blockquote>') or ""
        local is_wishlist = chunk:find("lista de deseados", 1, true) ~= nil
            or chunk:find("wishlist", 1, true) ~= nil

        actor_name = strip_html(actor_name)
        status_text = strip_html(status_text)

        if actor_sid == "" and actor_name == "" and status_text == "" then return end

        local item_key = actor_sid .. "_" .. status_text .. "_" .. (is_wishlist and "1" or "0")
        if not seen_keys[item_key] then
            seen_keys[item_key] = true
            if status_text ~= "" then
                table.insert(events, {
                    type = 16,
                    steamid = actor_sid,
                    name = actor_name,
                    avatar = actor_avatar,
                    text = status_text,
                    time = now
                })
            elseif is_wishlist then
                table.insert(events, {
                    type = 9,
                    steamid = actor_sid,
                    name = actor_name,
                    avatar = actor_avatar,
                    time = now
                })
            end
        end
    end

    for _, target_url in ipairs(urls) do
        local ok, res = pcall(http.get, target_url, {
            headers = { ["Accept"] = "text/html,*/*" },
            timeout = 8
        })
        if ok and res and res.status == 200 and res.body then
            local body = res.body
            for chunk in body:gmatch('<div class="blotter_post(.-)<div class="blotter_post') do
                process_post(chunk)
            end
            local last_chunk = body:match('.*<div class="blotter_post(.*)')
            if last_chunk then process_post(last_chunk) end
        end
    end

    local encoded = cjson.encode(events)
    lru.put(activity_cache, cache_key, { value = encoded, expires_at = now + ACTIVITY_CACHE_SECONDS }, ACTIVITY_CACHE_LIMIT)
    return encoded
end

return M
end
