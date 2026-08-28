return function(deps)
local cjson = deps.cjson
local fs = deps.fs
local lru = deps.lru_cache
local M = {}
local root_scan_cache = {}
local decoded_schema_cache = {}
local MAX_ROOT_CACHE_ENTRIES = 16
local MAX_SCHEMA_CACHE_ENTRIES = 96

local function read_json(path)
    local file = io.open(path, "rb")
        or io.open(tostring(path):gsub("\\", "/"), "rb")
        or io.open(tostring(path):gsub("/", "\\"), "rb")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    if not content or content == "" then return nil end
    local ok, data = pcall(cjson.decode, content)
    if not ok or type(data) ~= "table" then return nil end
    return data
end

local function read_json_cached(path, modified)
    if modified <= 0 then return read_json(path) end
    local cached = decoded_schema_cache[path]
    if cached and cached.modified == modified then
        lru.touch(cached)
        return cached.data
    end
    local data = read_json(path)
    if data then
        lru.put(decoded_schema_cache, path, { modified = modified, data = data }, MAX_SCHEMA_CACHE_ENTRIES)
    end
    return data
end

local function metadata_names(metadata)
    local names, count = {}, 0
    for name, item in pairs(type(metadata) == "table" and metadata or {}) do
        if type(name) ~= "string" or name == "" or type(item) ~= "table" then return nil, 0 end
        names[name] = true
        count = count + 1
    end
    return count > 0 and names or nil, count
end

local function metadata_signature(names, count)
    local ordered = {}
    for name in pairs(names or {}) do ordered[#ordered + 1] = name end
    table.sort(ordered)
    return tostring(count or 0) .. ":" .. table.concat(ordered, "\31")
end

local function exact_progress_schema(state, expected_names, expected_count)
    if type(state) ~= "table" or not expected_names or expected_count <= 0 then return false end
    local count, has_state_field = 0, false
    for name, item in pairs(state) do
        if type(name) ~= "string" or not expected_names[name] or type(item) ~= "table" then return false end
        count = count + 1
        if item.earned ~= nil or item.earned_time ~= nil
            or item.progress ~= nil or item.max_progress ~= nil then
            has_state_field = true
        end
    end
    -- Exact equality is deliberate: a mere equal count could associate an old
    -- Shortcut AppID with a different game that happens to have as many goals.
    return has_state_field and count == expected_count
end

local function folder_id(entry, root)
    local path = tostring(entry.path or "")
    local name = tostring(entry.name or "")
    if name == "" then name = path:match("([^\\/]+)[\\/]?$") or "" end
    if not name:match("^%d+$") then return nil, nil end
    if path == "" then path = fs.join(root, name) end
    return name, path
end

local function candidate_paths(directory)
    return {
        fs.join(directory, "achievements.json"),
        fs.join(directory, "stats", "achievements.json"),
        fs.join(directory, "steam_settings", "achievements.json"),
    }
end

local function known_rank(folder, metadata_appid, state_appid)
    if folder == metadata_appid then return 0 end
    if folder == state_appid then return 1 end
    return 2
end

-- Find progress left under an older, locally generated Shortcut AppID. This is
-- intentionally read-only: it never renames, merges or rewrites user files.
-- Every achievement key must match the official linked game's schema, and the
-- newest matching JSON wins. Known IDs only break equal-timestamp ties.
function M.find_matching_root_candidates(root, metadata, metadata_appid, state_appid)
    local expected_names, expected_count = metadata_names(metadata)
    if not expected_names or not root or root == "" or not fs.exists(root) then return {} end

    local ok_list, entries = pcall(fs.list, root)
    if not ok_list or type(entries) ~= "table" then return {} end
    metadata_appid = tostring(metadata_appid or "")
    state_appid = tostring(state_appid or "")

    local inventory, files = {}, {}
    local cacheable_inventory = true
    for _, entry in ipairs(entries) do
        if entry.is_directory then
            local id, directory = folder_id(entry, root)
            if id and directory then
                for _, path in ipairs(candidate_paths(directory)) do
                    if fs.exists(path) then
                        local modified = tonumber(fs.last_write_time(path) or 0) or 0
                        if modified <= 0 then cacheable_inventory = false end
                        inventory[#inventory + 1] = path .. "=" .. tostring(modified)
                        files[#files + 1] = { path = path, appid = id, schema_dir = directory, modified = modified }
                    end
                end
            end
        end
    end

    table.sort(inventory)
    local cache_key = tostring(root) .. "|" .. metadata_signature(expected_names, expected_count)
    local inventory_signature = table.concat(inventory, "\30")
    local cached = root_scan_cache[cache_key]
    local base_matches
    if cacheable_inventory and cached and cached.inventory == inventory_signature then
        lru.touch(cached)
        base_matches = cached.matches
    else
        base_matches = {}
        for _, file in ipairs(files) do
            local state = read_json_cached(file.path, file.modified)
            if exact_progress_schema(state, expected_names, expected_count) then
                base_matches[#base_matches + 1] = file
            end
        end
        if cacheable_inventory then
            lru.put(root_scan_cache, cache_key, {
                inventory = inventory_signature,
                matches = base_matches,
            }, MAX_ROOT_CACHE_ENTRIES)
        end
    end

    local matches = {}
    for _, candidate in ipairs(base_matches) do
        local id = tostring(candidate.appid)
        matches[#matches + 1] = {
            path = candidate.path,
            appid = id,
            schema_dir = candidate.schema_dir,
            modified = candidate.modified,
            rank = known_rank(id, metadata_appid, state_appid),
            source = (id == metadata_appid or id == state_appid)
                and "configured_root_schema_match"
                or ("historical_schema_match:" .. id),
        }
    end

    table.sort(matches, function(a, b)
        if a.modified ~= b.modified then return a.modified > b.modified end
        if a.rank ~= b.rank then return a.rank < b.rank end
        return tostring(a.path) < tostring(b.path)
    end)
    return matches
end

function M.clear_cache()
    root_scan_cache = {}
    decoded_schema_cache = {}
end

return M
end
