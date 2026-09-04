return function(deps)
local logger = deps.logger
local cjson = deps.cjson
local fs = deps.fs
local config = deps.config
local M = {}

local function read_text_file(path)
    if not path or path == "" then return nil end
    local f = io.open(path, "rb")
    if not f then f = io.open(path:gsub("\\", "/"), "rb") end
    if not f then f = io.open(path:gsub("/", "\\"), "rb") end
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    return content
end

local function file_exists(path)
    if not path or path == "" then return false end
    local value = tostring(path)
    if fs.exists(value) then return true end
    local forward = value:gsub("\\", "/")
    if forward ~= value and fs.exists(forward) then return true end
    local backward = value:gsub("/", "\\")
    return backward ~= value and fs.exists(backward) or false
end

local function expand_environment_variables(value)
    return tostring(value or ""):gsub("%%([^%%]+)%%", function(name)
        return os.getenv(name) or ("%" .. name .. "%")
    end)
end

local function default_root()
    local appdata = os.getenv("APPDATA")
    if appdata and appdata ~= "" then
        if fs.exists(fs.join(appdata, "SteamAchievements")) then return fs.join(appdata, "SteamAchievements") end
        return fs.join(appdata, "SteamAchievements")
    end
    local localappdata = os.getenv("LOCALAPPDATA")
    if localappdata and localappdata ~= "" and fs.exists(fs.join(localappdata, "SteamAchievements")) then
        return fs.join(localappdata, "SteamAchievements")
    end
    local userprofile = os.getenv("USERPROFILE")
    if userprofile and userprofile ~= "" then return fs.join(userprofile, "AppData", "Roaming", "SteamAchievements") end
    -- Last-resort portable fallback for environments that expose none of the
    -- standard Windows profile variables. Keep it in the plugin per-user state
    -- root rather than assuming a drive letter or Windows profile layout.
    return config.state_path("SteamAchievements")
end

local function normalize_path(value, use_default)
    local path = tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
    local quoted = path:match('^"(.-)"$')
    if quoted then path = quoted end
    if use_default and path == "" then
        path = default_root()
    else
        path = expand_environment_variables(path)
    end
    if #path > 4096 or path:find("%z") or path:find("[\r\n]") then return nil end
    return path
end

function M.parse_request(request_json)
    if type(request_json) == "table" then return request_json end
    if type(request_json) == "string" and request_json ~= "" then
        local ok, request = pcall(cjson.decode, request_json)
        if ok and type(request) == "table" then return request end
    end
    return {}
end

function M.game_keys(request)
    local keys, seen = {}, {}
    local function add(prefix, value)
        local id = tostring(value or "")
        if id:match("^%d+$") then
            local key = prefix .. id
            if not seen[key] then seen[key] = true; keys[#keys + 1] = key end
        end
    end
    add("shortcut:", request.shortcut_app_id or request.state_app_id or request.local_app_id)
    add("appid:", request.steam_app_id or request.appid)
    return keys
end

local function read_string_map(filename)
    local data = config.read_json(config.state_path(filename), {})
    local result = {}
    for key, value in pairs(type(data) == "table" and data or {}) do
        if type(key) == "string" and type(value) == "string" and value ~= "" then result[key] = value end
    end
    return result
end

local function write_json(filename, data, description)
    local ok, err = config.write_json_atomic(config.state_path(filename), data)
    if not ok then logger:warn("Could not save " .. description .. ": " .. tostring(err or "write_failed")) end
    return ok
end

local function read_options()
    local data = config.read_json(config.state_path("achievement_options.json"), {})
    local result = {}
    for key, value in pairs(type(data) == "table" and data or {}) do
        if type(key) == "string" and type(value) == "table" then
            local count = tonumber(value.simulate_count)
            local online_count = tonumber(value.simulate_online_count)
            local online_pct = tonumber(value.simulate_online_percent)
            if not online_pct then
                online_pct = (online_count and online_count > 0) or value.unlock_online == true and 100 or 0
            end
            local unlocked_names = type(value.unlocked_names) == "table" and value.unlocked_names or nil
            local has_unlocked_names = unlocked_names ~= nil and #unlocked_names > 0
            result[key] = {
                simulate = value.simulate == true or (count and count > 0) or (online_count and online_count > 0) or has_unlocked_names,
                simulate_count = count,
                simulate_online_count = online_count,
                simulate_percent = tonumber(value.simulate_percent) or 0,
                simulate_online_percent = online_pct,
                unlock_online = (online_count and online_count > 0) or online_pct > 0 or value.unlock_online == true,
                unlocked_names = unlocked_names,
            }
        end
    end
    return result
end

local function source_status(path)
    if not path or path == "" then return false, false end
    if path:lower():match("%.json$") then
        local exists = file_exists(path)
        return exists, exists
    end
    local exists = fs.exists(path)
    local usable = file_exists(fs.join(path, "achievements.json"))
        or file_exists(fs.join(path, "stats", "achievements.json"))
        or file_exists(fs.join(path, "steam_settings", "achievements.json"))
    return exists, usable
end

function M.local_root()
    local cfg = config.state_path("achievement_base_path.txt")
    local saved = file_exists(cfg) and read_text_file(cfg) or nil
    saved = saved and tostring(saved):gsub("^%s+", ""):gsub("%s+$", "") or ""
    if saved ~= "" and saved:lower() ~= "c:\\steam auto" and saved:lower() ~= "c:/steam auto" then
        return expand_environment_variables(saved)
    end
    return default_root()
end

function M.get_base_path()
    local path = M.local_root()
    return cjson.encode({ ok = true, path = path, exists = fs.exists(path), configured = file_exists(config.state_path("achievement_base_path.txt")) })
end

function M.set_base_path(value)
    local path = normalize_path(value, true)
    if not path then return cjson.encode({ ok = false, error = "invalid_path" }) end
    local ok, err = config.write_text_atomic(config.state_path("achievement_base_path.txt"), path)
    if not ok then
        logger:warn("Could not save achievement base path: " .. tostring(err or "write_failed"))
        return cjson.encode({ ok = false, error = "write_failed" })
    end
    logger:info("Achievement base path updated: " .. path)
    return cjson.encode({ ok = true, path = path, exists = fs.exists(path) })
end

function M.configured_path(state_appid, metadata_appid)
    local paths = read_string_map("achievement_paths.json")
    for _, key in ipairs(M.game_keys({ shortcut_app_id = state_appid, steam_app_id = metadata_appid })) do
        local path = paths[key]
        if type(path) == "string" and path ~= "" then return path, key end
    end
    return nil, nil
end

function M.get_game_path(request_json)
    local request = M.parse_request(request_json)
    local keys = M.game_keys(request)
    if #keys == 0 then return cjson.encode({ ok = false, error = "missing_game_id" }) end
    local paths = read_string_map("achievement_paths.json")
    for _, key in ipairs(keys) do
        local path = paths[key]
        if type(path) == "string" and path ~= "" then
            local exists, usable = source_status(path)
            return cjson.encode({ ok = true, configured = true, key = key, path = path, exists = exists, usable = usable })
        end
    end
    return cjson.encode({ ok = true, configured = false, path = "", exists = false, usable = false })
end

function M.set_game_path(request_json)
    local request = M.parse_request(request_json)
    local keys = M.game_keys(request)
    if #keys == 0 then return cjson.encode({ ok = false, error = "missing_game_id" }) end
    local path = normalize_path(request.path, false)
    if path == nil then return cjson.encode({ ok = false, error = "invalid_path" }) end
    local paths = read_string_map("achievement_paths.json")
    for _, key in ipairs(keys) do paths[key] = path ~= "" and path or nil end
    if not write_json("achievement_paths.json", paths, "per-game achievement paths") then
        return cjson.encode({ ok = false, error = "write_failed" })
    end
    if path ~= "" then
        local options = read_options()
        local record = { simulate = false, simulate_percent = 0, unlock_online = request.unlock_online == true }
        for _, key in ipairs(keys) do options[key] = record end
        if not write_json("achievement_options.json", options, "per-game achievement options") then
            return cjson.encode({ ok = false, error = "write_failed" })
        end
    end
    local exists, usable = source_status(path)
    return cjson.encode({ ok = true, configured = path ~= "", key = keys[1], path = path, exists = exists, usable = usable })
end

function M.resolve_options(request, defaults)
    local options = read_options()
    local record, key = nil, nil
    for _, candidate in ipairs(M.game_keys(request)) do
        if options[candidate] then record = options[candidate]; key = candidate; break end
    end
    local resolved = { configured = record ~= nil, key = key }
    if record then
        resolved.simulate = record.simulate == true
        resolved.simulate_count = tonumber(record.simulate_count)
        resolved.simulate_online_count = tonumber(record.simulate_online_count)
        resolved.simulate_percent = tonumber(record.simulate_percent) or 0
        resolved.simulate_online_percent = tonumber(record.simulate_online_percent) or (record.unlock_online == true and 100 or 0)
        resolved.unlock_online = record.unlock_online == true
        resolved.unlocked_names = record.unlocked_names
    else
        resolved.simulate = defaults.simulate == true
        resolved.simulate_count = tonumber(defaults.simulate_count)
        resolved.simulate_online_count = tonumber(defaults.simulate_online_count)
        resolved.simulate_percent = tonumber(defaults.simulate_percent) or 0
        resolved.simulate_online_percent = tonumber(defaults.simulate_online_percent) or (defaults.unlock_online == true and 100 or 0)
        resolved.unlock_online = defaults.unlock_online == true
        resolved.unlocked_names = defaults.unlocked_names
    end
    if M.configured_path(request.shortcut_app_id or request.state_app_id, request.steam_app_id or request.appid) then
        resolved.simulate = false
    end
    return resolved
end

function M.get_game_options(request_json)
    local request = M.parse_request(request_json)
    if #M.game_keys(request) == 0 then return cjson.encode({ ok = false, error = "missing_game_id" }) end
    local effective = M.resolve_options(request, {
        simulate = request.global_simulate == true,
        simulate_count = tonumber(request.global_simulate_count),
        simulate_online_count = tonumber(request.global_simulate_online_count),
        simulate_percent = tonumber(request.global_simulate_percent) or 0,
        simulate_online_percent = tonumber(request.global_simulate_online_percent) or (request.global_unlock_online == true and 100 or 0),
        unlock_online = request.global_unlock_online == true,
    })
    effective.ok = true
    return cjson.encode(effective)
end

function M.set_game_options(request_json)
    local request = M.parse_request(request_json)
    local keys = M.game_keys(request)
    if #keys == 0 then return cjson.encode({ ok = false, error = "missing_game_id" }) end
    local options = read_options()
    if request.reset == true then
        for _, key in ipairs(keys) do options[key] = nil end
    else
        local count = tonumber(request.simulate_count)
        local online_count = tonumber(request.simulate_online_count)
        local unlocked_names = type(request.unlocked_names) == "table" and request.unlocked_names or nil
        local has_unlocked_names = unlocked_names ~= nil and #unlocked_names > 0
        local simulate = request.simulate
        if simulate == nil then
            simulate = (count and count > 0) or (online_count and online_count > 0) or has_unlocked_names
        end
        if simulate == false then
            count = 0
            online_count = 0
            unlocked_names = nil
        end
        local pct = tonumber(request.simulate_percent)
        if not pct or pct < 0 or pct > 100 then pct = 25 end
        local online_pct = tonumber(request.simulate_online_percent)
        if not online_pct or online_pct < 0 or online_pct > 100 then
            online_pct = (online_count and online_count > 0) or request.unlock_online == true and 100 or 0
        end
        local record = {
            simulate = simulate == true,
            simulate_count = count or 0,
            simulate_online_count = online_count or 0,
            simulate_percent = pct,
            simulate_online_percent = online_pct,
            unlock_online = (online_count and online_count > 0) or online_pct > 0,
            unlocked_names = unlocked_names,
        }
        for _, key in ipairs(keys) do options[key] = record end
        if simulate then
            local paths = read_string_map("achievement_paths.json")
            for _, key in ipairs(keys) do paths[key] = nil end
            if not write_json("achievement_paths.json", paths, "per-game achievement paths") then
                return cjson.encode({ ok = false, error = "write_failed" })
            end
        end
    end
    if not write_json("achievement_options.json", options, "per-game achievement options") then
        return cjson.encode({ ok = false, error = "write_failed" })
    end
    local effective = M.resolve_options(request, {
        simulate = request.global_simulate == true,
        simulate_count = tonumber(request.global_simulate_count),
        simulate_online_count = tonumber(request.global_simulate_online_count),
        simulate_percent = tonumber(request.global_simulate_percent) or 0,
        simulate_online_percent = tonumber(request.global_simulate_online_percent) or (request.global_unlock_online == true and 100 or 0),
        unlock_online = request.global_unlock_online == true,
    })
    effective.ok = true
    return cjson.encode(effective)
end

function M.clear_all_settings()
    logger:info("Clearing all achievement settings and resetting to defaults")
    write_json("achievement_paths.json", {}, "per-game achievement paths")
    write_json("achievement_options.json", {}, "per-game achievement options")
    local base_path_file = config.state_path("achievement_base_path.json")
    if fs.exists(base_path_file) then os.remove(base_path_file) end
    return true
end

return M
end
