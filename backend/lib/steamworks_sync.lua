return function(deps)
local logger = deps.logger
local fs = deps.fs
local cjson = deps.cjson
local process = deps.process
local M = {}
local result_sequence = 0

local function find_csc()
    local windir = os.getenv("WINDIR") or "C:\\Windows"
    local candidates = {
        fs.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
        fs.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
    }
    for _, path in ipairs(candidates) do
        if fs.exists(path) then
            return path
        end
    end
    return nil
end

local function get_or_compile_helper()
    local backend_dir = tostring(MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or "")
    if backend_dir ~= "" and backend_dir:lower():match("%.lua$") then
        backend_dir = fs.parent_path(backend_dir)
    end
    if backend_dir == "" then
        backend_dir = "C:\\Program Files (x86)\\Steam\\millennium\\plugins\\NativeGameLinkForSteam\\backend"
    end
    local cs_path = fs.join(backend_dir, "src", "steam_achievement_sync.cs")
    if not fs.exists(cs_path) then
        return nil, "source_not_found"
    end

    local temp_dir = os.getenv("TEMP") or os.getenv("TMP") or "C:\\Windows\\Temp"
    local exe_path = fs.join(temp_dir, "ngl_steam_achievement_sync.exe")

    if fs.exists(exe_path) then
        return exe_path
    end

    -- Compile using csc.exe as winexe completely silently via process.run_silent (0 windows)
    local csc = find_csc()
    if csc and process and process.run_silent then
        local compile_cmd = string.format('"%s" /nologo /target:winexe /out:"%s" "%s"', csc, exe_path, cs_path)
        process.run_silent(compile_cmd, 10000)
    end

    if not fs.exists(exe_path) and process and process.run_silent then
        local ps_cmd = string.format('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -Path \'%s\' -OutputType WindowsApplication -OutputAssembly \'%s\'"', cs_path, exe_path)
        process.run_silent(ps_cmd, 10000)
    end

    if fs.exists(exe_path) then
        return exe_path
    end

    local ps1_path = fs.join(backend_dir, "src", "steam_achievement_sync.ps1")
    if fs.exists(ps1_path) then
        return ps1_path, "is_ps1"
    end

    return nil, "compilation_failed"
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
    local helper_path, helper_type = get_or_compile_helper()
    if not helper_path then
        return nil, helper_type or "helper_not_found"
    end
    local temp_dir = os.getenv("TEMP") or os.getenv("TMP") or "C:\\Windows\\Temp"
    result_sequence = (result_sequence + 1) % 1000000
    local result_path = fs.join(temp_dir, "ngl_sync_" .. tostring(os.time()) .. "_" .. tostring(result_sequence) .. ".json")
    pcall(os.remove, result_path)

    local cmd
    if helper_type == "is_ps1" then
        cmd = string.format('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%s" %s --result-file "%s"', helper_path, args_string, result_path)
    else
        cmd = string.format('"%s" %s --result-file "%s"', helper_path, args_string, result_path)
    end

    -- Use Win32 CreateProcess with CREATE_NO_WINDOW (0 windows, instant execution)
    if process and process.run_silent then
        process.run_silent(cmd, 10000)
    else
        pcall(os.execute, cmd)
    end

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

local status_cache = deps.ttl_cache and deps.ttl_cache.new(50) or nil

function M.fetch_steam_account_achievements(request)
    local data = extract_request_data(request)
    local id = data.steam_app_id
    if not id or id == "" or id == "0" then
        return cjson.encode({ ok = false, error = "invalid_appid" })
    end

    if status_cache then
        local cached = deps.ttl_cache.get(status_cache, id, 30)
        if cached and cached.json then
            return cached.json
        end
    end

    local result, err = run_helper(string.format("status %s", id))
    if not result then
        return cjson.encode({ ok = false, error = err or "status_failed" })
    end
    local encoded = cjson.encode(result)
    if status_cache and result.ok then
        deps.ttl_cache.set(status_cache, id, { json = encoded, ttl = 30 })
    end
    return encoded
end

function M.sync_steam_account_achievements(request)
    local data = extract_request_data(request)
    local appid = data.steam_app_id
    if not appid or appid == "" or appid == "0" then
        return cjson.encode({ ok = false, error = "invalid_appid" })
    end

    if status_cache and status_cache.entries then
        status_cache.entries[appid] = nil
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
