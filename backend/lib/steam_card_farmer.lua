return function(deps)
local logger = deps.logger
local fs = deps.fs
local cjson = deps.cjson
local M = {}

local active_session = {
    active = false,
    steam_app_id = nil,
    game_title = nil,
    started_at = 0,
}

local function get_farmer_path()
    local backend_dir = tostring(MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or "")
    if backend_dir ~= "" and backend_dir:lower():match("%.lua$") then
        backend_dir = fs.parent_path(backend_dir)
    end
    if backend_dir == "" then
        backend_dir = "C:\\Program Files (x86)\\Steam\\millennium\\plugins\\NativeGameLinkForSteam\\backend"
    end
    return fs.join(backend_dir, "bin", "steam_card_farmer.exe")
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
    local exe = get_farmer_path()
    if fs.exists(exe) then
        local bin_dir = fs.parent_path(exe)
        local cmd = string.format('cd /d "%s" && steam_card_farmer.exe stop', bin_dir)
        pcall(os.execute, cmd)
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

    local exe = get_farmer_path()
    if not fs.exists(exe) then
        return cjson.encode({ ok = false, error = "farmer_not_found" })
    end

    -- If another game is farming, stop it first
    if active_session.active then
        M.stop_card_farming()
    end

    local bin_dir = fs.parent_path(exe)
    -- Launch in background using start "" /b on Windows
    local cmd = string.format('cd /d "%s" && start "" /b steam_card_farmer.exe run %s', bin_dir, appid)
    local ok = pcall(os.execute, cmd)
    if not ok then
        return cjson.encode({ ok = false, error = "launch_failed" })
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
