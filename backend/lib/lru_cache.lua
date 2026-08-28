-- Small bounded-cache helper shared by backend modules. Values remain regular
-- Lua tables; the helper only maintains a monotonic access marker and evicts
-- the least-recently-used entries once a caller-defined ceiling is exceeded.
return function(_deps)
local M = {}
local clock = 0

function M.touch(value)
    clock = clock + 1
    if type(value) == "table" then value.access = clock end
    return value
end

function M.trim(cache, limit)
    local count = 0
    for _ in pairs(cache) do count = count + 1 end
    while count > limit do
        local oldest_key, oldest_access = nil, math.huge
        for key, value in pairs(cache) do
            local touched = tonumber(type(value) == "table" and value.access or 0) or 0
            if touched < oldest_access then oldest_key, oldest_access = key, touched end
        end
        if not oldest_key then break end
        cache[oldest_key] = nil
        count = count - 1
    end
end

function M.put(cache, key, value, limit)
    cache[key] = M.touch(value)
    M.trim(cache, limit)
    return value
end

return M
end
