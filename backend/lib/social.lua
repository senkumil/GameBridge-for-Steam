return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local USER_AGENT = deps.user_agent or "Steam-Game-Data-Linker-Mod/2.6"
local M = {}

local published_preview_cache = {}

function M.fetch_published_file_previews(file_ids_csv)
    local results = {}
    for id in tostring(file_ids_csv):gmatch("(%d+)") do
        if #results >= 12 then break end
        if published_preview_cache[id] then
            table.insert(results, published_preview_cache[id])
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
            published_preview_cache[id] = entry
            table.insert(results, entry)
        end
    end
    logger:info("Published file previews: " .. tostring(#results) .. " resolved")
    return cjson.encode(results)
end

-- ── Friend review scraping (from public community profiles) ────────────
local review_cache = {}

local function strip_html(s)
    s = s:gsub("<br%s*/?>", "\n"):gsub("<[^>]+>", "")
    s = s:gsub("&quot;", '"'):gsub("&#39;", "'"):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&nbsp;", " "):gsub("&amp;", "&")
    return s:match("^%s*(.-)%s*$") or ""
end

function M.fetch_friend_review(steam_id64, steam_app_id)
    local sid = tostring(steam_id64):match("(%d+)") or ""
    local appid = tostring(steam_app_id):match("(%d+)") or ""
    -- SteamID64s are 17 digits, appids far shorter; undo swapped arguments
    -- (same Linux argument-order quirk as fetch_partner_events)
    if #sid < 15 and #appid >= 15 then
        sid, appid = appid, sid
    end
    local key = sid .. "_" .. appid
    if review_cache[key] then return review_cache[key] end

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
    review_cache[key] = encoded
    return encoded
end

-- ── Friend persona fetching (batch, cached) ───────────────────────────
local friend_persona_cache = {}

function M.fetch_friend_personas(steam_ids_csv)
    local ids = {}
    for id in tostring(steam_ids_csv):gmatch("(%d+)") do
        if #ids < 30 then
            table.insert(ids, id)
        end
    end

    local results = {}
    for _, sid in ipairs(ids) do
        if friend_persona_cache[sid] then
            table.insert(results, friend_persona_cache[sid])
        else
            local url = "https://steamcommunity.com/profiles/" .. sid .. "/?xml=1"
            local ok_req, res = pcall(http.get, url, { timeout = 8 })
            local entry = { steamid = sid, name = "", avatar = "" }
            if ok_req and res and res.status == 200 and res.body then
                local name = res.body:match("<steamID><!%[CDATA%[(.-)%]%]></steamID>")
                if not name then name = res.body:match("<steamID>(.-)</steamID>") end
                local avatar = res.body:match("<avatarMedium><!%[CDATA%[(.-)%]%]></avatarMedium>")
                if not avatar then avatar = res.body:match("<avatarMedium>(.-)</avatarMedium>") end
                entry.name = name or ""
                entry.avatar = avatar or ""
            end
            friend_persona_cache[sid] = entry
            table.insert(results, entry)
        end
    end

    return cjson.encode(results)
end

return M
end
