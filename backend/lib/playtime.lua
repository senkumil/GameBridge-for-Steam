return function(deps)
local logger = deps.logger
local cjson = deps.cjson
local config = deps.config
local M = {}

local SESSIONS_FILE = config.path("playtime_sessions.json")
local STORE = { version = 2, sessions = {}, aliases = {} }

local function normalize_title_key(title)
    local text = tostring(title or ""):lower()
    text = text:gsub("™", ""):gsub("®", ""):gsub("©", "")
    text = text:gsub("[’'`´]", ""):gsub("[–—_:|/\\%[%]%(%){}]+", " ")
    text = text:gsub("[^%w]+", " "):gsub("%s+", " ")
    return text:match("^%s*(.-)%s*$") or ""
end

local function parse_request(request_json)
    if type(request_json) == "table" then return request_json end
    if type(request_json) == "string" and request_json ~= "" then
        local ok, parsed = pcall(cjson.decode, request_json)
        if ok and type(parsed) == "table" then return parsed end
    end
    return {}
end

local function candidate_keys(shortcut_app_id, steam_app_id, title)
    local keys, seen = {}, {}
    local function add(key)
        if key and key ~= "" and not seen[key] then
            seen[key] = true
            keys[#keys + 1] = key
        end
    end
    if shortcut_app_id and tostring(shortcut_app_id):match("^%d+$") then
        add("id:" .. tostring(shortcut_app_id))
    end
    if steam_app_id and tostring(steam_app_id):match("^%d+$") then
        add("steam:" .. tostring(steam_app_id))
    end
    local normalized_title = normalize_title_key(title)
    if normalized_title ~= "" then
        add("title:" .. normalized_title)
        add(normalized_title) -- legacy title alias
    end
    return keys
end

local function empty_store()
    return { version = 2, sessions = {}, aliases = {} }
end

local function valid_shortcut_id(value)
    local id = tostring(value or "")
    return id:match("^%d+$") and id or nil
end

local function session_signature(list)
    local ok, encoded = pcall(cjson.encode, list)
    return ok and encoded or nil
end

local function migrate_legacy_store(legacy)
    local migrated = empty_store()
    local by_signature = {}
    local canonical_count = 0

    -- Older builds stored the same session array below id:, steam: and title
    -- keys. Prefer the id:<shortcutAppId> entries as the only canonical data.
    for key, list in pairs(legacy) do
        local canonical = type(key) == "string" and key:match("^id:(%d+)$") or nil
        if canonical and type(list) == "table" then
            migrated.sessions[canonical] = list
            canonical_count = canonical_count + 1
            local signature = session_signature(list)
            if signature then by_signature[signature] = canonical end
        end
    end

    for key, list in pairs(legacy) do
        if type(key) == "string" and type(list) == "table" and not key:match("^id:%d+$") then
            local signature = session_signature(list)
            local canonical = signature and by_signature[signature] or nil
            -- A legacy file with a single shortcut can safely recover aliases
            -- even if a previously duplicated list drifted before migration.
            if not canonical and canonical_count == 1 then
                for id in pairs(migrated.sessions) do canonical = id; break end
            end
            if canonical then migrated.aliases[key] = canonical end
        end
    end

    if canonical_count == 0 and next(legacy) ~= nil then
        logger:warn("Could not migrate playtime entries without shortcut IDs; keeping an empty canonical store")
    end
    return migrated
end

local function save_sessions()
    local ok, err = config.write_json_atomic(SESSIONS_FILE, STORE)
    if not ok then logger:warn("Could not save playtime sessions: " .. tostring(err or "write_failed")) end
    return ok
end

local function load_sessions()
    local data = config.read_text(SESSIONS_FILE)
    if not data or data == "" then
        -- Import the predecessor's optional file once, if it exists.
        data = config.read_text(config.path("sessions.json"))
    end
    if not data or data == "" then
        STORE = empty_store()
        return
    end

    local ok, decoded = pcall(cjson.decode, data)
    if not ok or type(decoded) ~= "table" then
        STORE = empty_store()
        logger:warn("Could not parse playtime sessions; starting with an empty store")
        return
    end

    if type(decoded.sessions) == "table" and type(decoded.aliases) == "table" then
        local loaded = empty_store()
        for key, list in pairs(decoded.sessions) do
            local canonical = valid_shortcut_id(key)
            if canonical and type(list) == "table" then loaded.sessions[canonical] = list end
        end
        for alias, canonical in pairs(decoded.aliases) do
            local id = valid_shortcut_id(canonical)
            if type(alias) == "string" and id and loaded.sessions[id] then
                loaded.aliases[alias] = id
            end
        end
        STORE = loaded
        return
    end

    STORE = migrate_legacy_store(decoded)
    if save_sessions() then
        logger:info("Migrated playtime sessions to canonical storage")
    end
end

local function register_aliases(keys, canonical)
    for _, key in ipairs(keys) do
        -- The canonical shortcut ID is the sessions key, never an alias.
        if not key:match("^id:") then STORE.aliases[key] = canonical end
    end
end

local function canonical_from_request(req, keys)
    local direct = valid_shortcut_id(req.shortcut_app_id or req.state_app_id or req.local_app_id)
    if direct then return direct end
    for _, key in ipairs(keys) do
        local canonical = valid_shortcut_id(STORE.aliases[key])
        if canonical and STORE.sessions[canonical] then return canonical end
    end
    return nil
end

local function find_sessions_list(req, keys)
    local canonical = canonical_from_request(req, keys)
    return canonical and STORE.sessions[canonical] or nil, canonical
end

local function ensure_sessions_list(req, keys)
    local canonical = canonical_from_request(req, keys)
    if not canonical then return nil, nil end
    if type(STORE.sessions[canonical]) ~= "table" then STORE.sessions[canonical] = {} end
    register_aliases(keys, canonical)
    return STORE.sessions[canonical], canonical
end

local function collapse_sessions(sessions)
    if type(sessions) ~= "table" or #sessions == 0 then return end
    local two_weeks_ago = os.time() - (14 * 24 * 60 * 60)
    local unix_epoch = 0
    local zero_session, latest_session = nil, nil
    local stale_sessions = {}

    for _, session in ipairs(sessions) do
        if session.started_at == unix_epoch then zero_session = session end
        if not latest_session or (session.ended_at or 0) > (latest_session.ended_at or 0) then
            latest_session = session
        end
        if (session.ended_at or 0) < two_weeks_ago then stale_sessions[#stale_sessions + 1] = session end
    end

    if not zero_session and #stale_sessions > 0 then
        zero_session = { started_at = unix_epoch, ended_at = unix_epoch }
        table.insert(sessions, 1, zero_session)
    end
    if not zero_session then return end

    for _, session in ipairs(stale_sessions) do
        if session ~= latest_session and session ~= zero_session then
            zero_session.ended_at = zero_session.ended_at + math.max(0, (session.ended_at or 0) - (session.started_at or 0))
            for index = #sessions, 1, -1 do
                if sessions[index] == session then table.remove(sessions, index); break end
            end
        end
    end
end

function M.start_session(request_json)
    load_sessions()
    local req = parse_request(request_json)
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions, canonical = ensure_sessions_list(req, keys)
    if not sessions then return cjson.encode({ ok = false, error = "missing_shortcut_app_id" }) end

    local instance_id, now = tostring(req.instance_id or os.time()), os.time()
    local existing = nil
    for _, session in ipairs(sessions) do
        if session.instance_id == instance_id then existing = session; break end
    end
    if existing then
        existing.ended_at = now
    else
        sessions[#sessions + 1] = { instance_id = instance_id, started_at = now, ended_at = now }
    end

    local saved = save_sessions()
    logger:info("Playtime session started for " .. tostring(req.title or canonical) .. " (" .. instance_id .. ")")
    return cjson.encode({ ok = saved, instance_id = instance_id, error = saved and nil or "save_failed" })
end

function M.ping_session(request_json)
    load_sessions()
    local req = parse_request(request_json)
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions = find_sessions_list(req, keys)
    local instance_id, now, updated = tostring(req.instance_id or ""), os.time(), false
    if sessions then
        for _, session in ipairs(sessions) do
            if session.instance_id == instance_id or (instance_id == "" and session.instance_id) then
                session.ended_at = now
                updated = true
                break
            end
        end
    end
    if updated and not save_sessions() then return cjson.encode({ ok = false, error = "save_failed" }) end
    return cjson.encode({ ok = updated })
end

function M.stop_session(request_json)
    load_sessions()
    local req = parse_request(request_json)
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions, canonical = find_sessions_list(req, keys)
    local instance_id, now, stopped = tostring(req.instance_id or ""), os.time(), false
    if sessions then
        for _, session in ipairs(sessions) do
            if session.instance_id == instance_id or instance_id == "" then
                session.ended_at = now
                session.instance_id = nil
                stopped = true
                break
            end
        end
        collapse_sessions(sessions)
        if not save_sessions() then return cjson.encode({ ok = false, error = "save_failed" }) end
    end
    logger:info("Playtime session stopped for " .. tostring(req.title or canonical or ""))
    return cjson.encode({ ok = stopped })
end

function M.get_playtime(request_json)
    load_sessions()
    local req = parse_request(request_json)
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions = find_sessions_list(req, keys) or {}
    local two_weeks_ago, unix_epoch = os.time() - (14 * 24 * 60 * 60), 0
    local seconds_forever, seconds_last_two_weeks, last_played_at = 0, 0, 0

    for _, session in ipairs(sessions) do
        local started = session.started_at or 0
        local ended = session.ended_at or started
        local duration = math.max(0, ended - started)
        seconds_forever = seconds_forever + duration
        if started > two_weeks_ago or ended > two_weeks_ago then seconds_last_two_weeks = seconds_last_two_weeks + duration end
        if started ~= unix_epoch and ended > last_played_at then last_played_at = ended end
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
    local req = parse_request(request_json)
    local minutes = math.max(0, tonumber(req.minutes_forever or 0) or 0)
    local keys = candidate_keys(req.shortcut_app_id, req.steam_app_id, req.title)
    local sessions, canonical = ensure_sessions_list(req, keys)
    if not sessions then return cjson.encode({ ok = false, error = "missing_shortcut_app_id" }) end

    STORE.sessions[canonical] = { { started_at = 0, ended_at = math.floor(minutes * 60) } }
    local saved = save_sessions()
    logger:info("Playtime manually set for " .. tostring(req.title or canonical) .. ": " .. tostring(minutes) .. " mins")
    return cjson.encode({ ok = saved, minutes_forever = minutes, error = saved and nil or "save_failed" })
end

load_sessions()
return M
end
