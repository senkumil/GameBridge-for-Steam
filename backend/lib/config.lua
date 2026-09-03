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
    local fallback = fs.join(steam, "millennium", "plugins", "NativeGameLinkForSteam")
    logger:warn("Using fallback plugin path: " .. tostring(fallback))
    return fallback
end

function M.path(filename)
    return fs.join(M.plugin_dir(), filename)
end

-- Runtime data must not live inside the plugin directory: updates and clean
-- reinstalls commonly replace that directory.  APPDATA is intentionally used
-- on Windows because it survives Steam/plugin replacement and is user-owned.
-- Keep the plugin directory as a fallback for unusual environments where no
-- user data directory is exposed.
local function persistent_data_directory()
    local root = tostring(os.getenv("APPDATA") or "")
    if root == "" then root = tostring(os.getenv("LOCALAPPDATA") or "") end
    if root == "" then root = tostring(os.getenv("XDG_DATA_HOME") or "") end
    if root == "" then return M.plugin_dir() end
    return fs.join(root, "NativeGameLinkForSteam")
end

function M.persistent_path(filename)
    return fs.join(persistent_data_directory(), filename)
end

-- Runtime state inside the plugin directory is deliberately never trusted.
-- Historical ZIPs accidentally contained developer-local mappings, paths and
-- sessions; migrating those files would contaminate another user's install.
-- Existing trustworthy state already lives in the per-user data directory,
-- while frontend mapping snapshots are independently validated against the
-- active Steam shortcut registry before they can repair an empty backend.
function M.state_path(filename)
    return M.persistent_path(tostring(filename or ""))
end

function M.get_config_path()
    return M.state_path("mappings.json")
end

-- Compatibility alias used by the artwork cleanup module.
function M.mappings_file_path()
    return M.get_config_path()
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

-- Persist a small rotating recovery chain while retaining atomic replacement
-- of the primary file.  This is separate from write_json_atomic because most
-- plugin settings intentionally keep only the existing short-lived backup.
function M.write_json_atomic_with_backups(path, value, max_backups)
    local ok_encode, encoded = pcall(cjson.encode, value)
    if not ok_encode then return false, tostring(encoded) end

    local dir = fs.parent_path(path)
    if dir and dir ~= "" and not fs.exists(dir) then fs.create_directories(dir) end

    local temp = path .. ".tmp"
    local f, err = io.open(temp, "wb")
    if not f then return false, tostring(err or "open_failed") end
    local ok_write, write_err = pcall(function()
        f:write(encoded)
        f:flush()
    end)
    f:close()
    if not ok_write then os.remove(temp); return false, tostring(write_err) end

    local keep = math.max(1, math.floor(tonumber(max_backups or 3) or 3))
    local had_previous = fs.exists(path)
    if had_previous then
        -- .bak is newest; .bak.1, .bak.2, ... are older snapshots.  Keep
        -- exactly `keep` recovery copies in total, including .bak.
        local oldest = path .. (keep == 1 and ".bak" or ".bak." .. tostring(keep - 1))
        if fs.exists(oldest) then os.remove(oldest) end
        for index = keep - 1, 1, -1 do
            local source = path .. (index == 1 and ".bak" or ".bak." .. tostring(index - 1))
            local target = path .. ".bak." .. tostring(index)
            if fs.exists(target) then os.remove(target) end
            if fs.exists(source) then os.rename(source, target) end
        end
        if not os.rename(path, path .. ".bak") then
            os.remove(temp)
            return false, "backup_failed"
        end
    end

    if not os.rename(temp, path) then
        if had_previous and fs.exists(path .. ".bak") then os.rename(path .. ".bak", path) end
        os.remove(temp)
        return false, "commit_failed"
    end
    return true, nil
end

return M
end
