return function(deps)
local logger = deps.logger
local cjson = deps.cjson
local config = deps.config
local M = {}

local function backup_path()
    return config.state_path("mappings.backup.json")
end

local function read_mappings()
    local primary = config.read_json(config.get_config_path(), {}) or {}
    if next(primary) ~= nil then
        local backup = config.read_json(backup_path(), {}) or {}
        if next(backup) == nil then
            local seeded, seed_err = config.write_json_atomic(backup_path(), primary)
            if not seeded then logger:warn("Could not seed mappings backup: " .. tostring(seed_err)) end
        end
        return primary
    end
    local backup = config.read_json(backup_path(), {}) or {}
    if next(backup) ~= nil then
        logger:warn("Primary mappings were empty; restoring the persistent backup")
        local restored, restore_err = config.write_json_atomic(config.get_config_path(), backup)
        if not restored then logger:warn("Could not restore mappings backup: " .. tostring(restore_err)) end
        return backup
    end
    return primary
end

local function write_mappings(data)
    local ok, err = config.write_json_atomic(config.get_config_path(), data)
    if not ok then logger:warn("Could not write mappings: " .. tostring(err)) end
    if not ok then return false end
    local backup_ok, backup_err = config.write_json_atomic(backup_path(), data)
    if not backup_ok then logger:warn("Could not write mappings backup: " .. tostring(backup_err)) end
    return true
end

function M.read_mappings()
    return read_mappings()
end

function M.save_mapping(non_steam_id, steam_id)
    logger:info("Saving mapping: " .. tostring(non_steam_id) .. " -> " .. tostring(steam_id))
    local data = read_mappings()
    data[tostring(non_steam_id)] = tostring(steam_id)
    return write_mappings(data) and "ok" or "error"
end

function M.remove_mapping(non_steam_id)
    logger:info("Removing mapping for: " .. tostring(non_steam_id))
    local data = read_mappings()
    data[tostring(non_steam_id)] = nil
    return write_mappings(data) and "ok" or "error"
end

function M.update_mappings(request_json)
    local ok, request = pcall(cjson.decode, tostring(request_json or "{}"))
    if not ok or type(request) ~= "table" then
        return cjson.encode({ ok = false, error = "invalid_request" })
    end
    local data = read_mappings()
    local set_values = type(request.set) == "table" and request.set or {}
    local remove_values = type(request.remove) == "table" and request.remove or {}
    for key, value in pairs(set_values) do
        if tostring(value):match("^%d+$") then data[tostring(key)] = tostring(value) end
    end
    for _, key in ipairs(remove_values) do data[tostring(key)] = nil end
    local written = write_mappings(data)
    return cjson.encode({ ok = written == true, error = written and nil or "write_failed", data = written and data or nil })
end

function M.get_all_mappings()
    return cjson.encode(read_mappings())
end

return M
end
