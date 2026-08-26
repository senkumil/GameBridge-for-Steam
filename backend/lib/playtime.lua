return function(deps)
local logger = deps.logger
local cjson = deps.cjson
local fs = deps.fs
local config = deps.config
local M = {}

local SESSIONS_FILE = config.path("playtime_sessions.json")
local SESSIONS = {}

local function normalize_title_key(title)
    local text = tostring(title or ""):lower()
    text = text:gsub("™", ""):gsub("®", ""):gsub("©", "")
    text = text:gsub("[’'`´]", ""):gsub("[–—_:|/\\%[%]%(%){}]+", " ")
    text = text:gsub("[^%w]+", " "):gsub("%s+", " ")
    return text:match("^%s*(.-)%s*$") or ""
end

local function candidate_keys(shortcut_app_id, steam_app_id, title)
    local keys = {}
    local seen = {}
    local function add(k)
        if k and k ~= "" and not seen[k] then
            seen[k] = true
            table.insert(keys, k)
        end
    end
    if shortcut_app_id and tostring(shortcut_app_id):match("^%d+$") then
        add("id:" .. tostring(shortcut_app_id))
    end
    if steam_app_id and tostring(steam_app_id):match("^%d+$") then
        add("steam:" .. tostring(steam_app_id))
    end
    local norm = normalize_title_key(title)
    if norm ~= "" then
        add("title:" .. norm)
        add(norm) -- backward compatibility
    end
    return keys
end

local function load_sessions()
    local data = config.read_text(SESSIONS_FILE)
    if not data or data == "" then
        -- Check fallback sessions.json from non-steam-playtimes if migrating
        local fallback_file = config.path("sessions.json")
        data = config.read_text(fallback_file)
    end
    if data and data ~= "" then
        local ok, decoded = pcall(cjson.decode, data)
        if ok and type(decoded) == "table" then
            SESSIONS = decoded
            return
        end
    end
    SESSIONS = {}
end

local function save_sessions()
    local ok, encoded = pcall(cjson.encode, SESSIONS)
    if ok and encoded then
        config.write_text_atomic(SESSIONS_FILE, encoded)
    end
end

local function collapse_sessions(sessions)
    if type(sessions) ~= "table" or #sessions == 0 then return end
    local two_weeks_ago = os.time() - (14 * 24 * 60 * 60)
    local unix_epoch = 0
    local zero_session = nil
    local latest_session = nil
    local stale_sessions = {}

    for _, session in ipairs(sessions) do
        if session.started_at == unix_epoch then
            zero_session = session
        end
        if not latest_session or session.ended_at > latest_session.ended_at then
            latest_session = session
        end
        if session.ended_at < two_weeks_ago then
            table.insert(stale_sessions, session)
        end
    end

    if not zero_session and #stale_sessions > 0 then
        zero_session = { started_at = unix_epoch, ended_at = unix_epoch }
        table.insert(sessions, 1, zero_session)
    end

    if zero_session then
        for _, session in ipairs(stale_sessions) do
            if session ~= latest_session and session ~= zero_session then
                local dur = math.max(0, (session.ended_at or 0) - (session.started_at or 0))
                zero_session.ended_at = zero_session.ended_at + dur
                for j = #sessions, 1, -1 do
                    if sessions[j] == session then
                        table.remove(sessions, j)
                        break
                    end
                end
            end
        end
    end
end

local function find_sessions_list(keys)
    for _, key in ipairs(keys) do
        if SESSIONS[key] and type(SESSIONS[key]) == "table" then
            return SESSIONS[key], key
        end
    end
    return nil, nil
end

local function ensure_sessions_list(keys)
    local list, key = find_sessions_list(keys)
    if list then return list, key end
    local primary_key = keys[1] or "default"
    SESSIONS[primary_key] = {}
    return SESSIONS[primary_key], primary_key
end

function M.start_session(request_json)
    load_sessions()
    local req = type(request_json) == "table" and request_json or {}
    if type(request_json) == "string" and request_json ~= "" then
        local ok, parsed = pcall(cjson.decode, request_json)
        if ok and type(parsed) == "table" then req = parsed end
    end

    local instance_id = tostring(req.instance_id or os.time())
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    if #keys == 0 then return cjson.encode({ ok = false, error = "missing_keys" }) end

    local sessions, primary_key = ensure_sessions_list(keys)
    local now = os.time()

    -- Check if session with this instance_id already exists
    local existing = nil
    for _, s in ipairs(sessions) do
        if s.instance_id == instance_id then existing = s; break end
    end

    if existing then
        existing.ended_at = now
    else
        table.insert(sessions, {
            instance_id = instance_id,
            started_at = now,
            ended_at = now,
        })
    end

    -- Associate aliases so searching by ID or Title always finds the same list
    for _, k in ipairs(keys) do
        if k ~= primary_key then SESSIONS[k] = sessions end
    end

    save_sessions()
    logger:info("Playtime session started for " .. tostring(req.title or primary_key) .. " (" .. instance_id .. ")")
    return cjson.encode({ ok = true, instance_id = instance_id })
end

function M.ping_session(request_json)
    local req = type(request_json) == "table" and request_json or {}
    if type(request_json) == "string" and request_json ~= "" then
        local ok, parsed = pcall(cjson.decode, request_json)
        if ok and type(parsed) == "table" then req = parsed end
    end

    local instance_id = tostring(req.instance_id or "")
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions = find_sessions_list(keys)
    local now = os.time()
    local updated = false

    if sessions then
        for _, s in ipairs(sessions) do
            if s.instance_id == instance_id or (instance_id == "" and s.instance_id) then
                s.ended_at = now
                updated = true
                break
            end
        end
    end

    if updated then
        save_sessions()
    end
    return cjson.encode({ ok = updated })
end

function M.stop_session(request_json)
    local req = type(request_json) == "table" and request_json or {}
    if type(request_json) == "string" and request_json ~= "" then
        local ok, parsed = pcall(cjson.decode, request_json)
        if ok and type(parsed) == "table" then req = parsed end
    end

    local instance_id = tostring(req.instance_id or "")
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions = find_sessions_list(keys)
    local now = os.time()
    local stopped = false

    if sessions then
        for _, s in ipairs(sessions) do
            if s.instance_id == instance_id or instance_id == "" then
                s.ended_at = now
                s.instance_id = nil
                stopped = true
                break
            end
        end
        collapse_sessions(sessions)
        save_sessions()
    end

    logger:info("Playtime session stopped for " .. tostring(req.title or keys[1] or ""))
    return cjson.encode({ ok = stopped })
end

function M.get_playtime(request_json)
    load_sessions()
    local req = type(request_json) == "table" and request_json or {}
    if type(request_json) == "string" and request_json ~= "" then
        local ok, parsed = pcall(cjson.decode, request_json)
        if ok and type(parsed) == "table" then req = parsed end
    end

    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions = find_sessions_list(keys) or {}

    local two_weeks_ago = os.time() - (14 * 24 * 60 * 60)
    local unix_epoch = 0
    local seconds_forever = 0
    local seconds_last_two_weeks = 0
    local last_played_at = 0

    for _, session in ipairs(sessions) do
        local started = session.started_at or 0
        local ended = session.ended_at or started
        local dur = math.max(0, ended - started)
        seconds_forever = seconds_forever + dur

        if started > two_weeks_ago or ended > two_weeks_ago then
            seconds_last_two_weeks = seconds_last_two_weeks + dur
        end

        if started ~= unix_epoch and ended > last_played_at then
            last_played_at = ended
        end
    end

    return cjson.encode({
        ok = true,
        minutes_forever = math.floor((seconds_forever / 60) + 0.5),
        minutes_last_two_weeks = math.floor((seconds_last_two_weeks / 60) + 0.5),
        last_played_at = last_played_at > 0 and last_played_at or nil,
    })
end

function M.set_playtime(request_json)
    load_sessions()
    local req = type(request_json) == "table" and request_json or {}
    if type(request_json) == "string" and request_json ~= "" then
        local ok, parsed = pcall(cjson.decode, request_json)
        if ok and type(parsed) == "table" then req = parsed end
    end

    local minutes = math.max(0, tonumber(req.minutes_forever or 0) or 0)
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    if #keys == 0 then return cjson.encode({ ok = false, error = "missing_keys" }) end

    local sessions, primary_key = ensure_sessions_list(keys)
    local new_sessions = {
        {
            started_at = 0,
            ended_at = math.floor(minutes * 60),
        }
    }

    for _, k in ipairs(keys) do
        SESSIONS[k] = new_sessions
    end

    save_sessions()
    logger:info("Playtime manually set for " .. tostring(req.title or primary_key) .. ": " .. tostring(minutes) .. " mins")
    return cjson.encode({ ok = true, minutes_forever = minutes })
end

load_sessions()
return M
end
