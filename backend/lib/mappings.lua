return function(deps)
local logger = deps.logger
local cjson = deps.cjson
local config = deps.config
local M = {}

local function read_mappings()
    return config.read_json(config.get_config_path(), {}) or {}
end

local function write_mappings(data)
    local ok, err = config.write_json_atomic(config.get_config_path(), data)
    if not ok then logger:warn("Could not write mappings: " .. tostring(err)) end
    return ok
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
    local written, err = config.write_json_atomic(config.get_config_path(), data)
    return cjson.encode({ ok = written == true, error = written and nil or tostring(err or "write_failed"), data = written and data or nil })
end

function M.get_all_mappings()
    return cjson.encode(read_mappings())
end

return M
end
