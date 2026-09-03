return function(deps)
local logger = deps.logger
local fs = deps.fs
local cjson = deps.cjson
local process = deps.process
local config = deps.config
local M = {}

local active_session = {
    active = false,
    steam_app_id = nil,
    game_title = nil,
    started_at = 0,
}

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
    -- Resolve the helper source from Millennium's actual plugin location.
    -- Never assume Steam is installed on C: or under Program Files.
    local backend_dir = tostring(config and config.backend_dir and config.backend_dir() or "")
    if backend_dir == "" and config and config.plugin_dir then
        backend_dir = fs.join(config.plugin_dir(), "backend")
    end
    local cs_path = fs.join(backend_dir, "src", "steam_card_farmer.cs")
    if not fs.exists(cs_path) then
        return nil, "source_not_found"
    end

    local temp_dir = os.getenv("TEMP") or os.getenv("TMP") or "C:\\Windows\\Temp"
    local exe_path = fs.join(temp_dir, "ngl_steam_card_farmer.exe")

    if fs.exists(exe_path) then
        return exe_path
    end

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

    local ps1_path = fs.join(backend_dir, "src", "steam_card_farmer.ps1")
    if fs.exists(ps1_path) then
        return ps1_path, "is_ps1"
    end

    return nil, "compilation_failed"
end

local function extract_request(req)
    if type(req) == "string" then
        local trimmed = req:match("^%s*(.-)%s*$") or ""
        if trimmed:match("^%d+$") then
            return { steam_app_id = trimmed }
        end
        local ok, parsed = pcall(cjson.decode, trimmed)
        if ok and type(parsed) == "table" then
            return extract_request(parsed)
        end
        return { steam_app_id = trimmed }
    elseif type(req) == "table" then
        if req.request_json then
            return extract_request(req.request_json)
        end
        local raw_id = req.steam_app_id or req.appid or req[1]
        local id = raw_id and tostring(raw_id):match("%d+") or nil
        return {
            steam_app_id = id,
            game_title = req.game_title or req.title,
        }
    end
    return {}
end

function M.get_card_farming_status()
    local now = os.time()
    local elapsed = 0
    if active_session.active and active_session.started_at > 0 then
        elapsed = math.max(0, now - active_session.started_at)
    end
    return cjson.encode({
        ok = true,
        active = active_session.active,
        steam_app_id = active_session.steam_app_id,
        game_title = active_session.game_title,
        started_at = active_session.started_at,
        elapsed_seconds = elapsed,
    })
end

function M.stop_card_farming()
    local helper_path, helper_type = get_or_compile_helper()
    if helper_path then
        local cmd
        if helper_type == "is_ps1" then
            cmd = string.format('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%s" stop', helper_path)
        else
            cmd = string.format('"%s" stop', helper_path)
        end
        if process and process.run_silent then
            process.run_silent(cmd, 5000)
        else
            pcall(os.execute, cmd)
        end
    end
    active_session.active = false
    active_session.steam_app_id = nil
    active_session.game_title = nil
    active_session.started_at = 0
    return cjson.encode({ ok = true, active = false })
end

function M.start_card_farming(request)
    local data = extract_request(request)
    local appid = data.steam_app_id
    if not appid or appid == "" or appid == "0" then
        return cjson.encode({ ok = false, error = "invalid_appid" })
    end

    local helper_path, helper_type = get_or_compile_helper()
    if not helper_path then
        return cjson.encode({ ok = false, error = helper_type or "farmer_not_found" })
    end

    -- If another game is farming, stop it first
    if active_session.active then
        M.stop_card_farming()
    end

    local cmd
    if helper_type == "is_ps1" then
        cmd = string.format('powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%s" run %s', helper_path, appid)
    else
        cmd = string.format('"%s" run %s', helper_path, appid)
    end

    -- Launch asynchronously in background with CREATE_NO_WINDOW (zero console/cmd window)
    if process and process.run_silent then
        process.run_silent(cmd, nil)
    else
        pcall(os.execute, 'start "" /b ' .. cmd)
    end

    active_session.active = true
    active_session.steam_app_id = appid
    active_session.game_title = data.game_title or appid
    active_session.started_at = os.time()

    return cjson.encode({
        ok = true,
        active = true,
        steam_app_id = appid,
        game_title = active_session.game_title,
        started_at = active_session.started_at,
    })
end

return M
end
