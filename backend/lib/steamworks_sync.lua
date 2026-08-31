return function(deps)
local logger = deps.logger
local fs = deps.fs
local cjson = deps.cjson
local M = {}
local result_sequence = 0

local function get_helper_path()
    local backend_dir = tostring(MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or "")
    if backend_dir ~= "" and backend_dir:lower():match("%.lua$") then
        backend_dir = fs.parent_path(backend_dir)
    end
    if backend_dir == "" then
        backend_dir = "C:\\Program Files (x86)\\Steam\\millennium\\plugins\\NativeGameLinkForSteam\\backend"
    end
    return fs.join(backend_dir, "bin", "steam_achievement_sync.exe")
end

local function extract_request_data(req)
    if type(req) == "string" then
        local trimmed = req:match("^%s*(.-)%s*$") or ""
        if trimmed:match("^%d+$") then
            return { steam_app_id = trimmed }
        end
        local ok, parsed = pcall(cjson.decode, trimmed)
        if ok and type(parsed) == "table" then
            return extract_request_data(parsed)
        end
        return { steam_app_id = trimmed }
    elseif type(req) == "table" then
        if req.request_json then
            return extract_request_data(req.request_json)
        end
        local raw_id = req.steam_app_id or req.appid or req[1]
        local id = raw_id and tostring(raw_id):match("%d+") or nil
        return {
            steam_app_id = id,
            unlock = req.unlock,
            lock = req.lock,
        }
    end
    return {}
end

local function run_helper(args_string)
    local exe = get_helper_path()
    if not fs.exists(exe) then
        return nil, "helper_not_found"
    end
    local bin_dir = fs.parent_path(exe)
    local result_dir = os.getenv("TEMP") or os.getenv("TMP") or bin_dir
    result_sequence = (result_sequence + 1) % 1000000
    local result_path = fs.join(result_dir, "nativegamelink_steam_sync_" .. tostring(os.time()) .. "_" .. tostring(result_sequence) .. ".json")
    pcall(os.remove, result_path)

    local cmd = string.format('cd /d "%s" && steam_achievement_sync.exe %s --result-file "%s"', bin_dir, args_string, result_path)
    pcall(os.execute, cmd)

    local file = io.open(result_path, "rb")
    local output = nil
    if file then
        local file_output = file:read("*a")
        file:close()
        pcall(os.remove, result_path)
        if file_output and file_output ~= "" then output = file_output end
    end
    if not output or output == "" then
        return nil, "empty_output"
    end
    local ok, parsed = pcall(cjson.decode, output)
    if not ok or type(parsed) ~= "table" then
        return nil, "json_parse_failed: " .. tostring(output)
    end
    return parsed
end

function M.fetch_steam_account_achievements(request)
    local data = extract_request_data(request)
    local id = data.steam_app_id
    if not id or id == "" or id == "0" then
        return cjson.encode({ ok = false, error = "invalid_appid" })
    end
    local result, err = run_helper(string.format("status %s", id))
    if not result then
        return cjson.encode({ ok = false, error = err or "status_failed" })
    end
    return cjson.encode(result)
end

function M.sync_steam_account_achievements(request)
    local data = extract_request_data(request)
    local appid = data.steam_app_id
    if not appid or appid == "" or appid == "0" then
        return cjson.encode({ ok = false, error = "invalid_appid" })
    end

    local unlock_list = type(data.unlock) == "table" and data.unlock or {}
    local lock_list = type(data.lock) == "table" and data.lock or {}

    local args = { string.format("sync %s", appid) }
    for _, name in ipairs(unlock_list) do
        local clean = tostring(name):gsub('"', '')
        if clean ~= "" then
            args[#args + 1] = string.format('"+%s"', clean)
        end
    end
    for _, name in ipairs(lock_list) do
        local clean = tostring(name):gsub('"', '')
        if clean ~= "" then
            args[#args + 1] = string.format('"-%s"', clean)
        end
    end

    local result, err = run_helper(table.concat(args, " "))
    if not result then
        return cjson.encode({ ok = false, error = err or "sync_failed" })
    end
    return cjson.encode(result)
end

return M
end
