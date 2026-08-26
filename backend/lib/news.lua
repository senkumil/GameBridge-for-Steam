return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local USER_AGENT = deps.user_agent or "GameBridge-for-Steam/1.0"
local M = {}
local html_unescape = util.html_unescape
function M.fetch_news(steam_app_id, language)
    steam_app_id = tostring(steam_app_id or "")
    local lang = tostring(language or "")
    -- Some Millennium builds can deliver named arguments in lexical order.
    -- Undo the swap when the numeric AppID arrives in the language position.
    if not steam_app_id:match("^%d+$") and lang:match("^%d+$") then
        steam_app_id, lang = lang, steam_app_id
    end
    lang = lang:gsub("[^%w_]", "")
    local url = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid="
        .. steam_app_id
        .. "&count=50&maxlength=600&feeds=steam_community_announcements&format=json"
    if lang ~= "" then url = url .. "&l=" .. lang end
    logger:info("Fetching news from: " .. url)

    local res, err = http.get(url, {
        headers = { ["Accept"] = "application/json" },
        timeout = 15
    })

    if not res then
        return cjson.encode({ error = "Request failed: " .. tostring(err) })
    end

    if res.status ~= 200 then
        return cjson.encode({ error = "HTTP " .. tostring(res.status) })
    end

    local ok, body = pcall(cjson.decode, res.body)
    if not ok then
        return cjson.encode({ error = "Parse error" })
    end

    local news = body and body.appnews and body.appnews.newsitems
    if not news then
        return cjson.encode({ items = {} })
    end

    return cjson.encode({ items = news })
end

-- ── Partner events (the native news source: cover images, event types,
-- localized to the user's language) ─────────────────────────────────────

local function html_unescape(s)
    return (s:gsub("&quot;", '"'):gsub("&#39;", "'"):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&amp;", "&"))
end

-- Scrape the Steam news-hub page for an appid and return a Lua array of native
-- event items (title/contents/date/event_type/cover image). Shared by the
-- Steam-linked path and native Steam news lookup.
local function scrape_partner_events(appid, lang, max)
    appid = tostring(appid)
    lang = tostring(lang or "english")
    max = max or 10

    -- The old ajaxgetpartnereventspage endpoint is gone; the news hub page
    -- embeds the same event data in its data-initialEvents attribute
    local url = "https://store.steampowered.com/news/app/" .. appid .. "?l=" .. lang
    logger:info("Fetching partner events: " .. url)

    local ok, res = pcall(http.get, url, {
        headers = { ["Accept"] = "text/html,*/*" },
        timeout = 20
    })
    if not ok or not res or res.status ~= 200 or not res.body then
        logger:warn("Partner events fetch failed for appid " .. appid)
        return {}
    end

    local marker = 'data-initialEvents="'
    local a = res.body:find(marker, 1, true)
    if not a then
        logger:warn("Partner events: data-initialEvents not found for appid " .. appid)
        return {}
    end
    local vstart = a + #marker
    local vend = res.body:find('"', vstart, true)
    if not vend then return {} end

    local ok2, body = pcall(cjson.decode, html_unescape(res.body:sub(vstart, vend - 1)))
    if not ok2 or type(body) ~= "table" or type(body.events) ~= "table" then
        logger:warn("Partner events parse failed for appid " .. appid)
        return {}
    end

    local items = {}
    for _, ev in ipairs(body.events) do
        if type(ev) == "table" then
            local ann = (type(ev.announcement_body) == "table") and ev.announcement_body or {}
            local item = {
                gid = tostring(ev.gid or ann.gid or ""),
                title = ann.headline or ev.event_name or "",
                contents = ann.body or "",
                date = ann.posttime or ev.rtime32_start_time or 0,
                event_type = ev.event_type or 0,
                image = "",
            }
            local clanid = tostring(ann.clanid or "")

            -- Cover image lives in jsondata (a JSON string) as a localized
            -- array with holes; scan indices manually since decoders differ
            -- in how they represent nulls
            if type(ev.jsondata) == "string" and #ev.jsondata > 2 and clanid ~= "" then
                local okj, jd = pcall(cjson.decode, ev.jsondata)
                if okj and type(jd) == "table" then
                    local img = nil
                    for _, field in ipairs({ "localized_capsule_image", "localized_title_image" }) do
                        local arr = jd[field]
                        if not img and type(arr) == "table" then
                            for i = 1, 30 do
                                local v = arr[i]
                                if type(v) == "string" and #v > 0 then
                                    img = v
                                    break
                                end
                            end
                        end
                    end
                    if img then
                        item.image = "https://clan.akamai.steamstatic.com/images/" .. clanid .. "/" .. img
                    end
                end
            end

            table.insert(items, item)
            if #items >= max then break end
        end
    end

    logger:info("Partner events: " .. tostring(#items) .. " item(s) for appid " .. appid)
    return items
end

function M.fetch_partner_events(steam_app_id, language)
    local appid = tostring(steam_app_id)
    local lang = tostring(language or "english")
    -- Some Millennium builds (seen on Linux) map named JS arguments onto Lua
    -- positionals in a different order; detect the swap and undo it
    if not appid:match("^%d+$") and lang:match("^%d+$") then
        appid, lang = lang, appid
    end
    lang = lang:gsub("[^%w_]", "")
    if lang == "" then lang = "english" end
    return cjson.encode({ items = scrape_partner_events(appid, lang, 50) })
end

return M
end
