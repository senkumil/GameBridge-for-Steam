return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local USER_AGENT = deps.user_agent or "GameBridge-for-Steam/1.0"
local M = {}

local function get_active_account_id()
    local steam_path = millennium.steam_path()
    local vdf_path = fs.join(steam_path, "config", "loginusers.vdf")
    local function account_id_from_steamid64(id64)
        if not tostring(id64 or ""):match("^%d+$") then return nil end
        -- Lua doubles lack precision for 17-digit integers, so calculate
        -- SteamID64 modulo 2^32 digit by digit.
        local result = 0
        for i = 1, #id64 do
            result = (result * 10 + tonumber(id64:sub(i, i))) % 4294967296
        end
        return tostring(math.floor(result))
    end

    local users = {}
    if fs.exists(vdf_path) then
        local f = io.open(vdf_path, "r")
        if f then
            local content = f:read("*a")
            f:close()
            local current = nil
            for line in content:gmatch("[^\r\n]+") do
                local id64 = line:match('^%s*"(%d%d%d%d%d%d%d%d%d+)"%s*$')
                if id64 then
                    current = { id64 = id64, most_recent = false, auto_login = false, timestamp = 0 }
                    table.insert(users, current)
                elseif current then
                    if line:match('"MostRecent"%s*"1"') then current.most_recent = true end
                    if line:match('"AutoLogin"%s*"1"') then current.auto_login = true end
                    local timestamp = line:match('"Timestamp"%s*"(%d+)"')
                    if timestamp then current.timestamp = tonumber(timestamp) or 0 end
                end
            end
        end
    else
        logger:warn("loginusers.vdf not found at " .. vdf_path)
    end

    -- Current Steam builds may omit MostRecent entirely. Prefer it when
    -- present, then AutoLogin, then the newest login timestamp.
    table.sort(users, function(a, b)
        if a.most_recent ~= b.most_recent then return a.most_recent end
        if a.auto_login ~= b.auto_login then return a.auto_login end
        return (a.timestamp or 0) > (b.timestamp or 0)
    end)
    local userdata_root = fs.join(steam_path, "userdata")
    for _, user in ipairs(users) do
        local account_id = account_id_from_steamid64(user.id64)
        if account_id and fs.exists(fs.join(userdata_root, account_id)) then
            logger:info("Active Steam account ID: " .. account_id .. " (from " .. user.id64 .. ")")
            return account_id
        end
    end

    -- Last-resort fallback for portable/trimmed Steam installs: choose the
    -- most recently modified numeric userdata directory.
    local best_id = nil
    local best_time = -1
    local entries = fs.exists(userdata_root) and fs.list(userdata_root) or nil
    if entries then
        for _, entry in ipairs(entries) do
            if entry.is_directory then
                local account_id = tostring(entry.name or entry.path or ""):match("(%d+)[\\/]?$")
                local modified = tonumber(fs.last_write_time(entry.path) or 0) or 0
                if account_id and modified >= best_time then
                    best_id = account_id
                    best_time = modified
                end
            end
        end
    end
    if best_id then
        logger:info("Active Steam account ID fallback: " .. best_id)
        return best_id
    end

    logger:warn("Could not determine an active Steam userdata account")
    return nil
end

-- ── Artwork saving to Steam grid folder ────────────────────────────────

-- Newer Steam releases frequently publish library artwork only through
-- common.library_assets_full.  Those files live below a content-hash folder,
-- so the old /steam/apps/<appid>/logo.png convention returns 404 even though
-- the game has a proper transparent logo.  steamcmd.net exposes Steam's
-- appinfo structure without authentication; return the resolved URLs and let
-- the frontend keep using SteamClient.Apps.SetCustomArtworkForApp.
local library_assets_cache = {}

local function pick_library_asset(asset, language, prefer_2x)
    if type(asset) ~= "table" then return "" end
    local bucket_keys = prefer_2x and { "image2x", "image" } or { "image", "image2x" }
    local lang = tostring(language or ""):lower()
    for _, bucket_key in ipairs(bucket_keys) do
        local bucket = asset[bucket_key]
        if type(bucket) == "string" and bucket ~= "" then return bucket end
        if type(bucket) == "table" then
            local value = bucket[lang] or bucket.english
            if type(value) == "string" and value ~= "" then return value end
            for _, fallback in pairs(bucket) do
                if type(fallback) == "string" and fallback ~= "" then return fallback end
            end
        end
    end
    return ""
end

local function library_asset_url(appid, relative)
    local value = tostring(relative or "")
    -- Appinfo should contain a relative hash/path. Keep the validation strict
    -- so a malformed mirror response can never redirect image downloads.
    if value == "" or value:find("..", 1, true) or value:find("\\", 1, true)
        or value:match("^https?://") or not value:match("^[%w%._%-%/]+$") then
        return ""
    end
    return "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/"
        .. tostring(appid) .. "/" .. value
end

local function community_asset_url(appid, asset_hash, extension)
    local hash = tostring(asset_hash or ""):lower()
    local ext = tostring(extension or ""):lower()
    if #hash ~= 40 or not hash:match("^[0-9a-f]+$") then return "" end
    if ext ~= "tga" and ext ~= "ico" and ext ~= "jpg" and ext ~= "png" then return "" end
    return "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/"
        .. tostring(appid) .. "/" .. hash .. "." .. ext
end

-- Newer Steam releases publish clienticon.ico through this community-assets
-- endpoint instead of the legacy /steamcommunity/public/images path.
local function community_icon_asset_url(appid, asset_hash, extension)
    local hash = tostring(asset_hash or ""):lower()
    local ext = tostring(extension or ""):lower()
    if #hash ~= 40 or not hash:match("^[0-9a-f]+$") then return "" end
    if ext ~= "ico" and ext ~= "jpg" and ext ~= "png" then return "" end
    return "https://shared.fastly.steamstatic.com/community_assets/images/apps/"
        .. tostring(appid) .. "/" .. hash .. "." .. ext
end

local function community_icon_url(appid, icon_hash)
    local hash = tostring(icon_hash or ""):lower()
    if #hash ~= 40 or not hash:match("^[0-9a-f]+$") then return "" end
    return community_icon_asset_url(appid, hash, "jpg")
end

-- Steam's depot appinfo contains the installed (uncompressed) size of each
-- public depot.  Use the base app depots only: DLC and shared Steam-runtime
-- depots are separate products and must not inflate the game's displayed size.
local function official_install_size_bytes(depots)
    if type(depots) ~= "table" then return 0 end
    local candidates = {}
    local has_os_metadata = false
    for depot_id, depot in pairs(depots) do
        if type(depot) == "table"
            and not depot.dlcappid
            and not depot.depotfromapp
            and not depot.sharedinstall
            and type(depot.manifests) == "table" then
            local oslist = type(depot.config) == "table" and tostring(depot.config.oslist or "") or ""
            if oslist ~= "" then has_os_metadata = true end
            -- Prefer Windows on multi-platform apps.  Depots without an
            -- oslist are shared by all supported platforms and remain valid.
            if oslist == "" or oslist:lower():find("windows", 1, true) then
            local manifest = depot.manifests.public
            if type(manifest) ~= "table" then
                -- A few legacy appinfos expose only a named branch.  Prefer
                -- its installed size rather than falling back to download.
                for _, candidate in pairs(depot.manifests) do
                    if type(candidate) == "table" and candidate.size then
                        manifest = candidate
                        break
                    end
                end
            end
            local size = type(manifest) == "table" and tonumber(manifest.size) or nil
                if size and size > 0 then
                    table.insert(candidates, { id = tonumber(depot_id) or 0, size = size, oslist = oslist })
                end
            end
        end
    end
    table.sort(candidates, function(a, b) return a.id < b.id end)

    -- Some regional Steam packages publish two nearly identical depot sets
    -- without exposing an oslist (Resident Evil Requiem is one example).
    -- Keep the first set and ignore the immediately following near-duplicate;
    -- otherwise a Windows install is counted twice.  Explicit OS metadata is
    -- authoritative and bypasses this compatibility heuristic.
    local selected = {}
    for _, candidate in ipairs(candidates) do
        local duplicate = false
        if not has_os_metadata and #candidates >= 3 and #selected > 0 then
            local previous = selected[#selected]
            local smaller = math.min(previous.size, candidate.size)
            local larger = math.max(previous.size, candidate.size)
            duplicate = candidate.id == previous.id + 1 and larger > 0 and (smaller / larger) >= 0.70
        end
        if not duplicate then table.insert(selected, candidate) end
    end

    local total = 0
    for _, candidate in ipairs(selected) do total = total + candidate.size end
    return total
end

function M.fetch_library_assets(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then
        request = { steam_app_id = request_json }
    end
    local appid = tostring(request.steam_app_id or request.appid or "")
    local language = tostring(request.language or "english"):lower()
    if not appid:match("^%d+$") then return cjson.encode({ error = "invalid_appid" }) end

    local cache_key = appid .. "|" .. language
    if library_assets_cache[cache_key] then
        -- Invalidate entries created by older plugin builds that did not yet
        -- include Steam's official depot install size.
        local cached_ok, cached_value = pcall(cjson.decode, library_assets_cache[cache_key])
        if cached_ok and type(cached_value) == "table" and cached_value.install_size ~= nil
            and tonumber(cached_value.install_size_algorithm) == 3
            and tonumber(cached_value.shortcut_icon_algorithm) == 2 then
            return library_assets_cache[cache_key]
        end
        library_assets_cache[cache_key] = nil
    end

    local url = "https://api.steamcmd.net/v1/info/" .. appid
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "application/json" },
        timeout = 20,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then
        logger:warn("Library assets lookup failed for " .. appid .. " (HTTP "
            .. tostring(res and res.status or "error") .. ")")
        return cjson.encode({ error = "request_failed" })
    end

    local ok_body, body = pcall(cjson.decode, res.body)
    local app = ok_body and type(body) == "table" and type(body.data) == "table"
        and body.data[appid] or nil
    local common = type(app) == "table" and app.common or nil
    if type(common) ~= "table" then
        logger:info("No common appinfo metadata for " .. appid)
        return cjson.encode({ found = false, appid = appid })
    end
    local assets = type(common.library_assets_full) == "table" and common.library_assets_full or {}
    local has_library_assets = next(assets) ~= nil
    if not has_library_assets then
        logger:info("No library_assets_full metadata for " .. appid)
    end

    local franchise = ""
    if type(common.associations) == "table" then
        for _, association in pairs(common.associations) do
            if type(association) == "table" and tostring(association.type or ""):lower() == "franchise" then
                franchise = tostring(association.name or "")
                if franchise ~= "" then break end
            end
        end
    end

    local shortcut_icons = {}
    local client_tga = community_asset_url(appid, common.clienttga, "tga")
    local client_ico = community_icon_asset_url(appid, common.clienticon, "ico")
    local client_jpg = community_icon_asset_url(appid, common.clienticon or common.icon, "jpg")
    local community_icon = community_icon_url(appid, common.icon)
    if client_tga ~= "" then table.insert(shortcut_icons, { url = client_tga, extension = "tga" }) end
    -- Recent appinfos may omit clienttga but still expose clienticon.  ICO
    -- is the native shortcut icon format used by Steam's Properties dialog.
    if client_ico ~= "" then table.insert(shortcut_icons, { url = client_ico, extension = "ico" }) end
    -- Keep a readable image fallback for CDN/ICO clients; Steam accepts this
    -- on builds that do not expose ICO through SetShortcutIcon.
    if client_jpg ~= "" then table.insert(shortcut_icons, { url = client_jpg, extension = "jpg" }) end

    local result = {
        found = has_library_assets or #shortcut_icons > 0 or community_icon ~= "",
        appid = appid,
        source = "steamcmd_appinfo",
        -- Prefer the 2x variants for tiles/logos, while the normal hero is
        -- already 1920x620 and avoids an unnecessary 4K download.
        portrait = library_asset_url(appid, pick_library_asset(assets.library_capsule, language, true)),
        hero = library_asset_url(appid, pick_library_asset(assets.library_hero, language, false)),
        logo = library_asset_url(appid, pick_library_asset(assets.library_logo, language, true)),
        wide = library_asset_url(appid, pick_library_asset(assets.library_header, language, true)),
        icon = community_icon,
        shortcut_icon = shortcut_icons[1] and shortcut_icons[1].url or "",
        shortcut_icon_extension = shortcut_icons[1] and shortcut_icons[1].extension or "",
        shortcut_icons = shortcut_icons,
        shortcut_icon_algorithm = 2,
        franchise = franchise,
        logo_position = type(assets.library_logo) == "table" and assets.library_logo.logo_position or nil,
        -- Fixed official install footprint from Steam depot manifests.  This
        -- intentionally does not measure the shortcut's start directory.
        install_size = official_install_size_bytes(type(body.data[appid]) == "table" and body.data[appid].depots or nil),
        install_size_algorithm = 3,
    }
    local encoded = cjson.encode(result)
    library_assets_cache[cache_key] = encoded
    logger:info("Library assets resolved for " .. appid .. ": logo="
        .. (result.logo ~= "" and "yes" or "no") .. ", hero="
        .. (result.hero ~= "" and "yes" or "no"))
    return encoded
end

-- Optional community fallback. It is deliberately separate from the official
-- resolver above: callers invoke it only for slots Steam did not publish, and
-- the API key is supplied per request (never written to the plugin log/files).
local function steamgriddb_image_url(value)
    local url = tostring(value or "")
    if url:match("^https://[%w%-.]*steamgriddb%.com/") then return url end
    return ""
end

local function steamgriddb_request(path, api_key)
    local ok_http, res = pcall(http.get, "https://www.steamgriddb.com/api/v2/" .. path, {
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. api_key,
            ["User-Agent"] = USER_AGENT,
        },
        timeout = 10,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then return nil end
    local ok_body, body = pcall(cjson.decode, res.body)
    return ok_body and type(body) == "table" and body or nil
end

local function steamgriddb_first_url(body)
    local items = type(body) == "table" and body.data or nil
    if type(items) ~= "table" then return "" end
    if items.url then return steamgriddb_image_url(items.url) end
    for _, item in ipairs(items) do
        local url = type(item) == "table" and steamgriddb_image_url(item.url) or ""
        if url ~= "" then return url end
    end
    return ""
end

function M.fetch_community_artwork(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then return cjson.encode({ error = "invalid_request" }) end
    local appid = tostring(request.steam_app_id or request.appid or "")
    local api_key = tostring(request.api_key or ""):match("^%s*(.-)%s*$") or ""
    if not appid:match("^%d+$") then return cjson.encode({ error = "invalid_appid" }) end
    if #api_key < 16 or #api_key > 160 then return cjson.encode({ error = "api_key_missing" }) end

    -- SteamGridDB maps its own game ids from Steam AppIDs, avoiding fuzzy title
    -- searches and accidental artwork from a different edition.
    local game = steamgriddb_request("games/steam/" .. appid, api_key)
    local game_id = type(game) == "table" and type(game.data) == "table" and tonumber(game.data.id) or nil
    if not game_id then return cjson.encode({ found = false, source = "steamgriddb" }) end

    local id = tostring(math.floor(game_id))
    local result = {
        found = true,
        source = "steamgriddb",
        portrait = steamgriddb_first_url(steamgriddb_request("grids/game/" .. id .. "?dimensions=600x900", api_key)),
        hero = steamgriddb_first_url(steamgriddb_request("heroes/game/" .. id, api_key)),
        logo = steamgriddb_first_url(steamgriddb_request("logos/game/" .. id, api_key)),
        wide = steamgriddb_first_url(steamgriddb_request("grids/game/" .. id .. "?dimensions=920x430", api_key)),
    }
    result.found = result.portrait ~= "" or result.hero ~= "" or result.logo ~= "" or result.wide ~= ""
    -- Do not log URLs or the API key; a count is enough for diagnostics.
    logger:info("SteamGridDB fallback resolved " .. appid .. " assets="
        .. tostring((result.portrait ~= "" and 1 or 0) + (result.hero ~= "" and 1 or 0)
            + (result.logo ~= "" and 1 or 0) + (result.wide ~= "" and 1 or 0)))
    return cjson.encode(result)
end

-- Persist Steam's official client icon for a non-Steam shortcut.  SetShortcutIcon
-- only accepts a local path, so the frontend asks this helper to download the
-- appinfo icon into Steam's stable per-user grid directory first.
local base64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function decode_base64(data)
    data = tostring(data or ""):gsub("%s", "")
    if data == "" or data:find("[^A-Za-z0-9%+/%=]") then return nil end
    local bits = data:gsub(".", function(char)
        if char == "=" then return "" end
        local index = base64_chars:find(char, 1, true)
        if not index then return "" end
        local value = index - 1
        local out = {}
        for bit = 6, 1, -1 do
            out[#out + 1] = (value % 2 ^ bit - value % 2 ^ (bit - 1) > 0) and "1" or "0"
        end
        return table.concat(out)
    end)
    return bits:gsub("%d%d%d?%d?%d?%d?%d?%d?", function(chunk)
        if #chunk ~= 8 then return "" end
        local byte = 0
        for i = 1, 8 do
            if chunk:sub(i, i) == "1" then byte = byte + 2 ^ (8 - i) end
        end
        return string.char(byte)
    end)
end

local function validate_shortcut_icon_body(body, ext)
    if type(body) ~= "string" or #body <= 100 then return false end
    ext = tostring(ext or ""):lower()
    if ext == "jpeg" then ext = "jpg" end
    if ext == "png" then
        return body:byte(1) == 137 and body:byte(2) == 80 and body:byte(3) == 78 and body:byte(4) == 71
            and body:byte(5) == 13 and body:byte(6) == 10 and body:byte(7) == 26 and body:byte(8) == 10
    end
    if ext == "jpg" then
        return body:byte(1) == 255 and body:byte(2) == 216
    end
    if ext == "ico" then
        return body:byte(1) == 0 and body:byte(2) == 0
            and body:byte(3) == 1 and body:byte(4) == 0 and (body:byte(5) or 0) > 0
    end
    if ext == "tga" then
        local image_type = body:byte(3) or 0
        local width = (body:byte(13) or 0) + (body:byte(14) or 0) * 256
        local height = (body:byte(15) or 0) + (body:byte(16) or 0) * 256
        return (image_type == 1 or image_type == 2 or image_type == 3
            or image_type == 9 or image_type == 10 or image_type == 11)
            and width > 0 and height > 0 and width <= 4096 and height <= 4096
    end
    return false
end

local function write_shortcut_icon_file(grid_dir, shortcut_app_id, ext, body)
    ext = tostring(ext or ""):lower()
    if ext == "jpeg" then ext = "jpg" end
    if ext ~= "tga" and ext ~= "png" and ext ~= "ico" and ext ~= "jpg" then
        return nil, "invalid_extension"
    end
    if not validate_shortcut_icon_body(body, ext) then
        return nil, "invalid_image"
    end

    local filepath = fs.join(grid_dir, shortcut_app_id .. "_icon." .. ext)
    local temp_path = filepath .. ".tmp"
    local backup_path = filepath .. ".bak"
    local file = io.open(temp_path, "wb")
    if not file then return nil, "open_failed" end
    local wrote, write_error = file:write(body)
    local closed, close_error = file:close()
    if not wrote or not closed then
        os.remove(temp_path)
        return nil, tostring(write_error or close_error or "write_failed")
    end

    os.remove(backup_path)
    local had_previous = fs.exists(filepath)
    if had_previous then os.rename(filepath, backup_path) end
    local renamed, rename_error = os.rename(temp_path, filepath)
    if not renamed then
        os.remove(temp_path)
        if had_previous and fs.exists(backup_path) then os.rename(backup_path, filepath) end
        return nil, tostring(rename_error or "rename_failed")
    end
    os.remove(backup_path)
    for _, old_ext in ipairs({ "tga", "ico", "jpg", "jpeg", "png" }) do
        local old_path = fs.join(grid_dir, shortcut_app_id .. "_icon." .. old_ext)
        if old_path ~= filepath and fs.exists(old_path) then os.remove(old_path) end
    end
    return filepath, nil
end

function M.save_shortcut_icon(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then
        return cjson.encode({ error = "invalid_request" })
    end

    local shortcut_app_id = tostring(request.shortcut_app_id or "")
    local steam_app_id = tostring(request.steam_app_id or "")
    local language = tostring(request.language or "english")
    if not shortcut_app_id:match("^%d+$") or not steam_app_id:match("^%d+$") then
        return cjson.encode({ error = "invalid_appid" })
    end

    local account_id = get_active_account_id()
    if not account_id then
        return cjson.encode({ error = "active_user_not_found" })
    end
    local grid_dir = fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")
    if not fs.exists(grid_dir) then fs.create_directories(grid_dir) end
    if not fs.exists(grid_dir) then
        return cjson.encode({ error = "grid_directory_failed" })
    end

    local icon_base64 = tostring(request.icon_base64 or request.data_base64 or "")
    if icon_base64 ~= "" then
        local ext = tostring(request.extension or request.icon_extension or "png"):lower()
        local body = decode_base64(icon_base64)
        local filepath, write_error = write_shortcut_icon_file(grid_dir, shortcut_app_id, ext, body)
        if filepath then
            logger:info("Official shortcut icon saved from frontend payload: " .. filepath)
            return cjson.encode({ saved = true, path = filepath, extension = ext, source = tostring(request.source or "frontend") })
        end
        logger:warn("Rejected frontend shortcut icon payload for " .. steam_app_id .. ": " .. tostring(write_error))
        return cjson.encode({ error = "icon_payload_failed", detail = write_error })
    end

    local encoded_assets = M.fetch_library_assets(cjson.encode({
        steam_app_id = steam_app_id,
        language = language,
    }))
    local ok_assets, resolved = pcall(cjson.decode, tostring(encoded_assets or ""))
    local candidates = ok_assets and type(resolved) == "table" and resolved.shortcut_icons or nil
    if type(candidates) ~= "table" then
        return cjson.encode({ error = "icon_not_available" })
    end

    for _, candidate in ipairs(candidates) do
        local url = type(candidate) == "table" and tostring(candidate.url or "") or ""
        local ext = type(candidate) == "table" and tostring(candidate.extension or ""):lower() or ""
        if (url:match("^https://cdn%.cloudflare%.steamstatic%.com/steamcommunity/public/images/apps/%d+/[0-9a-f]+%.[a-z]+$")
                or url:match("^https://shared%.fastly%.steamstatic%.com/community_assets/images/apps/%d+/[0-9a-f]+%.[a-z]+$"))
            and (ext == "tga" or ext == "png" or ext == "ico" or ext == "jpg") then
            local ok_http, res = pcall(http.get, url, { timeout = 20 })
            if ok_http and res and res.status == 200 and res.body and #res.body > 100 then
                if not validate_shortcut_icon_body(res.body, ext) then
                    -- Steam publishes several icon candidates for the same app. Some
                    -- endpoints answer successfully but contain a format Millennium
                    -- cannot use. This is an expected candidate miss, not a plugin
                    -- warning; the frontend can still provide the official PNG.
                    logger:info("Skipped unusable official icon candidate for " .. steam_app_id
                        .. " ext=" .. ext)
                else
                    local filepath, write_error = write_shortcut_icon_file(grid_dir, shortcut_app_id, ext, res.body)
                    if filepath then
                        logger:info("Official shortcut icon saved: " .. filepath)
                        return cjson.encode({ saved = true, path = filepath, extension = ext, source = url })
                    end
                    logger:warn("Could not write official shortcut icon: " .. tostring(write_error))
                end
            else
                -- A missing individual format is normal (for example a 404 JPG
                -- while TGA/ICO metadata exists). Keep trying the remaining
                -- candidates without making Millennium mark the plugin as faulty.
                logger:info("Official icon candidate unavailable for " .. steam_app_id
                    .. " ext=" .. ext .. " status=" .. tostring(res and res.status or "error"))
            end
        end
    end

    return cjson.encode({ error = "icon_download_failed" })
end

function M.save_artwork(shortcut_app_id, steam_app_id)
    local account_id = get_active_account_id()
    if not account_id then
        return cjson.encode({ error = "Could not determine active Steam user" })
    end

    local steam_path = millennium.steam_path()
    local grid_dir = fs.join(steam_path, "userdata", account_id, "config", "grid")

    if not fs.exists(grid_dir) then
        fs.create_directories(grid_dir)
    end

    local sid = tostring(shortcut_app_id)
    local cdn_base = "https://cdn.akamai.steamstatic.com/steam/apps/" .. tostring(steam_app_id)

    -- { CDN url, filename suffix, extension }
    local images = {
        { cdn_base .. "/library_600x900.jpg", "p",     "jpg" },   -- Portrait grid
        { cdn_base .. "/library_hero.jpg",    "_hero", "jpg" },   -- Hero banner
        { cdn_base .. "/logo.png",            "_logo", "png" },   -- Logo
        { cdn_base .. "/header.jpg",          "",      "jpg" },   -- Wide capsule
    }

    local saved = 0
    for _, img in ipairs(images) do
        local url, suffix, ext = img[1], img[2], img[3]
        local filename = sid .. suffix .. "." .. ext
        local filepath = fs.join(grid_dir, filename)

        logger:info("Downloading artwork: " .. url)
        local ok, res = pcall(http.get, url, { timeout = 30 })
        if ok and res and res.status == 200 and res.body and #res.body > 0 then
            -- Remove conflicting files with different extensions
            for _, old_ext in ipairs({"jpg", "jpeg", "png"}) do
                if old_ext ~= ext then
                    local old_path = fs.join(grid_dir, sid .. suffix .. "." .. old_ext)
                    if fs.exists(old_path) then
                        os.remove(old_path)
                        logger:info("Removed old grid file: " .. old_path)
                    end
                end
            end

            local f_out = io.open(filepath, "wb")
            if f_out then
                f_out:write(res.body)
                f_out:close()
                saved = saved + 1
                logger:info("Saved artwork: " .. filepath .. " (" .. tostring(#res.body) .. " bytes)")
            else
                logger:warn("Could not write artwork file: " .. filepath)
            end
        else
            local err_msg = "failed"
            if ok and res then err_msg = "HTTP " .. tostring(res.status) end
            logger:warn("Artwork download " .. err_msg .. ": " .. url)
        end
    end

    logger:info("Artwork save complete: " .. tostring(saved) .. "/4 for shortcut " .. sid)
    return cjson.encode({ saved = saved, account_id = account_id })
end

function M.clear_artwork(shortcut_app_id)
    local account_id = get_active_account_id()
    if not account_id then
        return cjson.encode({ error = "Could not determine active Steam user" })
    end

    local steam_path = millennium.steam_path()
    local grid_dir = fs.join(steam_path, "userdata", account_id, "config", "grid")
    local sid = tostring(shortcut_app_id)

    local removed = 0
    for _, suffix in ipairs({ "p", "_hero", "_logo", "_icon", "" }) do
        for _, ext in ipairs({ "jpg", "jpeg", "png", "tga", "ico" }) do
            local filepath = fs.join(grid_dir, sid .. suffix .. "." .. ext)
            if fs.exists(filepath) then
                os.remove(filepath)
                removed = removed + 1
                logger:info("Removed grid file: " .. filepath)
            end
        end
    end

    return cjson.encode({ removed = removed })
end

return M
end
