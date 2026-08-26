return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local USER_AGENT = deps.user_agent or "GameBridge-for-Steam/2.0.0"
local M = {}
local detection_url_encode = util.url_encode

-- Bounded LRU caches. TTL alone does not release entries that are never read
-- again, which matters during long-running Steam sessions with many games.
local function detection_new_cache(limit)
    return { entries = {}, count = 0, limit = limit, clock = 0 }
end

local function detection_cache_remove(cache, key)
    if cache.entries[key] then
        cache.entries[key] = nil
        cache.count = cache.count - 1
    end
end

local function detection_cache_get(cache, key, ttl)
    local entry = cache.entries[key]
    if not entry then return nil end
    if ttl and os.time() - entry.time >= ttl then
        detection_cache_remove(cache, key)
        return nil
    end
    cache.clock = cache.clock + 1
    entry.last_used = cache.clock
    return entry
end

local function detection_cache_set(cache, key, entry)
    local now = os.time()
    -- Opportunistically remove expired records before evicting a usable one.
    for cached_key, cached in pairs(cache.entries) do
        if cached.ttl and now - cached.time >= cached.ttl then
            detection_cache_remove(cache, cached_key)
        end
    end
    if not cache.entries[key] then cache.count = cache.count + 1 end
    cache.clock = cache.clock + 1
    entry.time = entry.time or now
    entry.last_used = cache.clock
    cache.entries[key] = entry

    while cache.count > cache.limit do
        local oldest_key, oldest_used = nil, nil
        for cached_key, cached in pairs(cache.entries) do
            if not oldest_used or cached.last_used < oldest_used then
                oldest_key, oldest_used = cached_key, cached.last_used
            end
        end
        if not oldest_key then break end
        detection_cache_remove(cache, oldest_key)
    end
end

local detection_candidate_cache = detection_new_cache(128)
local detection_vdf_cache = detection_new_cache(16)
local detection_store_cache = detection_new_cache(96)
local detection_appdetails_cache = detection_new_cache(96)
local detection_appinfo_cache = detection_new_cache(96)
-- A maintained alias (for example "re4") only narrows the search.  It must
-- never look like near-certain identification unless the candidate's official
-- Steam launch configuration also contains the executable we are inspecting.
local DETECTION_UNVERIFIED_ALIAS_MAX_SCORE = 84

local function detection_trim(value)
    return tostring(value or ""):match("^%s*(.-)%s*$") or ""
end

local function detection_clean_path(value)
    local path = detection_trim(value)
    local quoted = path:match('^"(.-)"$')
    if quoted then path = quoted end
    return path:gsub("/", "\\")
end

local function detection_basename(value)
    local path = detection_clean_path(value):gsub("[\\/]+$", "")
    return path:match("([^\\/]+)$") or path
end

local function detection_stem(value)
    return detection_basename(value):gsub("%.[^%.]+$", "")
end

local function detection_game_exe_hint(value)
    local stem = detection_basename(value)
    local lower = stem:lower()
    -- A shortcut added from the Windows desktop can reach us as
    -- "game.exe.lnk".  Peel wrapper extensions first, then the target
    -- executable extension, so aliases and executable similarity still use
    -- the real game hint instead of the shell shortcut name.
    while lower:match("%.lnk$") or lower:match("%.url$") do
        stem = detection_stem(stem)
        lower = stem:lower()
    end
    if lower:match("%.exe$") or lower:match("%.com$") or lower:match("%.bat$")
        or lower:match("%.cmd$") or lower:match("%.appimage$") then
        stem = detection_stem(stem)
    end
    stem = stem:gsub("[%s_%-]+[Ww][Ii][Nn]64[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    stem = stem:gsub("[%s_%-]+[Ww][Ii][Nn]32[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    stem = stem:gsub("[%s_%-]+[Ll][Ii][Nn][Uu][Xx][%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    return stem
end

local function detection_strip_accents(str)
    local accents = {
        ["á"] = "a", ["à"] = "a", ["ä"] = "a", ["â"] = "a", ["ã"] = "a", ["å"] = "a",
        ["é"] = "e", ["è"] = "e", ["ë"] = "e", ["ê"] = "e",
        ["í"] = "i", ["ì"] = "i", ["ï"] = "i", ["î"] = "i",
        ["ó"] = "o", ["ò"] = "o", ["ö"] = "o", ["ô"] = "o", ["õ"] = "o",
        ["ú"] = "u", ["ù"] = "u", ["ü"] = "u", ["û"] = "u",
        ["ñ"] = "n", ["ç"] = "c",
        ["Á"] = "a", ["À"] = "a", ["Ä"] = "a", ["Â"] = "a",
        ["É"] = "e", ["È"] = "e", ["Ë"] = "e", ["Ê"] = "e",
        ["Í"] = "i", ["Ì"] = "i", ["Ï"] = "i", ["Î"] = "i",
        ["Ó"] = "o", ["Ò"] = "o", ["Ö"] = "o", ["Ô"] = "o",
        ["Ú"] = "u", ["Ù"] = "u", ["Ü"] = "u", ["Û"] = "u",
        ["Ñ"] = "n", ["Ç"] = "c",
    }
    local res = tostring(str or "")
    for k, v in pairs(accents) do
        res = res:gsub(k, v)
    end
    return res
end

local function detection_normalize(value)
    local text = detection_strip_accents(tostring(value or "")):lower()
    text = text:gsub("™", ""):gsub("®", ""):gsub("©", "")
    text = text:gsub("[’'`´]", ""):gsub("[–—_:|/\\%[%]%(%){}]+", " ")
    text = text:gsub("[^%w]+", " "):gsub("%s+", " ")
    return detection_trim(text)
end

local function detection_clean_game_title(value)
    local text = tostring(value or "")
    text = text:gsub("%b[]", " ")
    text = text:gsub("%b()", " ")
    text = text:gsub("[vV]%d+%.%d+[%d%.]*", " ")
    text = text:gsub("[%s_%-]+[Bb][Uu][Ii][Ll][Dd][%s_%-]+%d+", " ")
    text = text:gsub("[%s_%-]+[Ww][Ii][Nn]%d%d[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]", " ")
    text = text:gsub("[%s_%-]+[Ll][Ii][Nn][Uu][Xx][%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]", " ")
    text = text:gsub("[%s_%-]+[Ww][Ii][Nn]%d%d$", "")
    text = text:gsub("[%s_%-]+[Xx]64$", "")
    text = text:gsub("[%s_%-]+[Xx]86$", "")
    text = text:gsub("[%s_%-]+[Dd][Xx]11$", "")
    text = text:gsub("[%s_%-]+[Dd][Xx]12$", "")
    text = text:gsub("[%s_%-]+[Rr][Ee][Pp][Aa][Cc][Kk]", " ")
    return detection_trim(text)
end

local function detection_replace_roman(value)
    local text = " " .. detection_normalize(value) .. " "
    text = text:gsub("%s+viii%s+", " 8 ")
    text = text:gsub("%s+vii%s+", " 7 ")
    text = text:gsub("%s+vi%s+", " 6 ")
    text = text:gsub("%s+iv%s+", " 4 ")
    text = text:gsub("%s+v%s+", " 5 ")
    text = text:gsub("%s+iii%s+", " 3 ")
    text = text:gsub("%s+ii%s+", " 2 ")
    text = text:gsub("%s+ix%s+", " 9 ")
    text = text:gsub("%s+x%s+", " 10 ")
    return detection_trim(text)
end

local DETECTION_GENERIC_WORDS = {
    launcher = true, launch = true, game = true, start = true, protected = true,
    shipping = true, win64 = true, win32 = true, windows = true, x64 = true,
    x86 = true, dx11 = true, dx12 = true, binary = true, binaries = true,
    games = true, juegos = true, steamapps = true, common = true,
    repack = true, fitgirl = true, dodi = true, gog = true, rune = true,
}

local DETECTION_GENERIC_EXES = {
    ["game"] = true, ["launcher"] = true, ["start"] = true,
    ["start protected game"] = true, ["playnite fullscreenapp"] = true,
    ["playnite desktopapp"] = true, ["heroic"] = true,
    ["epicgameslauncher"] = true, ["galaxyclient"] = true,
    ["retroarch"] = true, ["steam"] = true,
}

local KNOWN_TITLE_ALIASES = {
    ["gtasa"] = { name = "Grand Theft Auto: San Andreas", appids = { "12120", "1547000", "1546970" } },
    ["gta sa"] = { name = "Grand Theft Auto: San Andreas", appids = { "12120", "1547000", "1546970" } },
    ["gta_sa"] = { name = "Grand Theft Auto: San Andreas", appids = { "12120", "1547000", "1546970" } },
    ["sanandreas"] = { name = "Grand Theft Auto: San Andreas", appids = { "12120", "1547000", "1546970" } },
    ["san andreas"] = { name = "Grand Theft Auto: San Andreas", appids = { "12120", "1547000", "1546970" } },
    ["gtavc"] = { name = "Grand Theft Auto: Vice City", appids = { "12110", "1546990", "1546970" } },
    ["gta vc"] = { name = "Grand Theft Auto: Vice City", appids = { "12110", "1546990", "1546970" } },
    ["gta_vc"] = { name = "Grand Theft Auto: Vice City", appids = { "12110", "1546990", "1546970" } },
    ["vicecity"] = { name = "Grand Theft Auto: Vice City", appids = { "12110", "1546990", "1546970" } },
    ["vice city"] = { name = "Grand Theft Auto: Vice City", appids = { "12110", "1546990", "1546970" } },
    ["gta3"] = { name = "Grand Theft Auto III", appids = { "12100", "1546970" } },
    ["gta 3"] = { name = "Grand Theft Auto III", appids = { "12100", "1546970" } },
    ["gta iii"] = { name = "Grand Theft Auto III", appids = { "12100", "1546970" } },
    ["gtaiv"] = { name = "Grand Theft Auto IV: The Complete Edition", appids = { "12210" } },
    ["gta iv"] = { name = "Grand Theft Auto IV: The Complete Edition", appids = { "12210" } },
    ["gta 4"] = { name = "Grand Theft Auto IV: The Complete Edition", appids = { "12210" } },
    ["gtav"] = { name = "Grand Theft Auto V", appids = { "271590" } },
    ["gta v"] = { name = "Grand Theft Auto V", appids = { "271590" } },
    ["gta 5"] = { name = "Grand Theft Auto V", appids = { "271590" } },
    ["rdr2"] = { name = "Red Dead Redemption 2", appids = { "1174180" } },
    ["rdr 2"] = { name = "Red Dead Redemption 2", appids = { "1174180" } },
    ["gow"] = { name = "God of War", appids = { "1593500" } },
    ["god of war"] = { name = "God of War", appids = { "1593500" } },
    ["godofwar"] = { name = "God of War", appids = { "1593500" } },
    ["gowr"] = { name = "God of War Ragnarök", appids = { "2322010" } },
    ["gow ragnarok"] = { name = "God of War Ragnarök", appids = { "2322010" } },
    ["god of war ragnarok"] = { name = "God of War Ragnarök", appids = { "2322010" } },
    ["godofwarragnarok"] = { name = "God of War Ragnarök", appids = { "2322010" } },
    ["re4"] = { name = "Resident Evil 4", appids = { "2050650", "254700" } },
    ["re4r"] = { name = "Resident Evil 4", appids = { "2050650" } },
    ["re2"] = { name = "Resident Evil 2", appids = { "883710" } },
    ["re3"] = { name = "Resident Evil 3", appids = { "952060" } },
    ["re7"] = { name = "Resident Evil 7 Biohazard", appids = { "418370" } },
    ["re8"] = { name = "Resident Evil Village", appids = { "1196590" } },
    ["re9"] = { name = "Resident Evil Requiem", appids = { "3764200" } },
    ["resident evil requiem"] = { name = "Resident Evil Requiem", appids = { "3764200" } },
    ["revillage"] = { name = "Resident Evil Village", appids = { "1196590" } },
    ["cp2077"] = { name = "Cyberpunk 2077", appids = { "1091500" } },
    ["er"] = { name = "Elden Ring", appids = { "1245620" } },
    ["ds1"] = { name = "Dark Souls: Remastered", appids = { "570940" } },
    ["ds2"] = { name = "Dark Souls II: Scholar of the First Sin", appids = { "335300" } },
    ["ds3"] = { name = "Dark Souls III", appids = { "374320" } },
    ["mhw"] = { name = "Monster Hunter: World", appids = { "582010" } },
    ["mhr"] = { name = "Monster Hunter Rise", appids = { "1446780" } },
    ["dbd"] = { name = "Dead by Daylight", appids = { "381210" } },
    ["acv"] = { name = "Assassin's Creed Valhalla", appids = { "2208920" } },
    ["aco"] = { name = "Assassin's Creed Odyssey", appids = { "812140" } },
    ["hfw"] = { name = "Horizon Forbidden West Complete Edition", appids = { "2420110" } },
    ["hzd"] = { name = "Horizon Zero Dawn Complete Edition", appids = { "1151640" } },
    ["tlou"] = { name = "The Last of Us Part I", appids = { "1888930" } },
    ["tlou i"] = { name = "The Last of Us Part I", appids = { "1888930" } },
    ["tloui"] = { name = "The Last of Us Part I", appids = { "1888930" } },
    ["sh2"] = { name = "SILENT HILL 2", appids = { "2124490" } },
    ["sh2r"] = { name = "SILENT HILL 2", appids = { "2124490" } },
    ["sm2"] = { name = "Marvel's Spider-Man 2", appids = { "2651280" } },
    ["spiderman"] = { name = "Marvel's Spider-Man Remastered", appids = { "1817070" } },
    ["miles morales"] = { name = "Marvel's Spider-Man: Miles Morales", appids = { "1817190" } },
    -- Community/launcher abbreviations are useful only as search aliases;
    -- the stored shortcut title remains untouched until the user confirms.
    ["mkke"] = { name = "Mortal Kombat Komplete Edition", appids = { "237110" } },
    ["mortal kombat ke"] = { name = "Mortal Kombat Komplete Edition", appids = { "237110" } },
    ["bg3"] = { name = "Baldur's Gate 3", appids = { "1086940" } },
    ["wukong"] = { name = "Black Myth: Wukong", appids = { "2358720" } },
    ["sparkingzero"] = { name = "DRAGON BALL: Sparking! ZERO", appids = { "1790600" } },
    ["sparking zero"] = { name = "DRAGON BALL: Sparking! ZERO", appids = { "1790600" } },
    ["sparking"] = { name = "DRAGON BALL: Sparking! ZERO", appids = { "1790600" } },
    ["dragon ball sparking zero"] = { name = "DRAGON BALL: Sparking! ZERO", appids = { "1790600" } },
}

local function detection_tokens(value, discard_generic)
    local set, count = {}, 0
    for token in detection_normalize(value):gmatch("%S+") do
        if #token > 1 and (not discard_generic or not DETECTION_GENERIC_WORDS[token]) and not set[token] then
            set[token] = true
            count = count + 1
        end
    end
    return set, count
end

local function detection_raw_similarity(left, right)
    local a, ac = detection_tokens(left, false)
    local b, bc = detection_tokens(right, false)
    if ac == 0 or bc == 0 then return 0 end
    local common = 0
    for token in pairs(a) do if b[token] then common = common + 1 end end
    return (2 * common) / (ac + bc)
end

local function detection_similarity(left, right)
    return math.max(
        detection_raw_similarity(left, right),
        detection_raw_similarity(detection_replace_roman(left), detection_replace_roman(right))
    )
end

local function detection_raw_compact_similarity(left, right)
    local a = detection_normalize(left):gsub("%s+", "")
    local b = detection_normalize(right):gsub("%s+", "")
    if a == "" or b == "" then return 0 end
    if a == b then return 1 end
    local shorter, longer = a, b
    if #shorter > #longer then shorter, longer = longer, shorter end
    if #shorter >= 4 and longer:find(shorter, 1, true) then
        return math.min(0.95, (#shorter / #longer) + 0.30)
    end
    return 0
end

local function detection_compact_similarity(left, right)
    return math.max(
        detection_raw_compact_similarity(left, right),
        detection_raw_compact_similarity(detection_replace_roman(left), detection_replace_roman(right))
    )
end

local DETECTION_OPTIONAL_ACRONYM_WORDS = {
    part = true, chapter = true, episode = true, edition = true,
}

local function detection_title_acronym(value, omit_optional_words)
    local pieces = {}
    for token in detection_normalize(value):gmatch("%S+") do
        if token:match("^%d+$") or token:match("^[ivxlcdm]+$") then
            table.insert(pieces, token)
        elseif #token > 0 and (not omit_optional_words or not DETECTION_OPTIONAL_ACRONYM_WORDS[token]) then
            table.insert(pieces, token:sub(1, 1))
        end
    end
    return table.concat(pieces, "")
end

local function detection_acronym_similarity(left, right)
    local left_compact = detection_normalize(left):gsub("%s+", "")
    local right_compact = detection_normalize(right):gsub("%s+", "")
    local left_acronym = detection_title_acronym(left)
    local right_acronym = detection_title_acronym(right)
    local left_short_acronym = detection_title_acronym(left, true)
    local right_short_acronym = detection_title_acronym(right, true)
    local function compare(compact, acronym)
        if #compact < 3 or #acronym < 3 then return 0 end
        if compact == acronym then return 1 end
        if acronym:sub(1, #compact) == compact then return 0.96 end
        return 0
    end
    return math.max(
        compare(left_compact, right_acronym),
        compare(left_compact, right_short_acronym),
        compare(right_compact, left_acronym),
        compare(right_compact, left_short_acronym)
    )
end

local function detection_read_small_file(path, max_bytes)
    if not path or path == "" or not fs.exists(path) then return nil end
    local handle = io.open(path, "r")
    if not handle then return nil end
    local content = handle:read(max_bytes or 8192)
    handle:close()
    return content
end

local function detection_read_binary_file(path, max_bytes)
    if not path or path == "" or not fs.exists(path) then return nil end
    local handle = io.open(path, "rb")
    if not handle then return nil end
    local content = handle:read("*a")
    handle:close()
    if not content or content == "" or #content > (max_bytes or 8 * 1024 * 1024) then return nil end
    return content
end

local function detection_binary_cstring(data, position)
    local finish = data:find("\0", position, true)
    if not finish then return nil, position end
    return data:sub(position, finish - 1), finish + 1
end

local function detection_binary_i32(data, position)
    local b1, b2, b3, b4 = data:byte(position, position + 3)
    if not b4 then return nil, position end
    local value = b1 + b2 * 256 + b3 * 65536 + b4 * 16777216
    if value >= 2147483648 then value = value - 4294967296 end
    return value, position + 4
end

local function detection_parse_binary_vdf_object(data, position, depth)
    if depth > 16 then return nil, position, "maximum_depth" end
    local result = {}
    while position <= #data do
        local value_type = data:byte(position)
        position = position + 1
        if value_type == 8 then return result, position, nil end

        local key
        key, position = detection_binary_cstring(data, position)
        if not key then return nil, position, "invalid_key" end

        if value_type == 0 then
            local child, next_position, parse_error = detection_parse_binary_vdf_object(data, position, depth + 1)
            if not child then return nil, next_position, parse_error end
            result[key] = child
            position = next_position
        elseif value_type == 1 then
            local value
            value, position = detection_binary_cstring(data, position)
            if value == nil then return nil, position, "invalid_string" end
            result[key] = value
        elseif value_type == 2 then
            local value
            value, position = detection_binary_i32(data, position)
            if value == nil then return nil, position, "invalid_integer" end
            result[key] = value
        elseif value_type == 3 or value_type == 4 or value_type == 6 then
            if position + 3 > #data then return nil, position, "truncated_value" end
            position = position + 4
        elseif value_type == 7 then
            if position + 7 > #data then return nil, position, "truncated_uint64" end
            position = position + 8
        elseif value_type == 5 then
            local cursor = position
            local found = false
            while cursor + 1 <= #data do
                if data:byte(cursor) == 0 and data:byte(cursor + 1) == 0 then
                    position = cursor + 2
                    found = true
                    break
                end
                cursor = cursor + 2
            end
            if not found then return nil, position, "invalid_wstring" end
        else
            return nil, position, "unsupported_type_" .. tostring(value_type)
        end
    end
    return nil, position, "unexpected_eof"
end

local function detection_shortcut_appid(value)
    local appid = tonumber(value)
    if not appid then return nil end
    if appid < 0 then appid = appid + 4294967296 end
    return math.floor(appid)
end

local function detection_find_tracking_executable(exe_path, start_dir)
    local selected = detection_clean_path(exe_path)
    if selected == "" then return nil, nil end
    local lower_selected = selected:lower()
    if lower_selected:match("[%s_%-]win%d%d[%s_%-]shipping%.exe$")
        or lower_selected:match("[%s_%-]linux[%s_%-]shipping$") then
        return nil, nil
    end

    local root = detection_clean_path(start_dir)
    if root == "" then root = fs.parent_path(selected) end
    if not root or root == "" or not fs.exists(root) then return nil, nil end

    local selected_basename = detection_basename(selected)
    local selected_stem_raw = detection_game_exe_hint(selected_basename)
    local selected_stem_norm = detection_normalize(selected_stem_raw):gsub("%s+", "")

    -- Fast-path 1: Check standard Unreal direct target locations
    for _, platform in ipairs({ "Win64", "Win32" }) do
        local p1 = fs.join(root, selected_stem_raw, "Binaries", platform, selected_stem_raw .. "-" .. platform .. "-Shipping.exe")
        if fs.exists(p1) then return p1, fs.parent_path(p1) end
        local p2 = fs.join(root, "Binaries", platform, selected_stem_raw .. "-" .. platform .. "-Shipping.exe")
        if fs.exists(p2) then return p2, fs.parent_path(p2) end
    end

    -- Fast-path 2: Check Binaries/Win64 and Binaries/Win32 directly
    for _, platform in ipairs({ "Win64", "Win32" }) do
        for _, bin_dir in ipairs({
            fs.join(root, "Binaries", platform),
            fs.join(root, selected_stem_raw, "Binaries", platform),
        }) do
            if fs.exists(bin_dir) then
                local ok_list, entries = pcall(fs.list, bin_dir)
                if ok_list and type(entries) == "table" then
                    for _, entry in ipairs(entries) do
                        local name = tostring(entry.name or detection_basename(entry.path or ""))
                        local lower_name = name:lower()
                        if lower_name:match("[%s_%-]win%d%d[%s_%-]shipping%.exe$") then
                            local path = tostring(entry.path or "")
                            if path == "" then path = fs.join(bin_dir, name) end
                            return path, bin_dir
                        end
                    end
                end
            end
        end
    end

    -- Targeted shallow fallback walk (max depth 2, max 100 entries, skip heavy asset folders)
    local skipped_directories = {
        ["_commonredist"] = true, ["redist"] = true, ["redistributables"] = true,
        ["directx"] = true, ["vcredist"] = true, ["installers"] = true,
        ["content"] = true, ["engine"] = true, ["saved"] = true, ["intermediate"] = true,
        ["plugins"] = true, ["shaders"] = true, ["movies"] = true, ["videos"] = true,
        ["data"] = true, ["textures"] = true, ["audio"] = true, ["sounds"] = true,
        ["music"] = true, ["localization"] = true, ["node_modules"] = true,
    }
    local candidates = {}
    local visited = 0
    local function walk(directory, depth)
        if depth > 2 or visited >= 100 then return end
        local ok_list, entries = pcall(fs.list, directory)
        if not ok_list or type(entries) ~= "table" then return end
        for _, entry in ipairs(entries) do
            if visited >= 100 then break end
            visited = visited + 1
            local name = tostring(entry.name or detection_basename(entry.path or ""))
            local path = tostring(entry.path or "")
            if path == "" then path = fs.join(directory, name) end
            if entry.is_directory then
                if not skipped_directories[name:lower()] then walk(path, depth + 1) end
            else
                local lower_p = path:lower()
                if (lower_p:match("[%s_%-]win32[%s_%-]shipping%.exe$") or lower_p:match("[%s_%-]win64[%s_%-]shipping%.exe$"))
                    and lower_p ~= lower_selected then
                    local cand_stem = detection_normalize(detection_game_exe_hint(name)):gsub("%s+", "")
                    local score = 50
                    if selected_stem_norm ~= "" and cand_stem == selected_stem_norm then score = score + 80 end
                    if lower_p:find("\\binaries\\win64\\", 1, true) then score = score + 35 end
                    table.insert(candidates, { path = path, score = score })
                end
            end
        end
    end
    walk(root, 0)

    table.sort(candidates, function(a, b) return a.score > b.score end)
    if candidates[1] then return candidates[1].path, fs.parent_path(candidates[1].path) end
    return nil, nil
end

local function detection_find_shortcut_record(shortcut_app_id, shortcut_title)
    local target = detection_shortcut_appid(shortcut_app_id)
    local target_title_norm = detection_normalize(shortcut_title or "")
    if not target and target_title_norm == "" then return nil end
    local userdata_root = fs.join(millennium.steam_path(), "userdata")
    if not fs.exists(userdata_root) then return nil end

    local files = {}
    local ok_list, entries = pcall(fs.list, userdata_root)
    if ok_list and type(entries) == "table" then
        for _, entry in ipairs(entries) do
            local entry_path = tostring(entry.path or "")
            local account_id = tostring(entry.name or detection_basename(entry_path)):match("^(%d+)$")
            if account_id then
                if entry_path == "" then entry_path = fs.join(userdata_root, account_id) end
                local shortcut_file = fs.join(entry_path, "config", "shortcuts.vdf")
                if fs.exists(shortcut_file) then
                    table.insert(files, {
                        path = shortcut_file,
                        modified = tonumber(fs.last_write_time(shortcut_file) or 0) or 0,
                    })
                end
            end
        end
    end
    table.sort(files, function(a, b) return a.modified > b.modified end)

    for _, file in ipairs(files) do
        local shortcuts = nil
        local cached_vdf = detection_cache_get(detection_vdf_cache, file.path)
        if cached_vdf and cached_vdf.modified == file.modified then
            shortcuts = cached_vdf.shortcuts
        else
            local data = detection_read_binary_file(file.path)
            if data then
                local root = detection_parse_binary_vdf_object(data, 1, 0)
                shortcuts = type(root) == "table" and (root.shortcuts or root) or nil
                if type(shortcuts) == "table" then
                    detection_cache_set(detection_vdf_cache, file.path, { modified = file.modified, shortcuts = shortcuts })
                end
            end
        end

        if type(shortcuts) == "table" then
            for _, record in pairs(shortcuts) do
                if type(record) == "table" then
                    -- `shortcuts.vdf` keeps the shortcut id as an unsigned
                    -- 32-bit value, even though Steam's CEF can expose it as
                    -- a signed number.  Resolve both forms before comparing.
                    -- These fields are also the only reliable source of the
                    -- executable while a newly-created shortcut has not yet
                    -- been reflected in SteamClient's cached app details.
                    local rec_appid = detection_shortcut_appid(
                        record.appid or record.AppID or record.appid_64 or record.appid64)
                    local rec_title = detection_trim(record.AppName or record.appname or record.Name or record.name or "")
                    local matches_id = target ~= nil and rec_appid ~= nil and rec_appid == target
                    local rec_clean = detection_clean_game_title(rec_title):lower()
                    local target_clean = detection_clean_game_title(shortcut_title or ""):lower()
                    local matches_title = target_title_norm ~= "" and (
                        detection_normalize(rec_title) == target_title_norm
                        or (rec_clean ~= "" and rec_clean == target_clean)
                    )
                    if matches_id or matches_title then
                        local shortcut = {
                            shortcut_app_id = tostring(rec_appid or target or ""),
                            title = rec_title,
                            exe_path = detection_clean_path(record.Exe or record.exe or ""),
                            start_dir = detection_clean_path(record.StartDir or record.startdir or ""),
                            launch_options = detection_trim(record.LaunchOptions or record.launchoptions or ""),
                            source = "shortcuts_vdf",
                        }
                        local recommended_exe, recommended_start = detection_find_tracking_executable(
                            shortcut.exe_path, shortcut.start_dir)
                        if recommended_exe then
                            shortcut.bootstrap_detected = true
                            shortcut.recommended_exe_path = recommended_exe
                            shortcut.recommended_start_dir = recommended_start or ""
                        end
                        return shortcut
                    end
                end
            end
        end
    end
    return nil
end

function M.get_shortcut_details(shortcut_app_id)
    local target_id = shortcut_app_id
    local target_title = nil
    if type(shortcut_app_id) == "string" and shortcut_app_id:match("^%s*{") then
        local ok, parsed = pcall(cjson.decode, shortcut_app_id)
        if ok and type(parsed) == "table" then
            target_id = parsed.shortcut_app_id or parsed.id
            target_title = parsed.title or parsed.name
        end
    end
    local record = detection_find_shortcut_record(target_id, target_title)
    if not record then
        return cjson.encode({ error = "shortcut_not_found" })
    end
    logger:info("Resolved shortcut details from shortcuts.vdf for " .. tostring(target_id or target_title))
    return cjson.encode(record)
end

local function detection_http_json(url, timeout)
    local ok_http, res, err = pcall(http.get, url, {
        headers = {
            ["Accept"] = "application/json",
            ["User-Agent"] = USER_AGENT
        },
        timeout = timeout or 8
    })
    if not ok_http or not res or res.status ~= 200 then
        return nil, tostring(err or res or "HTTP request failed")
    end
    local ok_json, body = pcall(cjson.decode, res.body or "")
    if not ok_json or type(body) ~= "table" then return nil, "JSON parse failed" end
    return body, nil
end

local function detection_fetch_appdetails(appid, language)
    local id = tostring(appid or "")
    if not id:match("^%d+$") then return nil end
    local lang = language or "english"
    local cache_key = id .. "\31" .. lang
    local cached = detection_cache_get(detection_appdetails_cache, cache_key, 1800)
    if cached then return cached.data end

    local url = "https://store.steampowered.com/api/appdetails?appids=" .. id
        .. "&l=" .. detection_url_encode(lang)
    local body = detection_http_json(url, 6)
    local record = type(body) == "table" and body[id] or nil
    if type(record) == "table" and record.success and type(record.data) == "table" then
        detection_cache_set(detection_appdetails_cache, cache_key, { data = record.data, ttl = 1800 })
        return record.data
    end
    return nil
end

local function detection_appid_from_arguments(arguments)
    local args = tostring(arguments or "")
    return args:match("steam://rungameid/(%d+)")
        or args:match("[%-%/]appid[%s=]+(%d+)")
        or args:match("[%-%/]app_id[%s=]+(%d+)")
end

local function detection_find_steam_appid_file(exe_path)
    local directory = fs.parent_path(detection_clean_path(exe_path))
    for _ = 1, 4 do
        if not directory or directory == "" then break end
        local content = detection_read_small_file(fs.join(directory, "steam_appid.txt"), 128)
        local appid = content and content:match("(%d+)") or nil
        if appid then return appid, "steam_appid_file" end
        local parent = fs.parent_path(directory)
        if not parent or parent == "" or parent == directory then break end
        directory = parent
    end
    return nil, nil
end

local function detection_find_appmanifest(exe_path)
    local path = detection_clean_path(exe_path)
    local lower = path:lower()
    local marker = "\\steamapps\\common\\"
    local marker_start = lower:find(marker, 1, true)
    if not marker_start then return nil, nil end

    local steamapps_dir = path:sub(1, marker_start + #("\\steamapps") - 1)
    local relative = path:sub(marker_start + #marker)
    local install_folder = relative:match("^([^\\]+)")
    if not install_folder or install_folder == "" then return nil, nil end

    local ok_list, entries = pcall(fs.list, steamapps_dir)
    if not ok_list or type(entries) ~= "table" then return nil, nil end
    for _, entry in ipairs(entries) do
        local entry_path = tostring(entry.path or "")
        local name = tostring(entry.name or detection_basename(entry_path))
        local manifest_id = name:match("^appmanifest_(%d+)%.acf$")
        if manifest_id then
            if entry_path == "" then entry_path = fs.join(steamapps_dir, name) end
            local content = detection_read_small_file(entry_path, 256 * 1024)
            local install_dir = content and content:match('"installdir"%s*"([^"]+)"') or nil
            if install_dir and install_dir:lower() == install_folder:lower() then
                local content_id = content:match('"appid"%s*"(%d+)"')
                return content_id or manifest_id, "steam_appmanifest"
            end
        end
    end
    return nil, nil
end

local function detection_store_search(query, language)
    local cleaned = detection_trim(query)
    if #cleaned < 2 then return {} end
    local lang = language or "english"
    local cache_key = cleaned:lower() .. "\31" .. lang
    local cached = detection_cache_get(detection_store_cache, cache_key, 600)
    if cached then return cached.items end

    local url = "https://store.steampowered.com/api/storesearch/?term="
        .. detection_url_encode(cleaned)
        .. "&l=" .. detection_url_encode(lang)
        .. "&cc=US"
    local body = detection_http_json(url, 4)
    local items = type(body) == "table" and type(body.items) == "table" and body.items or {}
    detection_cache_set(detection_store_cache, cache_key, { items = items, ttl = 600 })
    return items
end

local function detection_fetch_appinfo(appid)
    local id = tostring(appid or "")
    if not id:match("^%d+$") then return nil end
    local cached = detection_cache_get(detection_appinfo_cache, id, 1800)
    if cached then return cached.data end

    local body = detection_http_json("https://api.steamcmd.net/v1/info/" .. id, 2)
    local data = type(body) == "table" and type(body.data) == "table" and body.data[id] or nil
    if data then detection_cache_set(detection_appinfo_cache, id, { data = data, ttl = 1800 }) end
    return data
end

local function detection_collect_launch_executables(node, result, depth)
    if type(node) ~= "table" or depth > 8 then return end
    for key, value in pairs(node) do
        local lowered = tostring(key):lower()
        if type(value) == "string" and (lowered == "executable" or lowered == "binary") then
            local basename = detection_basename(value):lower()
            if basename ~= "" then result[basename] = true end
        elseif type(value) == "table" then
            detection_collect_launch_executables(value, result, depth + 1)
        end
    end
end

local function detection_folder_hints(exe_path, start_dir)
    local hints, seen = {}, {}
    local function add(value)
        local cleaned = detection_clean_game_title(value)
        local normalized = detection_normalize(cleaned)
        if cleaned ~= "" and normalized ~= "" and not seen[normalized] then
            seen[normalized] = true
            table.insert(hints, cleaned)
        end
    end
    local directory = detection_clean_path(start_dir)
    if directory == "" then directory = fs.parent_path(detection_clean_path(exe_path)) end
    for _ = 1, 3 do
        if not directory or directory == "" then break end
        add(detection_basename(directory))
        local parent = fs.parent_path(directory)
        if not parent or parent == directory then break end
        directory = parent
    end
    return hints
end

local function detection_add_reason(candidate, reason)
    candidate._reason_set = candidate._reason_set or {}
    if not candidate._reason_set[reason] then
        candidate._reason_set[reason] = true
        table.insert(candidate.reasons, reason)
    end
end

local function detection_direct_result(appid, source, request, language, launcher, generic_launcher)
    local data = detection_fetch_appdetails(appid, language)
    -- Local steam_appid.txt files are common in launchers and modified game
    -- folders. They are a useful hint, not proof: only promote one to an
    -- exact result after the official Store API confirms that it is an app.
    if not data or not data.name or data.name == "" then return nil end
    local name = data.name
    local image = data.header_image or data.tiny_image
        or ("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/" .. tostring(appid) .. "/header.jpg")
    return {
        candidates = {{
            appid = tostring(appid),
            name = tostring(name),
            image = tostring(image),
            score = 100,
            confidence = "exact",
            reasons = { source },
            executable_match = true,
            direct = true,
        }},
        launcher_detected = launcher,
        generic_launcher = generic_launcher,
        executable = detection_basename(request.exe_path),
        source = source,
    }
end

function M.detect_game_candidates(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or "{}"))
    if not ok_request or type(request) ~= "table" then
        return cjson.encode({ error = "invalid_request", candidates = {} })
    end

    request.title = detection_trim(request.title):sub(1, 240)
    request.exe_path = detection_clean_path(request.exe_path):sub(1, 4096)
    request.start_dir = detection_clean_path(request.start_dir):sub(1, 4096)
    request.launch_options = detection_trim(request.launch_options):sub(1, 4096)
    request.shortcut_app_id = detection_trim(request.shortcut_app_id)
    local language = detection_trim(request.language)
    if language == "" then language = "english" end

    if request.shortcut_app_id:match("^%d+$") and (request.exe_path == "" or request.start_dir == "") then
        local shortcut = detection_find_shortcut_record(request.shortcut_app_id)
        if shortcut then
            if request.title == "" then request.title = shortcut.title end
            if request.exe_path == "" then request.exe_path = shortcut.exe_path end
            if request.start_dir == "" then request.start_dir = shortcut.start_dir end
            if request.launch_options == "" then request.launch_options = shortcut.launch_options end
        end
    end

    local exe_basename = detection_basename(request.exe_path)
    local raw_exe_stem = detection_stem(exe_basename)
    local exe_stem = detection_game_exe_hint(exe_basename)
    local title_hint = detection_game_exe_hint(request.title)
    if detection_trim(title_hint) == "" then title_hint = request.title end
    local title_cleaned = detection_clean_game_title(title_hint)
    if title_cleaned == "" then title_cleaned = title_hint end

    local exe_normalized = detection_normalize(exe_stem)
    local launcher = exe_normalized:find("launcher", 1, true) ~= nil
        or exe_normalized == "start protected game"
        or exe_normalized:find("bootstrapper", 1, true) ~= nil
    local generic_launcher = DETECTION_GENERIC_EXES[exe_normalized] == true

    local cache_key = table.concat({
        request.title, request.exe_path, request.start_dir,
        request.launch_options, language
    }, "\31")
    local cached = detection_cache_get(detection_candidate_cache, cache_key, 600)
    if cached then return cached.json end

    local direct_appid = detection_appid_from_arguments(request.launch_options)
    local direct_source = direct_appid and "launch_argument" or nil
    if not direct_appid and request.exe_path ~= "" then
        direct_appid, direct_source = detection_find_steam_appid_file(request.exe_path)
    end
    if not direct_appid and request.exe_path ~= "" then
        direct_appid, direct_source = detection_find_appmanifest(request.exe_path)
    end
    if direct_appid then
        local direct = detection_direct_result(direct_appid, direct_source, request, language, launcher, generic_launcher)
        if direct then
            local encoded = cjson.encode(direct)
            detection_cache_set(detection_candidate_cache, cache_key, { json = encoded, ttl = 600 })
            return encoded
        end
    end

    local folders = detection_folder_hints(request.exe_path, request.start_dir)
    local queries, query_seen = {}, {}
    local function add_query(value)
        local cleaned = detection_trim(value)
        local searchable = cleaned
            :gsub("(%l)(%u)", "%1 %2")
            :gsub("(%a)(%d)", "%1 %2")
            :gsub("(%d)(%a)", "%1 %2")
        local normalized = detection_normalize(searchable)
        if #normalized >= 2
            and not DETECTION_GENERIC_WORDS[normalized]
            and not DETECTION_GENERIC_EXES[normalized]
            and not query_seen[normalized] then
            query_seen[normalized] = true
            table.insert(queries, searchable)
        end
    end

    local alias_candidates = {}
    local function check_alias(key)
        if not key or key == "" then return end
        local raw_norm = detection_normalize(key)
        local compact = raw_norm:gsub("%s+", "")
        local alias = KNOWN_TITLE_ALIASES[compact] or KNOWN_TITLE_ALIASES[raw_norm]
        if alias then
            add_query(alias.name)
            for _, direct_id in ipairs(alias.appids) do
                alias_candidates[direct_id] = alias.name
            end
        end
    end

    check_alias(title_hint)
    check_alias(title_cleaned)
    check_alias(exe_stem)
    check_alias(raw_exe_stem)
    for _, folder in ipairs(folders) do check_alias(folder) end

    -- Sub-segment query decomposition for long titles
    for segment in tostring(title_cleaned):gmatch("[^–—:|%-]+") do
        local seg_trimmed = detection_trim(segment)
        if #seg_trimmed >= 3 and seg_trimmed ~= title_cleaned then
            add_query(seg_trimmed)
            check_alias(seg_trimmed)
        end
    end

    add_query(title_cleaned)
    if title_cleaned ~= title_hint then add_query(title_hint) end

    if not DETECTION_GENERIC_EXES[exe_normalized] then
        local exe_tokens = detection_tokens(exe_stem, true)
        local rebuilt = {}
        for token in pairs(exe_tokens) do table.insert(rebuilt, token) end
        table.sort(rebuilt)
        if #rebuilt > 0 then add_query(table.concat(rebuilt, " ")) end
    end
    for _, folder in ipairs(folders) do add_query(folder) end

    local by_id = {}

    -- Aliases are search hints, never proof of identity.  Short executable
    -- names such as re4/re9/mk are inherently ambiguous and must still compete
    -- with Store results and appinfo validation.
    for direct_id, default_name in pairs(alias_candidates) do
        local image = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/" .. direct_id .. "/header.jpg"
        by_id[direct_id] = {
            appid = direct_id,
            name = default_name,
            image = image,
            item_type = "game",
            reasons = { "franchise_alias" },
            query_rank = 10,
            query_index = 1,
            executable_match = false,
            direct = false,
            alias_hint = true,
        }
    end

    local max_queries = math.min(#queries, 3)
    for query_index = 1, max_queries do
        local items = detection_store_search(queries[query_index], language)
        local found_exact_match = false
        for rank = 1, math.min(#items, 15) do
            local item = items[rank]
            local appid = tostring(type(item) == "table" and (item.id or item.appid) or "")
            local name = type(item) == "table" and tostring(item.name or "") or ""
            if appid:match("^%d+$") and name ~= "" then
                local candidate = by_id[appid]
                if not candidate then
                    candidate = {
                        appid = appid,
                        name = name,
                        image = tostring(item.tiny_image or item.header_image or ("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/" .. appid .. "/header.jpg")),
                        item_type = tostring(item.type or ""),
                        reasons = {},
                        query_rank = rank,
                        query_index = query_index,
                        executable_match = false,
                        direct = false,
                    }
                    by_id[appid] = candidate
                else
                    candidate.query_rank = math.min(candidate.query_rank, rank)
                    candidate.query_index = math.min(candidate.query_index, query_index)
                end

                local sim = math.max(
                    detection_similarity(title_cleaned, name),
                    detection_compact_similarity(title_cleaned, name)
                )
                if sim >= 0.82 or detection_normalize(name) == detection_normalize(title_cleaned) then
                    found_exact_match = true
                end
            end
        end
        -- Early stop: If we already found a strong matching candidate from this query, stop querying
        if found_exact_match and query_index >= 1 then
            break
        end
    end

    local candidates = {}
    for _, candidate in pairs(by_id) do
        local title_similarity = math.max(
            detection_similarity(title_cleaned, candidate.name),
            detection_similarity(title_hint, candidate.name),
            detection_compact_similarity(title_cleaned, candidate.name),
            detection_compact_similarity(title_hint, candidate.name),
            detection_acronym_similarity(title_cleaned, candidate.name)
        )
        local folder_similarity = 0
        for _, folder in ipairs(folders) do
            folder_similarity = math.max(
                folder_similarity,
                detection_similarity(folder, candidate.name),
                detection_compact_similarity(folder, candidate.name),
                detection_acronym_similarity(folder, candidate.name)
            )
        end
        local exe_similarity = DETECTION_GENERIC_EXES[exe_normalized] and 0
            or math.max(
                detection_similarity(exe_stem, candidate.name),
                detection_compact_similarity(exe_stem, candidate.name),
                detection_acronym_similarity(exe_stem, candidate.name)
            )
        local normalized_title = detection_normalize(title_cleaned)
        local normalized_name = detection_normalize(candidate.name)
        local score = title_similarity * 58 + folder_similarity * 24 + exe_similarity * 10
        score = score + math.max(0, 9 - math.min(candidate.query_rank, 9))
        if candidate.alias_hint then
            -- A maintained alias is useful evidence, but it must not override
            -- a conflicting title, folder or verified executable signal.
            score = score + 7
            detection_add_reason(candidate, "franchise_alias")
        elseif normalized_title ~= "" and normalized_title == normalized_name then
            score = math.max(score, 88)
            detection_add_reason(candidate, "title_exact")
        elseif title_similarity >= 0.65 then
            detection_add_reason(candidate, "title_similar")
        end
        if folder_similarity >= 0.65 then detection_add_reason(candidate, "folder_match") end
        if exe_similarity >= 0.75 then detection_add_reason(candidate, "executable_name_match") end
        if exe_stem ~= raw_exe_stem and exe_similarity >= 0.55 then
            detection_add_reason(candidate, "shipping_executable_match")
        end
        detection_add_reason(candidate, "steam_store_search")
        candidate.score = score
        table.insert(candidates, candidate)
    end

    table.sort(candidates, function(a, b)
        if a.score == b.score then return tonumber(a.appid) < tonumber(b.appid) end
        return a.score > b.score
    end)

    -- Validate the leading candidates even when a title appears strong. Store
    -- search alone is not enough to distinguish editions or short aliases.
    local actual_exe = exe_basename:lower()
    local validation_limit = math.min(#candidates, 3)
    for index = 1, validation_limit do
        local candidate = candidates[index]
        if not candidate.direct then
            local appinfo = detection_fetch_appinfo(candidate.appid)
            if type(appinfo) == "table" then
                local common = type(appinfo.common) == "table" and appinfo.common or {}
                if candidate.name == "" and common.name then candidate.name = tostring(common.name) end
                if (candidate.image == "" or candidate.image:find("header.jpg")) and common.header_image then
                    candidate.image = tostring(common.header_image)
                end
                local app_type = tostring(common.type or candidate.item_type or ""):lower()
                if app_type ~= "" and app_type ~= "game" and app_type ~= "app" then
                    candidate.score = candidate.score - 30
                    detection_add_reason(candidate, "non_game_result")
                end
                local official_exes = {}
                if type(appinfo.config) == "table" and type(appinfo.config.launch) == "table" then
                    detection_collect_launch_executables(appinfo.config.launch, official_exes, 0)
                end
                if actual_exe ~= "" and official_exes[actual_exe] then
                    candidate.executable_match = true
                    candidate.score = candidate.score + 28
                    detection_add_reason(candidate, "official_executable_match")
                end
            end
        end
    end

    -- Clamp every result, not only the three that were validated.  Otherwise
    -- an unvalidated fourth result can retain a score above 99 and jump ahead
    -- during the second sort.  Alias-only candidates are deliberately capped
    -- so ambiguous names such as re4 cannot tie a verified executable.
    for _, candidate in ipairs(candidates) do
        if candidate.alias_hint and not candidate.executable_match then
            candidate.score = math.min(candidate.score, DETECTION_UNVERIFIED_ALIAS_MAX_SCORE)
            detection_add_reason(candidate, "alias_requires_confirmation")
        end
        candidate.score = math.max(0, math.min(99, math.floor(candidate.score + 0.5)))
    end

    table.sort(candidates, function(a, b)
        if a.executable_match ~= b.executable_match then return a.executable_match end
        if a.score == b.score then return tonumber(a.appid) < tonumber(b.appid) end
        return a.score > b.score
    end)

    local output = {}
    for index = 1, math.min(#candidates, 6) do
        local candidate = candidates[index]
		-- Alias candidates begin with a generic header URL. Resolve the first
		-- visible candidates through appdetails before exposing them to the
		-- modal, because modern Store headers are versioned by hash.
		if candidate.alias_hint or (candidate.image or ""):find("header.jpg") then
			local official = detection_fetch_appdetails(candidate.appid, language)
			if type(official) == "table" then
				if official.name and tostring(official.name) ~= "" then
					candidate.name = tostring(official.name)
				end
				local official_image = official.header_image or official.capsule_image or official.capsule_imagev5
				if official_image and tostring(official_image) ~= "" then
					candidate.image = tostring(official_image)
				end
			end
		end
        candidate._reason_set = nil
        local runner_up = candidates[index == 1 and 2 or 1]
        candidate.score_gap = runner_up and math.max(0, candidate.score - runner_up.score) or candidate.score
        candidate.ambiguous = index == 1 and runner_up ~= nil and candidate.score_gap < 12
        if candidate.score >= 90 and not candidate.ambiguous then candidate.confidence = "high"
        elseif candidate.score >= 70 then candidate.confidence = "medium"
        else candidate.confidence = "low" end
        table.insert(output, candidate)
    end

    local result = {
        candidates = output,
        launcher_detected = launcher,
        generic_launcher = generic_launcher,
        executable = exe_basename,
        queries = queries,
        source = "steam_store_search",
        ambiguous = output[1] and output[1].ambiguous or false,
    }
    local encoded = cjson.encode(result)
    detection_cache_set(detection_candidate_cache, cache_key, { json = encoded, ttl = 600 })
    return encoded
end

return M
end
