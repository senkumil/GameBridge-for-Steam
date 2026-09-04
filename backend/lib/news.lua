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
local html_unescape = util.html_unescape
-- A delisted/retired AppID still has a Steam library entry, but its News Hub
-- often responds with the generic Store shell instead of an events payload.
-- Remember that terminal capability result for this plugin session so Spanish
-- + English fallback requests do not repeat a known-useless fetch or warning.
local partner_events_unavailable = {}
local PARTNER_UNAVAILABLE_CACHE_LIMIT = 64

-- Sparse/de-listed titles are enriched generically.  Five cards is enough to
-- make the activity feed useful without turning old games into an archive
-- browser.  Never fabricate entries: every item must come from a Steam-owned
-- endpoint (Web API, oldnews archive, Community RSS/App Hub, or a related
-- Steam DLC discovered from AppInfo).
local TARGET_NEWS_ITEMS = 5
local MAX_RELATED_NEWS_APPS = 6
local MAX_ARCHIVE_ITEMS = 16
local function merge_news_lists(primary, extra)
    local result, seen = {}, {}
    local function add(item)
        if type(item) ~= "table" then return end
        local gid = tostring(item.gid or ""):lower()
        local url = tostring(item.url or ""):lower()
        local title = tostring(item.title or ""):lower():gsub("%s+", " "):match("^%s*(.-)%s*$") or ""
        if title == "" then return end
        local key = gid ~= "" and ("gid:" .. gid) or (url ~= "" and ("url:" .. url) or ("title:" .. title))
        if seen[key] then return end
        seen[key] = true
        result[#result + 1] = item
    end
    for _, item in ipairs(type(primary) == "table" and primary or {}) do add(item) end
    for _, item in ipairs(type(extra) == "table" and extra or {}) do add(item) end
    table.sort(result, function(a, b) return tonumber(a.date or 0) > tonumber(b.date or 0) end)
    return result
end

local function fetch_news_json(appid, lang, announcements_only)
    local url = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid="
        .. appid .. "&count=50&maxlength=900&format=json"
    if announcements_only then url = url .. "&feeds=steam_community_announcements" end
    if lang ~= "" then url = url .. "&l=" .. lang end
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "application/json", ["User-Agent"] = USER_AGENT },
        timeout = 10,
    })
    if not ok_http or not res then return {}, true end
    if res.status ~= 200 or not res.body then
        return {}, tonumber(res.status or 0) >= 500 or tonumber(res.status or 0) == 0
    end
    local ok, body = pcall(cjson.decode, res.body)
    local items = ok and body and body.appnews and body.appnews.newsitems or nil
    if type(items) ~= "table" then return {}, false end
    return items, false
end

local MONTHS = { jan=1, feb=2, mar=3, apr=4, may=5, jun=6, jul=7, aug=8, sep=9, oct=10, nov=11, dec=12 }
local function parse_english_date(value)
    local text = tostring(value or ""):gsub("<[^>]+>", " "):gsub("%s+", " ")
    local day, mon, year, hh, mm, ss = text:match("%a+,%s*(%d+)%s+(%a+)%s+(%d+)%s+(%d+):(%d+):(%d+)")
    if not day then mon, day, year = text:match("(%a+)%s+(%d+),%s*(%d+)") end
    local month = mon and MONTHS[mon:sub(1, 3):lower()] or nil
    if not month or not day or not year then return 0 end
    local ok, ts = pcall(os.time, {
        year = tonumber(year), month = month, day = tonumber(day),
        hour = tonumber(hh) or 12, min = tonumber(mm) or 0, sec = tonumber(ss) or 0,
    })
    return ok and tonumber(ts) or 0
end

local function clean_markup(value)
    local text = tostring(value or "")
    text = text:gsub("<!%[CDATA%[(.-)%]%]>", "%1")
    text = text:gsub("<br%s*/?>", "\n"):gsub("</p>", "\n"):gsub("<[^>]+>", " ")
    text = html_unescape(text):gsub("%s+", " "):match("^%s*(.-)%s*$") or ""
    return text
end

local function xml_tag(block, tag)
    local raw = tostring(block or ""):match("<" .. tag .. "[^>]*>(.-)</" .. tag .. ">") or ""
    return clean_markup(raw)
end

local function fetch_community_rss(appid, max_items)
    local url = "https://steamcommunity.com/games/" .. appid .. "/rss/"
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "application/rss+xml,application/xml,text/xml,*/*", ["User-Agent"] = USER_AGENT },
        timeout = 8,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then return {}, not ok_http or not res or tonumber(res and res.status or 0) >= 500 end
    local items = {}
    for block in tostring(res.body):gmatch("<item[^>]*>(.-)</item>") do
        local title = xml_tag(block, "title")
        if title ~= "" then
            local link = xml_tag(block, "link")
            local guid = xml_tag(block, "guid")
            local description = xml_tag(block, "description")
            local pubdate = xml_tag(block, "pubDate")
            items[#items + 1] = {
                gid = guid ~= "" and guid or link,
                title = title,
                url = link,
                contents = description,
                date = parse_english_date(pubdate),
                feedlabel = "Steam Community",
            }
            if #items >= (max_items or 12) then break end
        end
    end
    return items, false
end

local function fetch_community_allnews(appid, max_items)
    local url = "https://steamcommunity.com/app/" .. appid .. "/allnews/?l=english"
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "text/html,*/*", ["User-Agent"] = USER_AGENT },
        timeout = 9,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then return {}, not ok_http or not res or tonumber(res and res.status or 0) >= 500 end
    local body, items, pos = tostring(res.body), {}, 1
    while #items < (max_items or 12) do
        local a, b, raw_title = body:find('<div%s+class="apphub_CardContentNewsTitle"[^>]*>(.-)</div>', pos)
        if not a then break end
        local prefix = body:sub(math.max(1, a - 2600), a)
        local link = ""
        for candidate in prefix:gmatch('data%-modal%-content%-url="([^"]+)"') do link = candidate end
        local suffix = body:sub(b + 1, math.min(#body, b + 9000))
        local raw_date = suffix:match('<div%s+class="apphub_CardContentNewsDate"[^>]*>(.-)</div>') or ""
        local raw_text = suffix:match('<div%s+class="apphub_CardTextContent"[^>]*>(.-)</div>') or ""
        local title = clean_markup(raw_title)
        if title ~= "" then
            items[#items + 1] = {
                gid = link:match("/detail/(%d+)") or link,
                title = title,
                url = html_unescape(link),
                contents = clean_markup(raw_text),
                date = parse_english_date(clean_markup(raw_date)),
                feedlabel = "Steam Community",
            }
        end
        pos = b + 1
    end
    return items, false
end

local function oldnews_lines(html)
    local text = tostring(html or "")
    -- Strip non-content first, then create line boundaries around the block
    -- elements used by both the old and current Steam oldnews templates.
    text = text:gsub("<script[^>]*>.-</script>", " ")
        :gsub("<style[^>]*>.-</style>", " ")
        :gsub("<br%s*/?>", "\n")
        :gsub("</[dD][iI][vV]%s*>", "\n")
        :gsub("</[pP]%s*>", "\n")
        :gsub("</[hH][1-6]%s*>", "\n")
        :gsub("</[lL][iI]%s*>", "\n")
        :gsub("</[aA]%s*>", "\n")
        :gsub("<[^>]+>", " ")
    text = html_unescape(text):gsub("\r", "\n")
    local lines = {}
    for raw in text:gmatch("[^\n]+") do
        local line = tostring(raw):gsub("%s+", " "):match("^%s*(.-)%s*$") or ""
        if line ~= "" then lines[#lines + 1] = line end
    end
    return lines
end

local function is_oldnews_navigation_line(value)
    local line = tostring(value or ""):lower():gsub("%s+", " "):match("^%s*(.-)%s*$") or ""
    if line == "" then return true end
    local exact = {
        ["full stories"] = true, ["headlines"] = true, ["channels"] = true,
        ["all news"] = true, ["announcements"] = true, ["client updates"] = true,
        ["press releases"] = true, ["product releases"] = true, ["product updates"] = true,
        ["steam blog"] = true, ["syndicated"] = true, ["related news"] = true,
        ["search news"] = true, ["archive"] = true, ["archives by year"] = true,
        ["steam community announcements"] = true,
    }
    if exact[line] then return true end
    if line:find("click here to try out the steam news hub", 1, true) == 1 then return true end
    if line:find("a steam labs experiment", 1, true) ~= nil then return true end
    return false
end

local function is_oldnews_feed_label(value)
    local line = tostring(value or ""):lower()
    return line:find("community announcements", 1, true) ~= nil
        or line:find("product update", 1, true) ~= nil
        or line:find("product release", 1, true) ~= nil
        or line:find("press release", 1, true) ~= nil
        or line:find("steam blog", 1, true) ~= nil
end

local function fetch_store_oldnews_archive(appid, max_items, feed, enddate)
    local feed_name = tostring(feed or "")
    local end_ts = tonumber(enddate or 0) or 0
    local url = "https://store.steampowered.com/oldnews/?headlines=0&appids=" .. appid
        .. (feed_name ~= "" and ("&feed=" .. util.url_encode(feed_name)) or "")
        .. (end_ts > 0 and ("&enddate=" .. tostring(math.floor(end_ts))) or "")
        .. "&l=english"
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "text/html,*/*", ["User-Agent"] = USER_AGENT },
        timeout = 8,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then
        return {}, not ok_http or not res or tonumber(res and res.status or 0) >= 500
    end

    local lines = oldnews_lines(res.body)
    local items, index = {}, 1
    while index <= #lines and #items < (max_items or MAX_ARCHIVE_ITEMS) do
        local date = parse_english_date(lines[index])
        if date > 0 then
            local title_index = index + 1
            while title_index <= #lines and is_oldnews_navigation_line(lines[title_index]) do
                title_index = title_index + 1
            end
            local title = tostring(lines[title_index] or "")
            if title ~= "" and parse_english_date(title) == 0 and not is_oldnews_feed_label(title) then
                local body_lines = {}
                local cursor = title_index + 1
                while cursor <= #lines do
                    if parse_english_date(lines[cursor]) > 0 then break end
                    local line = tostring(lines[cursor] or "")
                    if is_oldnews_navigation_line(line) then
                        if #body_lines > 0 then break end
                    elseif not is_oldnews_feed_label(line) then
                        body_lines[#body_lines + 1] = line
                        if #table.concat(body_lines, " ") >= 900 then break end
                    end
                    cursor = cursor + 1
                end
                local contents = table.concat(body_lines, " ")
                if #contents > 900 then contents = contents:sub(1, 900) end
                items[#items + 1] = {
                    gid = "oldnews:" .. appid .. ":" .. tostring(date) .. ":" .. title:lower():gsub("[^%w]+", "-"):sub(1, 64),
                    title = title,
                    url = url .. "&enddate=" .. tostring(date + 86400),
                    contents = contents,
                    date = date,
                    feedlabel = feed_name ~= "" and "Steam Archive" or "Steam News Archive",
                    feedname = feed_name ~= "" and feed_name or "steam_oldnews_archive",
                    appid = tonumber(appid) or 0,
                }
            end
        end
        index = index + 1
    end
    return items, false
end

local function add_related_id(result, seen, raw, base_appid)
    local value = tostring(raw or ""):match("(%d+)") or ""
    if value == "" or value == tostring(base_appid) or seen[value] then return end
    seen[value] = true
    result[#result + 1] = value
end

local function collect_related_values(result, seen, value, base_appid)
    if type(value) == "table" then
        for _, item in pairs(value) do add_related_id(result, seen, item, base_appid) end
        return
    end
    local text = tostring(value or "")
    for id in text:gmatch("%d+") do add_related_id(result, seen, id, base_appid) end
end

local function fetch_news_appinfo_context(appid)
    local ok_http, res = pcall(http.get, "https://api.steamcmd.net/v1/info/" .. appid, {
        headers = { ["Accept"] = "application/json", ["User-Agent"] = USER_AGENT },
        timeout = 7,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then
        return { related_appids = {}, release_timestamp = 0 }
    end
    local ok, body = pcall(cjson.decode, res.body)
    local app = ok and type(body) == "table" and type(body.data) == "table" and body.data[appid] or nil
    if type(app) ~= "table" then return { related_appids = {}, release_timestamp = 0 } end
    local result, seen = {}, {}
    local extended = type(app.extended) == "table" and app.extended or {}
    local common = type(app.common) == "table" and app.common or {}
    collect_related_values(result, seen, extended.listofdlc, appid)
    collect_related_values(result, seen, common.listofdlc, appid)
    -- Some historical records expose DLC relationships on depot records even
    -- when listofdlc has disappeared from common/extended AppInfo.
    if type(app.depots) == "table" then
        for _, depot in pairs(app.depots) do
            if type(depot) == "table" then add_related_id(result, seen, depot.dlcappid, appid) end
        end
    end
    -- If the linked item itself is DLC, its parent is also a legitimate source
    -- of historical update context.
    add_related_id(result, seen, extended.dlcforappid or common.dlcforappid, appid)
    while #result > MAX_RELATED_NEWS_APPS do table.remove(result) end
    local release_timestamp = tonumber(common.steam_release_date or extended.steam_release_date or 0) or 0
    return { related_appids = result, release_timestamp = release_timestamp }
end

local function historical_archive_anchors(release_timestamp, items)
    local anchors, seen = {}, {}
    local function add(value)
        local ts = math.floor(tonumber(value or 0) or 0)
        if ts <= 0 or seen[ts] then return end
        seen[ts] = true
        anchors[#anchors + 1] = ts
    end
    local year = 365 * 24 * 60 * 60
    local release_ts = tonumber(release_timestamp or 0) or 0
    if release_ts > 0 then
        add(release_ts + (2 * year))
        add(release_ts + year)
        add(release_ts + math.floor(year / 2))
    end
    local oldest = 0
    for _, item in ipairs(type(items) == "table" and items or {}) do
        local date = tonumber(item.date or 0) or 0
        if date > 0 and (oldest == 0 or date < oldest) then oldest = date end
    end
    if oldest > 0 then
        add(oldest + year)
        add(oldest + math.floor(year / 3))
    end
    while #anchors > 5 do table.remove(anchors) end
    return anchors
end

local function mark_related_items(items, related_appid)
    for _, item in ipairs(type(items) == "table" and items or {}) do
        if type(item) == "table" then
            item.related_appid = tostring(related_appid)
            item.feedlabel = tostring(item.feedlabel or "Steam") .. " · Related content"
        end
    end
    return items
end

local function event_to_news_item(ev)
    if type(ev) ~= "table" then return nil end
    local ann = type(ev.announcement_body) == "table" and ev.announcement_body or {}
    local title = tostring(ann.headline or ev.event_name or "")
    if title == "" then return nil end
    local item = {
        gid = tostring(ev.gid or ann.event_gid or ann.gid or ""),
        title = title,
        contents = tostring(ann.body or ev.event_notes or ""),
        date = tonumber(ann.posttime or ev.rtime32_start_time or 0) or 0,
        event_type = tonumber(ev.event_type or 0) or 0,
        image = "",
        feedlabel = "Steam News",
        appid = tonumber(ev.appid or 0) or 0,
    }
    local clanid = tostring(ann.clanid or "")
    if type(ev.jsondata) == "string" and #ev.jsondata > 2 and clanid ~= "" then
        local okj, jd = pcall(cjson.decode, ev.jsondata)
        if okj and type(jd) == "table" then
            local img = nil
            for _, field in ipairs({ "localized_capsule_image", "localized_title_image" }) do
                local arr = jd[field]
                if not img and type(arr) == "table" then
                    for i = 1, 32 do
                        local value = arr[i]
                        if type(value) == "string" and value ~= "" then img = value; break end
                    end
                end
            end
            if img then item.image = "https://clan.akamai.steamstatic.com/images/" .. clanid .. "/" .. img end
        end
    end
    return item
end

-- Steam still exposes an unauthenticated event-history endpoint used by the
-- native News Hub. Unlike the current News Hub HTML, it can return older
-- partner events directly and is especially useful for delisted apps.
local function fetch_adjacent_partner_events(appid, lang, max_items, event_type_filter)
    local filter = tostring(event_type_filter or "")
    local url = "https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/?appid=" .. appid
        .. "&count_before=0&count_after=" .. tostring(math.max(20, tonumber(max_items) or 50))
        .. (filter ~= "" and ("&event_type_filter=" .. util.url_encode(filter)) or "")
        .. "&l=" .. util.url_encode(lang ~= "" and lang or "english")
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "application/json", ["User-Agent"] = USER_AGENT },
        timeout = 10,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then
        return {}, not ok_http or not res or tonumber(res and res.status or 0) >= 500
    end
    local ok, body = pcall(cjson.decode, res.body)
    local events = ok and type(body) == "table" and body.events or nil
    if type(events) ~= "table" then return {}, false end
    local result = {}
    for _, ev in ipairs(events) do
        local item = event_to_news_item(ev)
        if item then result[#result + 1] = item end
        if #result >= (max_items or 50) then break end
    end
    table.sort(result, function(a, b) return tonumber(a.date or 0) > tonumber(b.date or 0) end)
    return result, false
end

-- Prefer actual game updates/releases/news over sales and generic promotions.
-- If an old title has no events in these relevant categories we still retry
-- the unfiltered endpoint so legitimate historical event types are not lost.
local function fetch_relevant_partner_events(appid, lang, max_items)
    local relevant, transient = fetch_adjacent_partner_events(appid, lang, max_items, "12,13,14,15,28,29,30,32")
    if #relevant > 0 then return relevant, transient end
    local all_items, all_transient = fetch_adjacent_partner_events(appid, lang, max_items, "")
    return all_items, transient or all_transient
end

function M.fetch_news(steam_app_id, language)
    local appid, safe_language = util.normalize_appid_and_language(steam_app_id, language)
    if not appid:match("^%d+$") then
        return cjson.encode({ error = "invalid_appid", appnews = { newsitems = {} } })
    end
    local lang = safe_language:gsub("[^%w_]", "")
    local appinfo_context = nil

    -- Start with official Web API data. A sparse result is not terminal: old
    -- games frequently retain richer history in Steam's server-rendered
    -- oldnews archive than in ISteamNews.
    local announcements, transient_a = fetch_news_json(appid, lang, true)
    local news = announcements
    local source = "steam_news_web_api"
    local transient_error = transient_a

    if #news < TARGET_NEWS_ITEMS then
        local all_feeds, transient_b = fetch_news_json(appid, lang, false)
        news = merge_news_lists(news, all_feeds)
        transient_error = transient_error or transient_b
        if #all_feeds > 0 then source = "steam_old_news" end
    end

    -- Query the same event-history surface used by Steam's News Hub before
    -- falling back to HTML archives. This is generic for every AppID and can
    -- recover events that the public ISteamNews endpoint no longer returns.
    if #news < TARGET_NEWS_ITEMS then
        local adjacent, adjacent_transient = fetch_relevant_partner_events(appid, lang, 50)
        news = merge_news_lists(news, adjacent)
        transient_error = transient_error or adjacent_transient
        if #adjacent > 0 then source = "steam_adjacent_partner_events" end
    end

    -- English is the archival fallback language. The frontend always asks for
    -- an English sibling feed when the Steam client is using another language,
    -- so this expensive archival expansion happens once rather than twice.
    if lang == "english" and #news < TARGET_NEWS_ITEMS then
        local archived_announcements, archive_transient = fetch_store_oldnews_archive(
            appid, MAX_ARCHIVE_ITEMS, "steam_community_announcements")
        news = merge_news_lists(news, archived_announcements)
        transient_error = transient_error or archive_transient
        if #archived_announcements > 0 then source = "steam_oldnews_archive" end
    end

    -- Generic related-content recovery: DLCs and parent apps are discovered
    -- from Steam AppInfo, never from a per-game hardcode. This is important for
    -- retired base games whose updates were historically posted under a Data
    -- Pack / DLC AppID instead of the base AppID.
    if lang == "english" and #news < TARGET_NEWS_ITEMS then
        appinfo_context = appinfo_context or fetch_news_appinfo_context(appid)
        local related_appids = appinfo_context.related_appids or {}
        for _, related_appid in ipairs(related_appids) do
            if #news >= TARGET_NEWS_ITEMS then break end
            local related_adjacent, related_adjacent_transient = fetch_relevant_partner_events(related_appid, "english", 30)
            news = merge_news_lists(news, mark_related_items(related_adjacent, related_appid))
            transient_error = transient_error or related_adjacent_transient
            local related_news, related_transient = fetch_news_json(related_appid, "english", false)
            news = merge_news_lists(news, mark_related_items(related_news, related_appid))
            transient_error = transient_error or related_transient
            if #news < TARGET_NEWS_ITEMS then
                local related_archive, related_archive_transient = fetch_store_oldnews_archive(
                    related_appid, 8, "steam_community_announcements")
                news = merge_news_lists(news, mark_related_items(related_archive, related_appid))
                transient_error = transient_error or related_archive_transient
            end
            if #news < TARGET_NEWS_ITEMS then
                local related_anchors = historical_archive_anchors(appinfo_context.release_timestamp, news)
                for _, anchor in ipairs(related_anchors) do
                    if #news >= TARGET_NEWS_ITEMS then break end
                    local related_history, related_history_transient = fetch_store_oldnews_archive(related_appid, 8, "", anchor)
                    news = merge_news_lists(news, mark_related_items(related_history, related_appid))
                    transient_error = transient_error or related_history_transient
                end
            end
        end
        if #related_appids > 0 and #news > #announcements then source = "steam_news_plus_related_appids" end
    end

    -- The default oldnews page points at the current archive year. For retired
    -- games that can be a decade after release and therefore contain nothing.
    -- Rewind the archive generically around the Steam release timestamp (or the
    -- oldest surviving item) and probe the update/release channels explicitly.
    if lang == "english" and #news < TARGET_NEWS_ITEMS then
        appinfo_context = appinfo_context or fetch_news_appinfo_context(appid)
        local anchors = historical_archive_anchors(appinfo_context.release_timestamp, news)
        local feeds = { "steam_updates", "steam_release", "steam_community_announcements", "" }
        for _, anchor in ipairs(anchors) do
            if #news >= TARGET_NEWS_ITEMS then break end
            for _, feed in ipairs(feeds) do
                if #news >= TARGET_NEWS_ITEMS then break end
                local historical, historical_transient = fetch_store_oldnews_archive(appid, 12, feed, anchor)
                news = merge_news_lists(news, historical)
                transient_error = transient_error or historical_transient
            end
        end
        if #news > #announcements then source = "steam_historical_archive_rewind" end
    end

    -- If official announcement channels remain sparse, the all-channel oldnews
    -- archive may contain product updates/releases or syndicated historical
    -- coverage associated with the same AppID. It is still Steam-filtered by
    -- AppID and therefore cannot leak cards from unrelated games.
    if lang == "english" and #news < TARGET_NEWS_ITEMS then
        local archive_all, archive_all_transient = fetch_store_oldnews_archive(appid, MAX_ARCHIVE_ITEMS, "")
        news = merge_news_lists(news, archive_all)
        transient_error = transient_error or archive_all_transient
        if #archive_all > 0 then source = "steam_oldnews_all_channels" end
    end

    if lang == "english" and #news < TARGET_NEWS_ITEMS then
        local rss_items, rss_transient = fetch_community_rss(appid, 12)
        news = merge_news_lists(news, rss_items)
        transient_error = transient_error or rss_transient
        if #rss_items > 0 then source = "steam_news_plus_community_rss" end
    end
    if lang == "english" and #news < TARGET_NEWS_ITEMS then
        local historical_items, historical_transient = fetch_community_allnews(appid, 12)
        news = merge_news_lists(news, historical_items)
        transient_error = transient_error or historical_transient
        if #historical_items > 0 then source = "steam_news_plus_community_archive" end
    end

    local is_available = #news > 0
    if logger and logger.info then
        logger:info(string.format("[NGL][News] appid=%s lang=%s items=%d source=%s related=%d",
            appid, lang, #news, source, appinfo_context and #(appinfo_context.related_appids or {}) or 0))
    end
    return cjson.encode({
        items = news,
        available = is_available,
        unavailable = not is_available and not transient_error,
        transient_error = transient_error and not is_available,
        source = source,
        target_count = TARGET_NEWS_ITEMS,
    })
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

    if partner_events_unavailable[appid] then
        lru.touch(partner_events_unavailable[appid])
        return {}, true, false
    end

    local function mark_unavailable()
        lru.put(partner_events_unavailable, appid, {}, PARTNER_UNAVAILABLE_CACHE_LIMIT)
    end

    -- The old ajaxgetpartnereventspage endpoint is gone; the news hub page
    -- embeds the same event data in its data-initialEvents attribute
    local url = "https://store.steampowered.com/news/app/" .. appid .. "?l=" .. lang
    local ok, res = pcall(http.get, url, {
        headers = { ["Accept"] = "text/html,*/*", ["User-Agent"] = USER_AGENT },
        timeout = 20
    })
    if not ok or not res or res.status ~= 200 or not res.body then
        -- A missing/deleted Store application is an expected no-content case.
        -- Do not turn it into a warning that looks like a plugin failure.
        if res and (res.status == 404 or res.status == 410) then
            mark_unavailable()
            return {}, true, false
        end
        return {}, false, true
    end

    local marker = 'data-initialEvents="'
    local a = res.body:find(marker, 1, true) or res.body:find('data-initialevents="', 1, true)
    if not a then
        return {}, false, true
    end
    local vstart = a + #marker
    local vend = res.body:find('"', vstart, true)
    if not vend then
        return {}, false, true
    end

    local ok2, body = pcall(cjson.decode, html_unescape(res.body:sub(vstart, vend - 1)))
    if not ok2 or type(body) ~= "table" or type(body.events) ~= "table" then
        return {}, false, true
    end

    local items = {}
    for _, ev in ipairs(body.events) do
        local item = event_to_news_item(ev)
        if item then table.insert(items, item) end
        if #items >= max then break end
    end

    return items, false, false
end

function M.fetch_partner_events(steam_app_id, language)
    local appid, safe_language = util.normalize_appid_and_language(steam_app_id, language)
    if not appid:match("^%d+$") then
        return cjson.encode({ items = {}, available = false, error = "invalid_appid" })
    end
    local lang = safe_language:gsub("[^%w_]", "")
    if lang == "" then lang = "english" end
    local adjacent, adjacent_transient = fetch_relevant_partner_events(appid, lang, 50)
    local scraped, unavailable, scrape_transient = scrape_partner_events(appid, lang, 50)
    local items = merge_news_lists(adjacent, scraped)
    return cjson.encode({
        items = items,
        available = #items > 0,
        unavailable = unavailable == true and #items == 0,
		transient_error = (adjacent_transient or scrape_transient) == true and #items == 0,
        source = #adjacent > 0 and "steam_adjacent_partner_events" or "steam_store_partner_events",
    })
end

return M
end
