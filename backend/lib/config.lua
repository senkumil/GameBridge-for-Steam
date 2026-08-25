return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local cjson = deps.cjson
local fs = deps.fs
local M = {}

local function backend_directory()
    local raw = tostring(MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or "")
    if raw ~= "" then
        if raw:lower():match("%.lua$") then return fs.parent_path(raw) end
        if fs.exists(fs.join(raw, "main.lua")) then return raw end
        return raw
    end
    return ""
end

function M.backend_dir()
    return backend_directory()
end

function M.plugin_dir()
    local backend = backend_directory()
    if backend ~= "" then
        local parent = fs.parent_path(backend)
        if parent and parent ~= "" then return parent end
    end
    local steam = millennium.steam_path()
    local fallback = fs.join(steam, "plugins", "game-data-linker")
    logger:warn("Using fallback plugin path: " .. tostring(fallback))
    return fallback
end

function M.path(filename)
    return fs.join(M.plugin_dir(), filename)
end

function M.get_config_path()
    return M.path("mappings.json")
end

function M.read_text(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local data = f:read("*a")
    f:close()
    return data
end

function M.write_text_atomic(path, content)
    local dir = fs.parent_path(path)
    if dir and dir ~= "" and not fs.exists(dir) then fs.create_directories(dir) end
    local temp = path .. ".tmp"
    local backup = path .. ".bak"
    local f, err = io.open(temp, "wb")
    if not f then return false, tostring(err or "open_failed") end
    local ok_write, write_err = pcall(function() f:write(content) end)
    f:close()
    if not ok_write then os.remove(temp); return false, tostring(write_err) end

    local had_previous = fs.exists(path)
    if had_previous then
        if fs.exists(backup) then os.remove(backup) end
        local moved = os.rename(path, backup)
        if not moved then os.remove(temp); return false, "backup_failed" end
    end
    local committed = os.rename(temp, path)
    if not committed then
        if had_previous and fs.exists(backup) then os.rename(backup, path) end
        os.remove(temp)
        return false, "commit_failed"
    end
    if fs.exists(backup) then os.remove(backup) end
    return true, nil
end

function M.read_json(path, fallback)
    if not fs.exists(path) then return fallback end
    local content = M.read_text(path)
    if not content or content == "" then return fallback end
    local ok, value = pcall(cjson.decode, content)
    if not ok or type(value) ~= "table" then
        logger:warn("Failed to parse JSON " .. tostring(path) .. ": " .. tostring(value))
        return fallback
    end
    return value
end

function M.write_json_atomic(path, value)
    local ok, encoded = pcall(cjson.encode, value)
    if not ok then return false, tostring(encoded) end
    return M.write_text_atomic(path, encoded)
end

return M
end
