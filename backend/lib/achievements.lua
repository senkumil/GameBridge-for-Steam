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
local get_config_path = config.get_config_path
local html_unescape = util.html_unescape
local local_achievement_meta_cache = {}

local function expand_environment_variables(str)
    if not str or str == "" then return "" end
    return str:gsub("%%([^%%]+)%%", function(var)
        local val = os.getenv(var)
        return val or ("%" .. var .. "%")
    end)
end

local function default_achievement_root()
    local appdata = os.getenv("APPDATA")
    if appdata and appdata ~= "" then
        if fs.exists(fs.join(appdata, "GSE Saves")) then
            return fs.join(appdata, "GSE Saves")
        end
        if fs.exists(fs.join(appdata, "Goldberg SteamEmu Saves")) then
            return fs.join(appdata, "Goldberg SteamEmu Saves")
        end
        return fs.join(appdata, "GSE Saves")
    end
    local localappdata = os.getenv("LOCALAPPDATA")
    if localappdata and localappdata ~= "" and fs.exists(fs.join(localappdata, "GSE Saves")) then
        return fs.join(localappdata, "GSE Saves")
    end
    local userprofile = os.getenv("USERPROFILE")
    if userprofile and userprofile ~= "" then
        return fs.join(userprofile, "AppData", "Roaming", "GSE Saves")
    end
    return "C:\\Users\\" .. tostring(os.getenv("USERNAME") or "User") .. "\\AppData\\Roaming\\GSE Saves"
end

local function achievement_base_path_config_path()
    local backend_dir = MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or ""
    local plugin_dir = fs.parent_path(backend_dir)
    if not plugin_dir or plugin_dir == "" then
        plugin_dir = fs.parent_path(get_config_path())
    end
    return fs.join(plugin_dir, "achievement_base_path.txt")
end

local function achievement_game_paths_config_path()
    local backend_dir = MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or ""
    local plugin_dir = fs.parent_path(backend_dir)
    if not plugin_dir or plugin_dir == "" then
        plugin_dir = fs.parent_path(get_config_path())
    end
    return fs.join(plugin_dir, "achievement_paths.json")
end

local function read_text_file(path)
    if not path or path == "" then return nil end
    local f = io.open(path, "rb")
    if not f then
        local alt = path:gsub("\\", "/")
        f = io.open(alt, "rb")
    end
    if not f then
        local alt2 = path:gsub("/", "\\")
        f = io.open(alt2, "rb")
    end
    if not f then return nil end
    local s = f:read("*a")
    f:close()
    return s
end

local function file_exists(path)
    local s = read_text_file(path)
    return s ~= nil
end

local function local_achievement_root()
    local cfg = achievement_base_path_config_path()
    if cfg ~= "" and file_exists(cfg) then
        local s = read_text_file(cfg)
        if s then
            s = tostring(s):gsub("^%s+", ""):gsub("%s+$", "")
            if s ~= "" and s:lower() ~= "c:\\steam auto" and s:lower() ~= "c:/steam auto" then
                return expand_environment_variables(s)
            end
        end
    end
    return default_achievement_root()
end

local function normalize_achievement_base_path(value)
    local path = tostring(value or "")
    path = path:gsub("^%s+", ""):gsub("%s+$", "")
    local quoted = path:match('^"(.-)"$')
    if quoted then path = quoted end
    if path == "" or path:lower() == "c:\\steam auto" or path:lower() == "c:/steam auto" then
        path = default_achievement_root()
    else
        path = expand_environment_variables(path)
    end
    if #path > 4096 or path:find("%z") or path:find("[\r\n]") then return nil end
    return path
end

local function normalize_game_achievement_path(value)
    local path = tostring(value or "")
    path = path:gsub("^%s+", ""):gsub("%s+$", "")
    local quoted = path:match('^"(.-)"$')
    if quoted then path = quoted end
    if #path > 4096 or path:find("%z") or path:find("[\r\n]") then return nil end
    return path
end

local function read_game_achievement_paths()
    local content = read_text_file(achievement_game_paths_config_path())
    if not content or content == "" then return {} end
    local ok, data = pcall(cjson.decode, content)
    if not ok or type(data) ~= "table" then
        logger:warn("Failed to parse per-game achievement paths")
        return {}
    end
    local result = {}
    for key, value in pairs(data) do
        if type(key) == "string" and type(value) == "string" and value ~= "" then
            result[key] = value
        end
    end
    return result
end

local function write_game_achievement_paths(data)
    local path = achievement_game_paths_config_path()
    local dir = fs.parent_path(path)
    if dir and dir ~= "" and not fs.exists(dir) then fs.create_directories(dir) end
    local f, err = io.open(path, "wb")
    if not f then
        logger:warn("Could not save per-game achievement paths: " .. tostring(err))
        return false
    end
    f:write(cjson.encode(data))
    f:close()
    return true
end

local function parse_achievement_path_request(request_json)
    if type(request_json) == "table" then return request_json end
    if type(request_json) == "string" and request_json ~= "" then
        local ok, request = pcall(cjson.decode, request_json)
        if ok and type(request) == "table" then return request end
    end
    return {}
end

local function game_achievement_path_keys(request)
    local keys, seen = {}, {}
    local function add(prefix, value)
        local id = tostring(value or "")
        if id:match("^%d+$") then
            local key = prefix .. id
            if not seen[key] then
                seen[key] = true
                keys[#keys + 1] = key
            end
        end
    end
    add("shortcut:", request.shortcut_app_id or request.state_app_id or request.local_app_id)
    add("appid:", request.steam_app_id or request.appid)
    return keys
end

local function achievement_source_status(path)
    if not path or path == "" then return false, false end
    local lower = path:lower()
    if lower:match("%.json$") then
        local exists = file_exists(path)
        return exists, exists
    end
    local exists = fs.exists(path)
    local usable = file_exists(fs.join(path, "achievements.json"))
        or file_exists(fs.join(path, "stats", "achievements.json"))
        or file_exists(fs.join(path, "steam_settings", "achievements.json"))
    return exists, usable
end

local function configured_game_achievement_path(state_appid, metadata_appid)
    local paths = read_game_achievement_paths()
    local request = {
        shortcut_app_id = state_appid,
        steam_app_id = metadata_appid,
    }
    for _, key in ipairs(game_achievement_path_keys(request)) do
        local path = paths[key]
        if type(path) == "string" and path ~= "" then return path, key end
    end
    return nil, nil
end

function M.get_achievement_base_path()
    local path = local_achievement_root()
    return cjson.encode({
        ok = true,
        path = path,
        exists = fs.exists(path),
        configured = file_exists(achievement_base_path_config_path()),
    })
end

function M.set_achievement_base_path(path)
    local normalized = normalize_achievement_base_path(path)
    if not normalized then
        return cjson.encode({ ok = false, error = "invalid_path" })
    end

    local cfg = achievement_base_path_config_path()
    local f, err = io.open(cfg, "wb")
    if not f then
        logger:warn("Could not save achievement base path: " .. tostring(err))
        return cjson.encode({ ok = false, error = "write_failed" })
    end
    f:write(normalized)
    f:close()
    local_achievement_meta_cache = {}
    logger:info("Achievement base path updated: " .. normalized)
    return cjson.encode({ ok = true, path = normalized, exists = fs.exists(normalized) })
end

function M.get_game_achievement_path(request_json)
    local request = parse_achievement_path_request(request_json)
    local keys = game_achievement_path_keys(request)
    if #keys == 0 then
        return cjson.encode({ ok = false, error = "missing_game_id" })
    end
    local paths = read_game_achievement_paths()
    for _, key in ipairs(keys) do
        local path = paths[key]
        if type(path) == "string" and path ~= "" then
            local exists, usable = achievement_source_status(path)
            return cjson.encode({
                ok = true,
                configured = true,
                key = key,
                path = path,
                exists = exists,
                usable = usable,
            })
        end
    end
    return cjson.encode({ ok = true, configured = false, path = "", exists = false, usable = false })
end

function M.set_game_achievement_path(request_json)
    local request = parse_achievement_path_request(request_json)
    local keys = game_achievement_path_keys(request)
    if #keys == 0 then
        return cjson.encode({ ok = false, error = "missing_game_id" })
    end
    local path = normalize_game_achievement_path(request.path)
    if path == nil then
        return cjson.encode({ ok = false, error = "invalid_path" })
    end

    local paths = read_game_achievement_paths()
    local key = keys[1]
    if path == "" then
        -- A path may have been saved under the official AppID before Steam's
        -- local shortcut ID was available. Clear every alias for this game so
        -- "Use automatic" cannot resurrect that older override.
        for _, candidate_key in ipairs(keys) do paths[candidate_key] = nil end
    else
        paths[key] = path
    end
    if not write_game_achievement_paths(paths) then
        return cjson.encode({ ok = false, error = "write_failed" })
    end

    local_achievement_meta_cache = {}
    local exists, usable = achievement_source_status(path)
    logger:info((path == "" and "Cleared" or "Updated")
        .. " per-game achievement path for " .. key
        .. (path ~= "" and (": " .. path) or ""))
    return cjson.encode({
        ok = true,
        configured = path ~= "",
        key = key,
        path = path,
        exists = exists,
        usable = usable,
    })
end

local function decode_json_file(path)
    local s = read_text_file(path)
    if not s or s == "" then return nil end
    local ok, data = pcall(cjson.decode, s)
    if not ok or type(data) ~= "table" then
        logger:warn("Local achievements JSON parse failed: " .. tostring(path))
        return nil
    end
    return data
end

local function clean_html_text(s)
    s = tostring(s or "")
    s = s:gsub("<br%s*/?>", " ")
    s = s:gsub("<.->", "")
    s = html_unescape(s)
    s = s:gsub("&nbsp;", " ")
    s = s:gsub("&#(%d+);", function(n)
        local v = tonumber(n)
        if v and v >= 32 and v <= 126 then return string.char(v) end
        return ""
    end)
    s = s:gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
    return s
end

local function achievement_icon_url(appid, icon)
    icon = tostring(icon or "")
    if icon == "" then return "" end
    if icon:match("^https?://") then return icon end
    local base = icon:match("([^/\\]+)$") or icon
    if base == "" then return "" end
    if not base:match("%.[%w]+$") then base = base .. ".jpg" end
    return "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/" .. tostring(appid) .. "/" .. base
end

local function fetch_global_achievement_percentages(appid)
    local url = "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=" .. tostring(appid)
    local ok, res = pcall(http.get, url, {
        headers = { ["Accept"] = "application/json" },
        timeout = 15
    })
    if not ok or not res or res.status ~= 200 or not res.body then return {}, {} end
    local okj, body = pcall(cjson.decode, res.body)
    if not okj or type(body) ~= "table" then return {}, {} end
    local list = body.achievementpercentages and body.achievementpercentages.achievements
    if type(list) ~= "table" then return {}, {} end
    local by_name, ordered = {}, {}
    for _, a in ipairs(list) do
        if type(a) == "table" and a.name then
            local row = { name = tostring(a.name), percent = tonumber(a.percent) or 0 }
            by_name[row.name] = row.percent
            ordered[#ordered + 1] = row
        end
    end
    return by_name, ordered
end

local function map_to_steam_lang(lang)
    lang = tostring(lang or "spanish"):lower():gsub("[^%w_]", "")
    if lang:find("spanish") or lang:find("latam") or lang:find("es") then
        return "spanish"
    end
    if lang:find("french") or lang:find("fr") then return "french" end
    if lang:find("german") or lang:find("de") then return "german" end
    if lang:find("italian") or lang:find("it") then return "italian" end
    if lang:find("portuguese") or lang:find("brazilian") or lang:find("pt") then return "brazilian" end
    if lang:find("russian") or lang:find("ru") then return "russian" end
    if lang:find("japanese") or lang:find("ja") then return "japanese" end
    if lang:find("korean") or lang:find("ko") then return "koreana" end
    if lang:find("schinese") or lang:find("zh_cn") or lang:find("zh_hans") then return "schinese" end
    if lang:find("tchinese") or lang:find("zh_tw") or lang:find("zh_hant") then return "tchinese" end
    return "english"
end

local function extract_localized_text(val, lang)
    if type(val) == "string" then
        return val
    elseif type(val) == "table" then
        local target = map_to_steam_lang(lang)
        if val[target] and tostring(val[target]) ~= "" then
            return tostring(val[target])
        end
        if target == "spanish" then
            if val["spanish"] and tostring(val["spanish"]) ~= "" then return tostring(val["spanish"]) end
            if val["latam"] and tostring(val["latam"]) ~= "" then return tostring(val["latam"]) end
            if val["spanish_latam"] and tostring(val["spanish_latam"]) ~= "" then return tostring(val["spanish_latam"]) end
            if val["es"] and tostring(val["es"]) ~= "" then return tostring(val["es"]) end
            if val["es-ES"] and tostring(val["es-ES"]) ~= "" then return tostring(val["es-ES"]) end
            if val["es-419"] and tostring(val["es-419"]) ~= "" then return tostring(val["es-419"]) end
        end
        if val["english"] and tostring(val["english"]) ~= "" then return tostring(val["english"]) end
        if val["en"] and tostring(val["en"]) ~= "" then return tostring(val["en"]) end
        for _, v in pairs(val) do
            if type(v) == "string" and v ~= "" then return v end
        end
    end
    return ""
end

local function fetch_community_achievement_rows(appid, lang)
    local steam_lang = map_to_steam_lang(lang)
    local url = "https://steamcommunity.com/stats/" .. tostring(appid) .. "/achievements?l=" .. steam_lang
    local cookie_header = "birthtime=0; mature_content=1; wants_mature_content=1; Steam_Language=" .. steam_lang .. ";"
    local ok, res = pcall(http.get, url, {
        headers = {
            ["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ["Cookie"] = cookie_header,
        },
        timeout = 20
    })
    if not ok or not res or res.status ~= 200 or not res.body then
        logger:warn("Community achievement rows fetch failed for appid " .. tostring(appid))
        return {}
    end
    local html = res.body
    local starts, pos = {}, 1
    while true do
        local s, _ = html:find('<div class="achieveRow[%s"]', pos)
        if not s then break end
        starts[#starts + 1] = s
        pos = s + 15
    end
    local rows = {}
    for i, s in ipairs(starts) do
        local e = (starts[i + 1] or (#html + 1)) - 1
        local chunk = html:sub(s, e)
        local icon = chunk:match('<img[^>]-src="([^"]+)"') or ""
        local pct = chunk:match('class="achievePercent"[^>]*>%s*([%d%.,]+)%%')
        local title = chunk:match('<h3[^>]*>(.-)</h3>') or ""
        local desc = chunk:match('<h5[^>]*>(.-)</h5>') or ""
        pct = pct and pct:gsub(",", ".") or "0"
        rows[#rows + 1] = {
            title = clean_html_text(title),
            description = clean_html_text(desc),
            icon = html_unescape(icon),
            percent = tonumber(pct) or 0,
        }
    end
    logger:info("Community achievement rows: " .. #rows .. " parsed for appid " .. tostring(appid) .. " (lang: " .. steam_lang .. ")")
    return rows
end

local function normalize_local_schema(appid, root_dir, lang)
    local appdata = os.getenv("APPDATA") or ""
    local localappdata = os.getenv("LOCALAPPDATA") or ""
    local userprofile = os.getenv("USERPROFILE") or ""
    if appdata == "" and userprofile ~= "" then
        appdata = fs.join(userprofile, "AppData", "Roaming")
    end
    if localappdata == "" and userprofile ~= "" then
        localappdata = fs.join(userprofile, "AppData", "Local")
    end

    local candidates = {
        fs.join(root_dir, "achievement_definitions.json"),
        fs.join(root_dir, "schema.json"),
        fs.join(root_dir, "steam_settings", "achievements.json"),
        fs.join(root_dir, "definitions", "achievements.json"),
    }

    local function add_schema_candidate(p)
        if p and p ~= "" then candidates[#candidates + 1] = p end
    end

    -- Modern Goldberg:
    if appdata ~= "" then
        add_schema_candidate(fs.join(appdata, "Goldberg SteamEmu Saves", tostring(appid), "achievement_definitions.json"))
        add_schema_candidate(fs.join(appdata, "Goldberg SteamEmu Saves", tostring(appid), "schema.json"))
        add_schema_candidate(fs.join(appdata, "Goldberg SteamEmu Saves", tostring(appid), "steam_settings", "achievements.json"))
        add_schema_candidate(fs.join(appdata, "Goldberg SteamEmu Saves", "settings", tostring(appid), "achievements.json"))
        add_schema_candidate(fs.join(appdata, "Goldberg SteamEmu Saves", "settings", tostring(appid), "schema.json"))
    end

    -- Legacy Goldberg / Steam emulator:
    if appdata ~= "" then
        add_schema_candidate(fs.join(appdata, "Steam", tostring(appid), "schema.json"))
        add_schema_candidate(fs.join(appdata, "Steam", tostring(appid), "achievement_definitions.json"))
        add_schema_candidate(fs.join(appdata, "Steam", tostring(appid), "stats", "achievements.json"))
        add_schema_candidate(fs.join(appdata, "Steam", tostring(appid), "steam_settings", "achievements.json"))
    end

    -- LocalAppData Goldberg:
    if localappdata ~= "" then
        add_schema_candidate(fs.join(localappdata, "Goldberg SteamEmu Saves", tostring(appid), "schema.json"))
        add_schema_candidate(fs.join(localappdata, "Goldberg SteamEmu Saves", tostring(appid), "achievement_definitions.json"))
    end

    -- GSE Saves:
    if appdata ~= "" then
        add_schema_candidate(fs.join(appdata, "GSE Saves", tostring(appid), "schema.json"))
        add_schema_candidate(fs.join(appdata, "GSE Saves", tostring(appid), "achievement_definitions.json"))
    end
    if localappdata ~= "" then
        add_schema_candidate(fs.join(localappdata, "GSE Saves", tostring(appid), "schema.json"))
    end

    -- Achievement Watcher schema cache:
    if appdata ~= "" then
        add_schema_candidate(fs.join(appdata, "Achievement Watcher", "steam_cache", "schema", "latam", tostring(appid) .. ".db"))
        add_schema_candidate(fs.join(appdata, "Achievement Watcher", "steam_cache", "schema", "spanish", tostring(appid) .. ".db"))
        add_schema_candidate(fs.join(appdata, "Achievement Watcher", "steam_cache", "schema", tostring(appid) .. ".db"))
    end
    for _, path in ipairs(candidates) do
        local data = decode_json_file(path)
        if data then
            local result = {}
            if type(data) == "table" then
                local list = (data.achievement and data.achievement.list) or data.achievements or data
                if type(list) == "table" then
                    for k, v in pairs(list) do
                        local a = (type(v) == "table") and v or {}
                        local name = tostring(a.name or a.id or k)
                        if name and name ~= "" then
                            local display = extract_localized_text(a.displayName or a.display_name or a.name_localized or a.title, lang)
                            if display == "" then display = name end
                            local desc = extract_localized_text(a.description or a.desc or a.description_localized, lang)
                            result[name] = {
                                name = name,
                                title = display,
                                description = desc,
                                icon = achievement_icon_url(appid, a.icon or a.icon_normal or a.iconNormal or ""),
                                icongray = achievement_icon_url(appid, a.icongray or a.icon_gray or a.icon_locked or a.iconLocked or ""),
                                hidden = a.hidden == true or tonumber(a.hidden) == 1,
                            }
                        end
                    end
                end
            end
            if next(result) then
                logger:info("Local achievement schema loaded: " .. path)
                return result, path
            end
        end
    end
    return {}, ""
end

local function match_public_metadata(appid, lang, root_dir)
    local key = tostring(appid) .. "|" .. tostring(lang or "spanish")
    local now = os.time()
    local cached = local_achievement_meta_cache[key]
    if cached and (now - (cached.time or 0)) < 1800 then
        return cached.by_name or {}, cached.source or "cache"
    end

    local schema, schema_path = normalize_local_schema(appid, root_dir, lang)
    local global_by_name, global_ordered = fetch_global_achievement_percentages(appid)
    local community = fetch_community_achievement_rows(appid, lang)
    if tostring(lang):lower() ~= "english" and #community == 0 then
        community = fetch_community_achievement_rows(appid, "english")
    end

    if next(schema) then
        local community_by_icon = {}
        for idx, row in ipairs(community) do
            local base = tostring(row.icon or ""):match("([^/]+)$")
            if base then community_by_icon[base] = row end
        end
        local schema_list = {}
        for name, m in pairs(schema) do
            schema_list[#schema_list + 1] = m
        end
        for idx, m in ipairs(schema_list) do
            m.global_percent = tonumber(global_by_name[m.name]) or 0
            local base = tostring(m.icon or ""):match("([^/]+)$")
            local row = (base and community_by_icon[base]) or community[idx]
            if row then
                if row.title ~= "" then m.title = row.title end
                if row.description ~= "" then m.description = row.description end
                if row.icon ~= "" and (m.icon == "" or not m.icon:find("^https?://")) then m.icon = row.icon end
            end
        end
        local_achievement_meta_cache[key] = { time = now, by_name = schema, source = "local_schema:" .. schema_path }
        return schema, "local_schema:" .. schema_path
    end

    -- Match global percentage order to community order
    local result, used = {}, {}
    for idx, g in ipairs(global_ordered) do
        local best_i, best_diff = nil, 999
        for i, row in ipairs(community) do
            if not used[i] then
                local diff = math.abs((tonumber(row.percent) or 0) - (tonumber(g.percent) or 0))
                if diff < best_diff then
                    best_diff = diff
                    best_i = i
                end
            end
        end
        -- If within reasonable tolerance, take best match; otherwise fallback to exact index match if available
        if (not best_i or best_diff > 1.5) and community[idx] and not used[idx] then
            best_i = idx
        end

        if best_i and community[best_i] then
            used[best_i] = true
            local row = community[best_i]
            result[g.name] = {
                name = g.name,
                title = (row.title ~= "" and row.title) or g.name,
                description = row.description or "",
                icon = row.icon or "",
                icongray = "",
                hidden = (row.description == "" or row.title:match("^%?%?%?")),
                global_percent = tonumber(g.percent) or tonumber(row.percent) or 0,
            }
        else
            result[g.name] = {
                name = g.name,
                title = g.name,
                description = "",
                icon = "",
                icongray = "",
                hidden = false,
                global_percent = tonumber(g.percent) or 0,
            }
        end
    end

    if not next(result) and #community > 0 then
        for i, row in ipairs(community) do
            local pseudo_name = string.format("ACH_%04d", i - 1)
            result[pseudo_name] = {
                name = pseudo_name,
                title = (row.title ~= "" and row.title) or pseudo_name,
                description = row.description or "",
                icon = row.icon or "",
                icongray = "",
                hidden = (row.description == "" or row.title:match("^%?%?%?")),
                global_percent = tonumber(row.percent) or 0,
            }
        end
    end

    local_achievement_meta_cache[key] = { time = now, by_name = result, source = "steam_public" }
    return result, "steam_public"
end

function M.fetch_local_achievement_data(request_json, language, state_app_id)
    local steam_app_id = request_json
    local allow_simulated = false

    -- The Millennium Lua host iterates JSON object values in key order before
    -- invoking a function.  A single JSON-string argument avoids positional
    -- corruption when a request contains language + two different AppIDs.
    if type(request_json) == "string" and not request_json:match("^%d+$") then
        local ok_request, request = pcall(cjson.decode, request_json)
        if ok_request and type(request) == "table" then
            steam_app_id = request.steam_app_id or request.appid or request[1]
            language = request.language or language
            allow_simulated = request.allow_simulated == true
            state_app_id = request.state_app_id
                or request.shortcut_app_id
                or request.local_app_id
                or state_app_id
        end
    elseif type(request_json) == "table" then
        language = request_json.language or language
        allow_simulated = request_json.allow_simulated == true
        -- A non-Steam shortcut has its own unsigned Steam shortcut ID.  Some
        -- emulators/Achievement Watcher setups write their live achievement
        -- state under that ID, while the linked Steam AppID is still needed
        -- for the public schema, names and icon URLs.
        state_app_id = request_json.state_app_id
            or request_json.shortcut_app_id
            or request_json.local_app_id
            or state_app_id
        steam_app_id = request_json.steam_app_id or request_json.appid or request_json[1]
    end
    local metadata_appid = tostring(steam_app_id or "")
    if not metadata_appid:match("^%d+$") then
        return cjson.encode({ found = false, error = "invalid_appid" })
    end
    local state_appid = tostring(state_app_id or "")
    if not state_appid:match("^%d+$") then state_appid = metadata_appid end
    local lang = tostring(language or "english"):gsub("[^%w_]", "")
    if lang == "" then lang = "english" end

    local root = local_achievement_root()
    local metadata_dir = fs.join(root, metadata_appid)

    -- Prefer the official linked Steam AppID because it is stable across
    -- shortcut renames/re-creations.  Retain the active shortcut AppID as a
    -- compatibility fallback for older emulator layouts.
    local candidate_states, seen_paths = {}, {}
    local function add_state_path(path, source_appid, schema_dir, source)
        if path and path ~= "" and not seen_paths[path] then
            seen_paths[path] = true
            candidate_states[#candidate_states + 1] = {
                path = path,
                appid = source_appid,
                schema_dir = schema_dir,
                source = source or "appid_folder",
            }
        end
    end

    -- A source configured in this shortcut's Properties is intentionally
    -- checked first. It may be a loose JSON file or a folder containing it.
    local explicit_path, explicit_key = configured_game_achievement_path(state_appid, metadata_appid)
    if explicit_path and explicit_path ~= "" then
        if explicit_path:lower():match("%.json$") then
            add_state_path(explicit_path, state_appid, fs.parent_path(explicit_path), "per_game:" .. tostring(explicit_key))
        else
            add_state_path(fs.join(explicit_path, "achievements.json"), state_appid, explicit_path, "per_game:" .. tostring(explicit_key))
            add_state_path(fs.join(explicit_path, "stats", "achievements.json"), state_appid, explicit_path, "per_game:" .. tostring(explicit_key))
            add_state_path(fs.join(explicit_path, "steam_settings", "achievements.json"), state_appid, explicit_path, "per_game:" .. tostring(explicit_key))
        end
    end

    local function add_state_paths_for(appid)
        local dir = fs.join(root, appid)
        add_state_path(fs.join(dir, "achievements.json"), appid, dir, "configured_root")
        add_state_path(fs.join(dir, "stats", "achievements.json"), appid, dir, "configured_root")
        add_state_path(fs.join(dir, "steam_settings", "achievements.json"), appid, dir, "configured_root")

        local appdata = os.getenv("APPDATA") or ""
        local localappdata = os.getenv("LOCALAPPDATA") or ""
        local userprofile = os.getenv("USERPROFILE") or ""
        if appdata == "" and userprofile ~= "" then
            appdata = fs.join(userprofile, "AppData", "Roaming")
        end
        if localappdata == "" and userprofile ~= "" then
            localappdata = fs.join(userprofile, "AppData", "Local")
        end

        -- 1. Modern Goldberg emulator paths:
        -- %APPDATA%\Goldberg SteamEmu Saves\<AppID>\
        if appdata ~= "" then
            local g_modern = fs.join(appdata, "Goldberg SteamEmu Saves", tostring(appid))
            add_state_path(fs.join(g_modern, "achievements.json"), appid, g_modern, "goldberg_modern")
            add_state_path(fs.join(g_modern, "stats", "achievements.json"), appid, g_modern, "goldberg_modern")
            add_state_path(fs.join(g_modern, "steam_settings", "achievements.json"), appid, g_modern, "goldberg_modern")
            add_state_path(fs.join(g_modern, "achievements.ini"), appid, g_modern, "goldberg_modern")

            -- Goldberg settings/<AppID>
            local g_settings = fs.join(appdata, "Goldberg SteamEmu Saves", "settings", tostring(appid))
            add_state_path(fs.join(g_settings, "achievements.json"), appid, g_settings, "goldberg_settings")
            add_state_path(fs.join(g_settings, "stats", "achievements.json"), appid, g_settings, "goldberg_settings")
        end

        -- 2. Legacy Goldberg / Steam emulator paths:
        -- %APPDATA%\Steam\<AppID>\
        if appdata ~= "" then
            local g_steam = fs.join(appdata, "Steam", tostring(appid))
            add_state_path(fs.join(g_steam, "stats", "achievements.json"), appid, g_steam, "goldberg_legacy_steam")
            add_state_path(fs.join(g_steam, "achievements.json"), appid, g_steam, "goldberg_legacy_steam")
            add_state_path(fs.join(g_steam, "steam_settings", "achievements.json"), appid, g_steam, "goldberg_legacy_steam")
        end

        -- 3. LocalAppData Goldberg:
        -- %LOCALAPPDATA%\Goldberg SteamEmu Saves\<AppID>\
        if localappdata ~= "" then
            local g_local = fs.join(localappdata, "Goldberg SteamEmu Saves", tostring(appid))
            add_state_path(fs.join(g_local, "achievements.json"), appid, g_local, "goldberg_localappdata")
            add_state_path(fs.join(g_local, "stats", "achievements.json"), appid, g_local, "goldberg_localappdata")
            add_state_path(fs.join(g_local, "steam_settings", "achievements.json"), appid, g_local, "goldberg_localappdata")
        end

        -- 4. GSE Saves (%APPDATA% and %LOCALAPPDATA%):
        if appdata ~= "" then
            local gse = fs.join(appdata, "GSE Saves", tostring(appid))
            add_state_path(fs.join(gse, "achievements.json"), appid, gse, "gse_saves")
            add_state_path(fs.join(gse, "stats", "achievements.json"), appid, gse, "gse_saves")
            add_state_path(fs.join(gse, "steam_settings", "achievements.json"), appid, gse, "gse_saves")
        end
        if localappdata ~= "" then
            local gse_local = fs.join(localappdata, "GSE Saves", tostring(appid))
            add_state_path(fs.join(gse_local, "achievements.json"), appid, gse_local, "gse_saves_local")
            add_state_path(fs.join(gse_local, "stats", "achievements.json"), appid, gse_local, "gse_saves_local")
        end
    end
    add_state_paths_for(metadata_appid)
    if state_appid ~= metadata_appid then add_state_paths_for(state_appid) end

    local state = nil
    local state_path = ""
    local state_source_appid = ""
    local state_source = ""
    for _, candidate in ipairs(candidate_states) do
        state = decode_json_file(candidate.path)
        if state then
            state_path = candidate.path
            state_source_appid = candidate.appid
            state_source = candidate.source or "appid_folder"
            if candidate.schema_dir and candidate.schema_dir ~= "" then
                metadata_dir = candidate.schema_dir
            end
            break
        end
    end

    if not state and not allow_simulated then
        return cjson.encode({
            found = false,
            appid = metadata_appid,
            state_appid = state_appid,
            path = fs.join(root, state_appid, "achievements.json"),
            root = root,
            state_source = "unavailable",
        })
    end

    if not state then
        -- Explicit developer/test fallback for linked external games. Production
        -- requests never fabricate unlock progress when achievements.json is absent.
        -- achievements.json, keep the deterministic fixed achievement set used
        -- by previous releases. This is visual/test data only; it never writes
        -- to Steam or to the game's save files. Public Steam metadata provides
        -- the real names, descriptions and icons.
        local metadata, metadata_source = match_public_metadata(metadata_appid, lang, metadata_dir)
        local meta_list = {}
        for name, m in pairs(metadata) do
            meta_list[#meta_list + 1] = {
                name = name,
                display_name = tostring(m.title or name),
                description = tostring(m.description or ""),
                icon = tostring(m.icon or ""),
                icon_gray = tostring(m.icongray or m.icon or ""),
                hidden = m.hidden == true,
                global_percent = tonumber(m.global_percent) or 0,
            }
        end
        if #meta_list == 0 then
            return cjson.encode({
                found = false,
                appid = metadata_appid,
                state_appid = state_appid,
                path = fs.join(root, state_appid, "achievements.json"),
                root = root,
            })
        end

        table.sort(meta_list, function(a, b)
            if (a.global_percent or 0) ~= (b.global_percent or 0) then
                return (a.global_percent or 0) > (b.global_percent or 0)
            end
            return tostring(a.name) < tostring(b.name)
        end)

        local total = #meta_list
        local appid_num = tonumber(metadata_appid) or 0
        local pct_target = 0.20 + (((appid_num * 17) % 6) * 0.01)
        local unlocked_target
        if total <= 1 then
            unlocked_target = total
        else
            unlocked_target = math.max(1, math.min(total - 1, math.floor(total * pct_target)))
        end
        if total == 52 then
            unlocked_target = 11
        end

        local base_now = 1771616040 -- Stable timestamp so the visual test set never reshuffles.
        local achievements = {}
        for idx, item in ipairs(meta_list) do
            local is_earned = (idx <= unlocked_target)
            local earned_time = 0
            if is_earned then
                earned_time = base_now - (86400 * (unlocked_target - idx + 1) * 3) - ((appid_num + idx * 7919) % 43200)
            end
            achievements[#achievements + 1] = {
                name = item.name,
                display_name = item.display_name,
                description = item.description,
                icon = item.icon,
                icon_gray = item.icon_gray,
                hidden = item.hidden,
                global_percent = item.global_percent,
                earned = is_earned,
                earned_time = earned_time,
                progress = 0,
                max_progress = 0,
            }
        end

        return cjson.encode({
            found = true,
            appid = metadata_appid,
            metadata_appid = metadata_appid,
            state_appid = state_appid,
            unlocked = unlocked_target,
            total = total,
            metadata_source = tostring(metadata_source or "public") .. ":simulated-test",
            state_source = "simulated_test",
            achievements = achievements,
        })
    end

    -- Never use the shortcut ID to look up Steam metadata: it is not a real
    -- Steam AppID and has no achievement schema on Steam's services.
    local metadata, metadata_source = match_public_metadata(metadata_appid, lang, metadata_dir)
    local names, unlocked, total = {}, 0, 0
    for name, st in pairs(state) do
        if type(st) == "table" then
            names[#names + 1] = tostring(name)
            total = total + 1
            if st.earned == true or tonumber(st.earned) == 1 then
                unlocked = unlocked + 1
            end
        end
    end
    table.sort(names)

    local achievements = {}
    for _, name in ipairs(names) do
        local st = state[name] or {}
        local m = metadata[name] or {}
        achievements[#achievements + 1] = {
            name = name,
            display_name = tostring(m.title or name),
            description = tostring(m.description or ""),
            icon = tostring(m.icon or ""),
            icon_gray = tostring(m.icongray or ""),
            hidden = m.hidden == true,
            global_percent = tonumber(m.global_percent) or 0,
            earned = (st.earned == true or tonumber(st.earned) == 1),
            earned_time = tonumber(st.earned_time) or 0,
            progress = tonumber(st.progress) or 0,
            max_progress = tonumber(st.max_progress) or 0,
        }
    end

    if total == 0 and next(metadata) then
        for name, m in pairs(metadata) do
            achievements[#achievements + 1] = {
                name = name,
                display_name = tostring(m.title or name),
                description = tostring(m.description or ""),
                icon = tostring(m.icon or ""),
                icon_gray = tostring(m.icongray or ""),
                hidden = m.hidden == true,
                global_percent = tonumber(m.global_percent) or 0,
                earned = false,
                earned_time = 0,
                progress = 0,
                max_progress = 0,
            }
            total = total + 1
        end
        table.sort(achievements, function(a, b) return tostring(a.name) < tostring(b.name) end)
    end

    logger:info("Local achievement data resolved: " .. unlocked .. "/" .. total
        .. " for linked appid " .. metadata_appid .. " from state appid " .. state_source_appid)

    return cjson.encode({
        found = true,
        appid = metadata_appid,
        metadata_appid = metadata_appid,
        state_appid = state_source_appid,
        root = root,
        path = state_path,
        metadata_source = metadata_source,
        state_source = state_source,
        unlocked = unlocked,
        total = total,
        achievements = achievements,
    })
end

return M
end
