return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local USER_AGENT = deps.user_agent or "Steam-Game-Data-Linker-Mod/2.6"
local M = {}
local detection_url_encode = util.url_encode
local detection_candidate_cache = {}

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
    -- Only strip a real executable/script extension. Shortcut titles can
    -- legitimately contain dots (for example S.T.A.L.K.E.R. or a version
    -- number) and must not be truncated as though they were file names.
    if lower:match("%.exe$") or lower:match("%.com$") or lower:match("%.bat$")
        or lower:match("%.cmd$") or lower:match("%.appimage$") then
        stem = detection_stem(stem)
    end
    -- Unreal Engine games commonly expose a small root bootstrapper and keep
    -- the real, long-lived process under Binaries/Win64.  Preserve that target
    -- for Steam playtime tracking while removing only the build suffix for
    -- catalog matching (e.g. SparkingZERO-Win64-Shipping.exe -> SparkingZERO).
    stem = stem:gsub("[%s_%-]+[Ww][Ii][Nn]64[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    stem = stem:gsub("[%s_%-]+[Ww][Ii][Nn]32[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    stem = stem:gsub("[%s_%-]+[Ll][Ii][Nn][Uu][Xx][%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    return stem
end

local function detection_normalize(value)
    local text = tostring(value or ""):lower()
    text = text:gsub("™", ""):gsub("®", ""):gsub("©", "")
    text = text:gsub("[’'`´]", ""):gsub("[–—_:|/\\%[%]%(%){}]+", " ")
    text = text:gsub("[^%w]+", " "):gsub("%s+", " ")
    return detection_trim(text)
end

local DETECTION_GENERIC_WORDS = {
    launcher = true, launch = true, game = true, start = true, protected = true,
    shipping = true, win64 = true, win32 = true, windows = true, x64 = true,
    x86 = true, dx11 = true, dx12 = true, binary = true, binaries = true,
    games = true, juegos = true, steamapps = true, common = true,
}

local DETECTION_GENERIC_EXES = {
    ["game"] = true, ["launcher"] = true, ["start"] = true,
    ["start protected game"] = true, ["playnite fullscreenapp"] = true,
    ["playnite desktopapp"] = true, ["heroic"] = true,
    ["epicgameslauncher"] = true, ["galaxyclient"] = true,
    ["retroarch"] = true, ["steam"] = true,
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

local function detection_similarity(left, right)
    local a, ac = detection_tokens(left, false)
    local b, bc = detection_tokens(right, false)
    if ac == 0 or bc == 0 then return 0 end
    local common = 0
    for token in pairs(a) do if b[token] then common = common + 1 end end
    -- Dice coefficient rewards compact title matches without making an
    -- additional edition/remaster token look identical to the base game.
    return (2 * common) / (ac + bc)
end

local function detection_compact_similarity(left, right)
    local a = detection_normalize(left):gsub("%s+", "")
    local b = detection_normalize(right):gsub("%s+", "")
    if a == "" or b == "" then return 0 end
    if a == b then return 1 end
    local shorter, longer = a, b
    if #shorter > #longer then shorter, longer = longer, shorter end
    if #shorter >= 5 and longer:find(shorter, 1, true) then
        return math.min(0.95, (#shorter / #longer) + 0.30)
    end
    return 0
end

local function detection_title_acronym(value)
    local pieces = {}
    for token in detection_normalize(value):gmatch("%S+") do
        if token:match("^%d+$") or token:match("^[ivxlcdm]+$") then
            table.insert(pieces, token)
        elseif #token > 0 then
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
    local function compare(compact, acronym)
        if #compact < 3 or #acronym < 3 then return 0 end
        if compact == acronym then return 1 end
        if acronym:sub(1, #compact) == compact then return 0.96 end
        return 0
    end
    return math.max(compare(left_compact, right_acronym), compare(right_compact, left_acronym))
end

local function detection_url_encode(value)
    return tostring(value or ""):gsub("\n", "\r\n"):gsub("([^%w%-_%.~])", function(char)
        return string.format("%%%02X", string.byte(char))
    end)
end

local function detection_read_small_file(path, max_bytes)
    if not path or path == "" or not fs.exists(path) then return nil end
    local handle = io.open(path, "r")
    if not handle then return nil end
    local content = handle:read(max_bytes or 8192)
    handle:close()
    return content
end

-- Steam does not expose strShortcutExe through GetCachedAppDetails on every
-- client build.  The authoritative fallback is the active user's own
-- userdata/<account>/config/shortcuts.vdf.  Read it without modifying it so
-- automatic detection still works when a shortcut was added from an EXE,
-- .lnk file, launcher, or an Unreal *-Shipping executable.
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
            -- Float, pointer and colour values are not needed for shortcut
            -- identification, but consume their four-byte payload safely.
            if position + 3 > #data then return nil, position, "truncated_value" end
            position = position + 4
        elseif value_type == 7 then
            if position + 7 > #data then return nil, position, "truncated_uint64" end
            position = position + 8
        elseif value_type == 5 then
            -- UTF-16 strings are uncommon in shortcuts.vdf. Consume the
            -- terminating 00 00 pair while preserving two-byte alignment.
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
    if selected:lower():match("[%s_%-]win%d%d[%s_%-]shipping%.exe$")
        or selected:lower():match("[%s_%-]linux[%s_%-]shipping$") then
        return nil, nil
    end

    local root = detection_clean_path(start_dir)
    if root == "" then root = fs.parent_path(selected) end
    if not root or root == "" or not fs.exists(root) then return nil, nil end

    local selected_stem = detection_normalize(detection_game_exe_hint(detection_basename(selected))):gsub("%s+", "")
    local candidates, candidate_seen = {}, {}
    local function consider(path)
        local clean = detection_clean_path(path)
        local lower = clean:lower()
        if clean == "" or lower == selected:lower() or candidate_seen[lower] or not fs.exists(clean) then return end
        if not lower:match("[%s_%-]win32[%s_%-]shipping%.exe$")
            and not lower:match("[%s_%-]win64[%s_%-]shipping%.exe$") then return end
        candidate_seen[lower] = true
        local candidate_stem = detection_normalize(detection_game_exe_hint(detection_basename(clean))):gsub("%s+", "")
        local score = 50
        if selected_stem ~= "" and candidate_stem == selected_stem then score = score + 80 end
        if lower:find("\\binaries\\win64\\", 1, true) then score = score + 35 end
        if lower:find("\\binaries\\win32\\", 1, true) then score = score + 25 end
        if lower:find("\\engine\\", 1, true) then score = score - 25 end
        table.insert(candidates, { path = clean, score = score })
    end

    local selected_stem_raw = detection_game_exe_hint(detection_basename(selected))
    for _, platform in ipairs({ "Win64", "Win32" }) do
        consider(fs.join(root, selected_stem_raw, "Binaries", platform,
            selected_stem_raw .. "-" .. platform .. "-Shipping.exe"))
        consider(fs.join(root, "Binaries", platform,
            selected_stem_raw .. "-" .. platform .. "-Shipping.exe"))
    end

    local visited = 0
    local skipped_directories = {
        ["_commonredist"] = true, ["redist"] = true, ["redistributables"] = true,
        ["directx"] = true, ["vcredist"] = true, ["installers"] = true,
    }
    local function walk(directory, depth)
        if depth > 5 or visited >= 900 then return end
        local ok_list, entries = pcall(fs.list, directory)
        if not ok_list or type(entries) ~= "table" then return end
        for _, entry in ipairs(entries) do
            if visited >= 900 then break end
            visited = visited + 1
            local name = tostring(entry.name or detection_basename(entry.path or ""))
            local path = tostring(entry.path or "")
            if path == "" then path = fs.join(directory, name) end
            if entry.is_directory then
                if not skipped_directories[name:lower()] then walk(path, depth + 1) end
            else
                consider(path)
            end
        end
    end
    walk(root, 0)

    table.sort(candidates, function(a, b)
        if a.score == b.score then return #a.path < #b.path end
        return a.score > b.score
    end)
    local best = candidates[1]
    if not best then return nil, nil end
    return best.path, fs.parent_path(best.path)
end

local function detection_find_shortcut_record(shortcut_app_id)
    local target = detection_shortcut_appid(shortcut_app_id)
    if not target then return nil end
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
        local data = detection_read_binary_file(file.path)
        if data then
            local root = detection_parse_binary_vdf_object(data, 1, 0)
            local shortcuts = type(root) == "table" and (root.shortcuts or root) or nil
            if type(shortcuts) == "table" then
                for _, record in pairs(shortcuts) do
                    if type(record) == "table" and detection_shortcut_appid(record.appid) == target then
                        local shortcut = {
                            shortcut_app_id = tostring(target),
                            title = tostring(record.AppName or record.appname or ""),
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
    local record = detection_find_shortcut_record(shortcut_app_id)
    if not record then
        return cjson.encode({ error = "shortcut_not_found" })
    end
    logger:info("Resolved shortcut details from shortcuts.vdf for " .. tostring(shortcut_app_id))
    return cjson.encode(record)
end

local function detection_http_json(url, timeout)
    local ok_http, res, err = pcall(http.get, url, {
        headers = {
            ["Accept"] = "application/json",
            ["User-Agent"] = "Steam-Game-Data-Linker-Mod/2.6"
        },
        timeout = timeout or 15
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
    local url = "https://store.steampowered.com/api/appdetails?appids=" .. id
        .. "&l=" .. detection_url_encode(language or "english")
    local body = detection_http_json(url, 8)
    local record = type(body) == "table" and body[id] or nil
    if type(record) == "table" and record.success and type(record.data) == "table" then
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
    local url = "https://store.steampowered.com/api/storesearch/?term="
        .. detection_url_encode(cleaned)
        .. "&l=" .. detection_url_encode(language or "english")
        .. "&cc=US"
    local body = detection_http_json(url, 5)
    return type(body) == "table" and type(body.items) == "table" and body.items or {}
end

local function detection_fetch_appinfo(appid)
    local id = tostring(appid or "")
    local body = detection_http_json("https://api.steamcmd.net/v1/info/" .. id, 5)
    return type(body) == "table" and type(body.data) == "table" and body.data[id] or nil
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
        local cleaned = detection_trim(value)
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
    if not data then return nil end
    return {
        candidates = {{
            appid = tostring(appid),
            name = tostring(data.name or request.title or appid),
            image = tostring(data.header_image or ""),
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
    -- Steam normally names a newly-created shortcut after the selected file.
    -- Apply the same catalogue-only cleanup to that title so an Unreal binary
    -- such as SparkingZERO-Win64-Shipping is still searchable.  This value is
    -- never written back to the shortcut and therefore cannot change the
    -- executable Steam launches or the process it tracks for playtime.
    local title_hint = detection_game_exe_hint(request.title)
    if detection_trim(title_hint) == "" then title_hint = request.title end
    local exe_normalized = detection_normalize(exe_stem)
    local launcher = exe_normalized:find("launcher", 1, true) ~= nil
        or exe_normalized == "start protected game"
        or exe_normalized:find("bootstrapper", 1, true) ~= nil
    local generic_launcher = DETECTION_GENERIC_EXES[exe_normalized] == true

    local cache_key = table.concat({
        request.title, request.exe_path, request.start_dir,
        request.launch_options, language
    }, "\31")
    local cached = detection_candidate_cache[cache_key]
    if cached and os.time() - cached.time < 600 then return cached.json end

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
            detection_candidate_cache[cache_key] = { time = os.time(), json = encoded }
            return encoded
        end
    end

    local folders = detection_folder_hints(request.exe_path, request.start_dir)
    local queries, query_seen = {}, {}
    local function add_query(value)
        local cleaned = detection_trim(value)
        -- Store search understands words better than compact binary names.
        -- Expand common CamelCase and letter/number boundaries for the query
        -- only (SparkingZERO -> Sparking ZERO, FC26 -> FC 26).
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
    add_query(title_hint)
    if not DETECTION_GENERIC_EXES[exe_normalized] then
        local exe_tokens = detection_tokens(exe_stem, true)
        local rebuilt = {}
        for token in pairs(exe_tokens) do table.insert(rebuilt, token) end
        table.sort(rebuilt)
        if #rebuilt > 0 then add_query(table.concat(rebuilt, " ")) end
    end
    -- Executable hints are generally stronger than technical parent folders
    -- such as Binaries/Win64. Add folder fallbacks afterwards so a compact
    -- Shipping binary name gets searched within the small request budget.
    for _, folder in ipairs(folders) do add_query(folder) end

    local by_id = {}
    for query_index = 1, math.min(#queries, 3) do
        local items = detection_store_search(queries[query_index], language)
        for rank = 1, math.min(#items, 20) do
            local item = items[rank]
            local appid = tostring(type(item) == "table" and (item.id or item.appid) or "")
            local name = type(item) == "table" and tostring(item.name or "") or ""
            if appid:match("^%d+$") and name ~= "" then
                local candidate = by_id[appid]
                if not candidate then
                    candidate = {
                        appid = appid,
                        name = name,
                        image = tostring(item.tiny_image or item.header_image or ""),
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
            end
        end
    end

    local candidates = {}
    for _, candidate in pairs(by_id) do
        local title_similarity = math.max(
            detection_similarity(title_hint, candidate.name),
            detection_compact_similarity(title_hint, candidate.name),
            detection_acronym_similarity(title_hint, candidate.name)
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
        local normalized_title = detection_normalize(title_hint)
        local normalized_name = detection_normalize(candidate.name)
        local score = title_similarity * 58 + folder_similarity * 24 + exe_similarity * 10
        score = score + math.max(0, 9 - math.min(candidate.query_rank, 9))
        if normalized_title ~= "" and normalized_title == normalized_name then
            score = math.max(score, 78)
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

    -- Validate only the strongest few candidates against Steam appinfo.  This
    -- keeps the Properties dialog responsive while giving an exact executable
    -- match enough weight to disambiguate editions with similar names.
    local actual_exe = exe_basename:lower()
    local validation_limit = math.min(#candidates, 2)
    if candidates[1] and candidates[1].score >= 86 then validation_limit = 0 end
    for index = 1, validation_limit do
        local candidate = candidates[index]
        local appinfo = detection_fetch_appinfo(candidate.appid)
        if type(appinfo) == "table" then
            local common = type(appinfo.common) == "table" and appinfo.common or {}
            if candidate.name == "" and common.name then candidate.name = tostring(common.name) end
            if candidate.image == "" and common.header_image then candidate.image = tostring(common.header_image) end
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
        candidate.score = math.max(0, math.min(99, math.floor(candidate.score + 0.5)))
    end

    table.sort(candidates, function(a, b)
        if a.score == b.score then return tonumber(a.appid) < tonumber(b.appid) end
        return a.score > b.score
    end)

    local output = {}
    for index = 1, math.min(#candidates, 6) do
        local candidate = candidates[index]
        candidate._reason_set = nil
        if candidate.score >= 92 then candidate.confidence = "high"
        elseif candidate.score >= 72 then candidate.confidence = "medium"
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
    }
    local encoded = cjson.encode(result)
    detection_candidate_cache[cache_key] = { time = os.time(), json = encoded }
    return encoded
end

return M
end
