-- Change-aware decoder for live local achievement state. Polling callers
-- reuse the decoded table until the JSON modification time changes.
return function(deps)
local cjson = deps.cjson
local fs = deps.fs
local logger = deps.logger
local lru = deps.lru_cache
local M = {}
local cache = {}
local MAX_ENTRIES = 48

local function read_text(path)
    if not path or path == "" then return nil end
    local file = io.open(path, "rb")
        or io.open(path:gsub("\\", "/"), "rb")
        or io.open(path:gsub("/", "\\"), "rb")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    return content
end

function M.decode(path)
    local modified = tonumber(fs.last_write_time(path) or 0) or 0
    if modified <= 0 then
        local content = read_text(path)
        if not content or content == "" then return nil end
        local ok, data = pcall(cjson.decode, content)
        if ok and type(data) == "table" then return data end
        logger:warn("Local achievements JSON parse failed: " .. tostring(path))
        return nil
    end
    local cached = cache[path]
    if cached and cached.modified == modified then
        lru.touch(cached)
        return cached.data
    end
    local content = read_text(path)
    if not content or content == "" then return nil end
    local ok, data = pcall(cjson.decode, content)
    if not ok or type(data) ~= "table" then
        logger:warn("Local achievements JSON parse failed: " .. tostring(path))
        return nil
    end
    lru.put(cache, path, { modified = modified, data = data }, MAX_ENTRIES)
    return data
end

function M.clear()
    cache = {}
end

return M
end
