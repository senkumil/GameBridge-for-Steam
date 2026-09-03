return function(deps)
local millennium = deps.millennium
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local M = {}

local function encode(value)
    return cjson.encode(util.sanitize_utf8_tree(value))
end

local function basename(value)
    return tostring(value or ""):gsub("[\\/]+$", ""):match("([^\\/]+)$") or ""
end

local function clean_path(value)
    local text = tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
    local quoted = text:match('^"(.-)"$')
    return quoted or text
end

local function read_binary(path)
    if not path or path == "" or not fs.exists(path) then return nil end
    local file = io.open(path, "rb")
    if not file then return nil end
    local data = file:read("*a")
    file:close()
    if not data or data == "" or #data > 8 * 1024 * 1024 then return nil end
    return data
end

local function cstring(data, position)
    local finish = data:find("\0", position, true)
    if not finish then return nil, position end
    return data:sub(position, finish - 1), finish + 1
end

local function i32(data, position)
    local b1, b2, b3, b4 = data:byte(position, position + 3)
    if not b4 then return nil, position end
    local value = b1 + b2 * 256 + b3 * 65536 + b4 * 16777216
    if value >= 2147483648 then value = value - 4294967296 end
    return value, position + 4
end

local function parse_object(data, position, depth)
    if depth > 16 then return nil, position end
    local result = {}
    while position <= #data do
        local kind = data:byte(position)
        position = position + 1
        if kind == 8 then return result, position end
        local key
        key, position = cstring(data, position)
        if not key then return nil, position end
        if kind == 0 then
            local child
            child, position = parse_object(data, position, depth + 1)
            if not child then return nil, position end
            result[key] = child
        elseif kind == 1 then
            local value
            value, position = cstring(data, position)
            if value == nil then return nil, position end
            result[key] = value
        elseif kind == 2 then
            local value
            value, position = i32(data, position)
            if value == nil then return nil, position end
            result[key] = value
        elseif kind == 3 or kind == 4 or kind == 6 then
            position = position + 4
        elseif kind == 7 then
            position = position + 8
        elseif kind == 5 then
            local found = false
            while position + 1 <= #data do
                if data:byte(position) == 0 and data:byte(position + 1) == 0 then
                    position = position + 2
                    found = true
                    break
                end
                position = position + 2
            end
            if not found then return nil, position end
        else
            return nil, position
        end
    end
    return nil, position
end

local function unsigned_appid(value)
    local appid = tonumber(value)
    if not appid then return nil end
    if appid < 0 then appid = appid + 4294967296 end
    return math.floor(appid)
end

local function account_id_from_steamid64(id64)
    local text = tostring(id64 or "")
    if not text:match("^%d+$") then return nil end
    -- Avoid losing precision by reducing the decimal SteamID64 modulo 2^32.
    local value = 0
    for i = 1, #text do
        value = (value * 10 + tonumber(text:sub(i, i))) % 4294967296
    end
    return tostring(math.floor(value))
end

local function preferred_account_id()
    local steam_path = millennium.steam_path()
    local loginusers = fs.join(steam_path, "config", "loginusers.vdf")
    local users = {}
    if fs.exists(loginusers) then
        local file = io.open(loginusers, "r")
        if file then
            local content = file:read("*a") or ""
            file:close()
            local current = nil
            for line in content:gmatch("[^\r\n]+") do
                local id64 = line:match('^%s*"(%d%d%d%d%d%d%d%d%d+)"%s*$')
                if id64 then
                    current = { id64 = id64, most_recent = false, auto_login = false, timestamp = 0 }
                    users[#users + 1] = current
                elseif current then
                    if line:match('"MostRecent"%s*"1"') then current.most_recent = true end
                    if line:match('"AutoLogin"%s*"1"') then current.auto_login = true end
                    local timestamp = line:match('"Timestamp"%s*"(%d+)"')
                    if timestamp then current.timestamp = tonumber(timestamp) or 0 end
                end
            end
        end
    end
    table.sort(users, function(a, b)
        if a.most_recent ~= b.most_recent then return a.most_recent end
        if a.auto_login ~= b.auto_login then return a.auto_login end
        return (a.timestamp or 0) > (b.timestamp or 0)
    end)
    local userdata_root = fs.join(steam_path, "userdata")
    for _, user in ipairs(users) do
        local account_id = account_id_from_steamid64(user.id64)
        if account_id and fs.exists(fs.join(userdata_root, account_id)) then return account_id end
    end
    return nil
end

M.preferred_account_id = preferred_account_id

local function shortcut_files()
    local root = fs.join(millennium.steam_path(), "userdata")
    local files = {}
    if not fs.exists(root) then return files end
    local ok, entries = pcall(fs.list, root)
    if ok and type(entries) == "table" then
        for _, entry in ipairs(entries) do
            local path = tostring(entry.path or "")
            local account_id = tostring(entry.name or basename(path)):match("^(%d+)$")
            if account_id then
                if path == "" then path = fs.join(root, account_id) end
                local file = fs.join(path, "config", "shortcuts.vdf")
                if fs.exists(file) then
                    files[#files + 1] = { path = file, account_id = account_id, modified = tonumber(fs.last_write_time(file) or 0) or 0 }
                end
            end
        end
    end
    local preferred = preferred_account_id()
    table.sort(files, function(a, b)
        local ap = preferred ~= nil and a.account_id == preferred
        local bp = preferred ~= nil and b.account_id == preferred
        if ap ~= bp then return ap end
        return a.modified > b.modified
    end)
    return files
end

function M.list()
    for _, file in ipairs(shortcut_files()) do
        local data = read_binary(file.path)
        if data then
            local root = parse_object(data, 1, 0)
            local shortcuts = type(root) == "table" and (root.shortcuts or root) or nil
            if type(shortcuts) == "table" then
                local result = {}
                for _, record in pairs(shortcuts) do
                    if type(record) == "table" then
                        local appid = unsigned_appid(record.appid or record.AppID or record.appid_64 or record.appid64)
                        local title = tostring(record.AppName or record.appname or record.Name or record.name or ""):gsub("^%s+", ""):gsub("%s+$", "")
                        if appid and appid >= 2147483648 and title ~= "" then
                            result[#result + 1] = {
                                shortcut_app_id = tostring(appid), title = title,
                                exe_path = clean_path(record.Exe or record.exe or ""),
                                start_dir = clean_path(record.StartDir or record.startdir or ""),
                                launch_options = tostring(record.LaunchOptions or record.launchoptions or ""):gsub("^%s+", ""):gsub("%s+$", ""),
                                source = "shortcuts_vdf", account_id = tostring(file.account_id or ""),
                            }
                        end
                    end
                end
                -- A successfully parsed active-account file is authoritative
                -- even when it contains zero shortcuts. Falling through to a
                -- different Steam account would leak stale shortcuts into this
                -- user's library and can resurrect foreign mappings.
                table.sort(result, function(a, b) return a.title:lower() < b.title:lower() end)
                return encode({ ok = true, shortcuts = result, account_id = tostring(file.account_id or "") })
            end
        end
    end
    return encode({ ok = true, shortcuts = {} })
end

return M
end
