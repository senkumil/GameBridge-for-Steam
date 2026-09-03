return function(deps)
local logger = deps.logger
local millennium = deps.millennium
local http = deps.http
local cjson = deps.cjson
local fs = deps.fs
local util = deps.util
local config = deps.config
local lru = deps.lru_cache
local icon_files = deps.artwork_icon
local USER_AGENT = deps.user_agent or "NativeGameLink-for-Steam/2.0.0"
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
local library_assets_cache, LIBRARY_ASSETS_CACHE_LIMIT, LIBRARY_ASSETS_CACHE_SECONDS = {}, 48, 10 * 60
-- Steam can publish localized library assets without a variant for every
-- client language. Never fall back to an arbitrary table entry: Lua's pairs()
-- order is intentionally undefined and could therefore select an Arabic,
-- Chinese, Japanese, etc. logo for a Spanish/English client from one run to
-- the next. Prefer only explicit language-compatible variants, then a neutral
-- English/default asset. If none exists, return an empty value and let the
-- frontend use its safe fallback instead of displaying the wrong language.
local LIBRARY_LANGUAGE_ALIASES = {
    spanish = { "latam" },
    latam = { "spanish" },
    portuguese = { "brazilian" },
    brazilian = { "portuguese" },
    schinese = { "tchinese" },
    tchinese = { "schinese" },
}
local function localized_library_asset(bucket, language)
    if type(bucket) == "string" then
        return bucket ~= "" and bucket or ""
    end
    if type(bucket) ~= "table" then return "" end

    local lang = util.safe_language(language)
    local ordered = {}
    local seen = {}
    local function add(key)
        key = tostring(key or ""):lower()
        if key ~= "" and not seen[key] then
            seen[key] = true
            table.insert(ordered, key)
        end
    end

    add(lang)
    for _, alias in ipairs(LIBRARY_LANGUAGE_ALIASES[lang] or {}) do add(alias) end
    add("english")
    add("default")
    add("neutral")

    for _, key in ipairs(ordered) do
        local value = bucket[key]
        if type(value) == "string" and value ~= "" then return value end
    end
    return ""
end

local function pick_library_asset(asset, language, prefer_2x)
    if type(asset) ~= "table" then return "" end
    local bucket_keys = prefer_2x and { "image2x", "image" } or { "image", "image2x" }
    for _, bucket_key in ipairs(bucket_keys) do
        local value = localized_library_asset(asset[bucket_key], language)
        if value ~= "" then return value end
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
local function legacy_store_asset_url(appid, value)
    local relative = ""
    if type(value) == "string" then
        relative = value
    elseif type(value) == "table" then
        relative = tostring(value.english or "")
        if relative == "" then
            for _, candidate in pairs(value) do
                if type(candidate) == "string" and candidate ~= "" then
                    relative = candidate
                    break
                end
            end
        end
    end
    return library_asset_url(appid, relative)
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
    local language, force_refresh = util.safe_language(request.language), request.force_refresh == true
    if not appid:match("^%d+$") then return cjson.encode({ error = "invalid_appid" }) end
    local cache_key = appid .. "|" .. language
    local cached_entry = library_assets_cache[cache_key]
    if cached_entry and not force_refresh
        and os.time() - tonumber(cached_entry.time or 0) < LIBRARY_ASSETS_CACHE_SECONDS then
        lru.touch(cached_entry)
        local cached_ok, cached_value = pcall(cjson.decode, cached_entry.value)
        if cached_ok and type(cached_value) == "table" and cached_value.install_size ~= nil
            and tonumber(cached_value.install_size_algorithm) == 3
            and tonumber(cached_value.shortcut_icon_algorithm) == 3
            and tonumber(cached_value.library_asset_language_algorithm) == 2
            and tonumber(cached_value.library_metadata_algorithm) == 1
            and tonumber(cached_value.historical_metadata_algorithm) == 1 then
            return cached_entry.value
        end
        library_assets_cache[cache_key] = nil
    end

    local url = "https://api.steamcmd.net/v1/info/" .. appid
    local ok_http, res = pcall(http.get, url, {
        headers = { ["Accept"] = "application/json" },
        timeout = 20,
    })
    if not ok_http or not res or res.status ~= 200 or not res.body then
        logger:info("Library assets lookup failed for " .. appid .. " (HTTP "
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
    local developers, publishers = {}, {}
    local genre_ids = {}
    if type(common.associations) == "table" then
        for _, association in pairs(common.associations) do
            if type(association) == "table" then
                local association_type = tostring(association.type or ""):lower()
                local association_name = tostring(association.name or "")
                if association_name ~= "" and association_type == "developer" then
                    table.insert(developers, association_name)
                elseif association_name ~= "" and association_type == "publisher" then
                    table.insert(publishers, association_name)
                elseif association_name ~= "" and association_type == "franchise" and franchise == "" then
                    franchise = association_name
                end
            end
        end
    end
    if type(common.genres) == "table" then
        for _, genre_id in pairs(common.genres) do
            local value = tostring(genre_id or ""); if value:match("^%d+$") then table.insert(genre_ids, value) end
        end
        table.sort(genre_ids)
    end

    local category_ids = {}
    if type(common.category) == "table" then
        for key, enabled in pairs(common.category) do
            local category_id = tostring(key or ""):match("^category_(%d+)$")
            if category_id and (enabled == 1 or enabled == true or tostring(enabled) == "1") then
                table.insert(category_ids, tonumber(category_id))
            end
        end
        table.sort(category_ids)
    end
    local release_timestamp = tonumber(common.steam_release_date)
    local release_date = release_timestamp and release_timestamp > 0
        and os.date("!%Y-%m-%d", release_timestamp) or ""

    local shortcut_icons = {}
    local legacy_header = legacy_store_asset_url(appid, common.header_image)
    local legacy_logo = community_asset_url(appid, common.logo, "jpg")
    local client_tga = community_asset_url(appid, common.clienttga, "tga")
    local client_ico_legacy = community_asset_url(appid, common.clienticon, "ico")
    local client_ico_modern = community_icon_asset_url(appid, common.clienticon, "ico")
    local client_jpg_legacy = community_asset_url(appid, common.clienticon or common.icon, "jpg")
    local client_jpg_modern = community_icon_asset_url(appid, common.clienticon or common.icon, "jpg")
    local community_icon = community_icon_url(appid, common.icon)
    local community_icon_legacy = community_asset_url(appid, common.icon, "jpg")
    local community_icon_modern = community_icon_asset_url(appid, common.icon, "jpg")
    local community_icon_png = community_asset_url(appid, common.icon, "png")

    -- 1. Official Steam client & sidebar artwork icon (exact 1:1 match with Steam native sidebar)
    if community_icon_legacy ~= "" then table.insert(shortcut_icons, { url = community_icon_legacy, extension = "jpg" }) end
    if community_icon_modern ~= "" and community_icon_modern ~= community_icon_legacy then table.insert(shortcut_icons, { url = community_icon_modern, extension = "jpg" }) end
    if community_icon_png ~= "" then table.insert(shortcut_icons, { url = community_icon_png, extension = "png" }) end

    -- 2. Official executable and community icon variants
    if client_jpg_legacy ~= "" and client_jpg_legacy ~= community_icon_legacy then table.insert(shortcut_icons, { url = client_jpg_legacy, extension = "jpg" }) end
    if client_jpg_modern ~= "" and client_jpg_modern ~= community_icon_modern then table.insert(shortcut_icons, { url = client_jpg_modern, extension = "jpg" }) end
    if client_ico_legacy ~= "" then table.insert(shortcut_icons, { url = client_ico_legacy, extension = "ico" }) end
    if client_ico_modern ~= "" and client_ico_modern ~= client_ico_legacy then table.insert(shortcut_icons, { url = client_ico_modern, extension = "ico" }) end
    if client_tga ~= "" then table.insert(shortcut_icons, { url = client_tga, extension = "tga" }) end

    local result = {
        found = has_library_assets or #shortcut_icons > 0 or community_icon ~= "" or legacy_header ~= "" or legacy_logo ~= "",
        appid = appid,
        source = "steamcmd_appinfo",
        portrait = library_asset_url(appid, pick_library_asset(assets.library_capsule, language, true)),
        hero = library_asset_url(appid, pick_library_asset(assets.library_hero, language, true)),
        logo = library_asset_url(appid, pick_library_asset(assets.library_logo, language, true)),
        wide = library_asset_url(appid, pick_library_asset(assets.library_header, language, true)),
        legacy_header = legacy_header, legacy_logo = legacy_logo,
        icon = community_icon,
        shortcut_icon = shortcut_icons[1] and shortcut_icons[1].url or "",
        shortcut_icon_extension = shortcut_icons[1] and shortcut_icons[1].extension or "",
        shortcut_icons = shortcut_icons,
        shortcut_icon_algorithm = 3,
        library_asset_language_algorithm = 2,
        franchise = franchise,
        developers = developers,
        publishers = publishers,
        genre_ids = genre_ids,
        controller_support = tostring(common.controller_support or ""),
        category_ids = category_ids,
        release_date = release_date,
        library_metadata_algorithm = 1,
        historical_metadata_algorithm = 1,
        logo_position = type(assets.library_logo) == "table" and assets.library_logo.logo_position or nil,
        install_size = official_install_size_bytes(type(body.data[appid]) == "table" and body.data[appid].depots or nil),
        install_size_algorithm = 3,
    }
    if result.logo == "" then result.logo = legacy_logo end
    if result.wide == "" then result.wide = legacy_header end
    local encoded = cjson.encode(result)
    lru.put(library_assets_cache, cache_key, { value = encoded, time = os.time() }, LIBRARY_ASSETS_CACHE_LIMIT)
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
    local host = url:match("^https://([^/%?#]+)")
    host = host and host:lower():gsub(":%d+$", "") or ""
    -- Do not accept lookalike hosts such as steamgriddb.com.example.org.
    if host == "steamgriddb.com" or host:match("^[a-z0-9-]+%.steamgriddb%.com$") then return url end
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
    if not ok_http or not res then return nil, "transient" end
    local status = tonumber(res.status) or 0
    if status ~= 200 or not res.body then
        return nil, status == 404 and "missing" or "transient"
    end
    local ok_body, body = pcall(cjson.decode, res.body)
    if not ok_body or type(body) ~= "table" then return nil, "transient" end
    return body, "ok"
end

function M.validate_steamgriddb_api_key(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then return cjson.encode({ ok = false, error = "invalid_request" }) end
    local api_key = tostring(request.api_key or ""):match("^%s*(.-)%s*$") or ""
    if #api_key < 16 or #api_key > 160 then return cjson.encode({ ok = false, error = "invalid_key_format" }) end

    -- A stable Steam mapping verifies authentication without downloading any
    -- artwork. Never return or log the credential.
    local ok_http, response = pcall(http.get, "https://www.steamgriddb.com/api/v2/games/steam/10", {
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. api_key,
            ["User-Agent"] = USER_AGENT,
        },
        timeout = 10,
    })
    if not ok_http or not response then return cjson.encode({ ok = false, error = "service_unavailable" }) end
    local status = tonumber(response.status) or 0
    if status == 401 or status == 403 then return cjson.encode({ ok = false, error = "invalid_key" }) end
    if status ~= 200 then return cjson.encode({ ok = false, error = "service_unavailable", status = status }) end
    return cjson.encode({ ok = true })
end

local function steamgriddb_asset_is_safe(item)
    if type(item) ~= "table" or item.nsfw == true or item.humor == true
        or item.epilepsy == true or item.animated == true then return false end
    local asset_type = tostring(item.type or ""):lower()
    if asset_type == "animated" then return false end
    local fields = { item.style, item.tags, item.name }
    for _, value in ipairs(fields) do
        local text
        if type(value) == "table" then
            local parts = {}
            for _, tag in pairs(value) do
                local tag_val = type(tag) == "table" and (tag.name or tag.tag or tag.slug or "") or tag
                parts[#parts + 1] = tostring(tag_val or "")
            end
            text = table.concat(parts, " ")
        else
            text = tostring(value or "")
        end
        text = text:lower()
        if text:find("nsfw", 1, true) or text:find("meme", 1, true)
            or text:find("humor", 1, true) or text:find("joke", 1, true)
            or text:find("epilepsy", 1, true)
            or text:find("nintendo switch", 1, true) or text:find("switch banner", 1, true)
            or text:find("switch grid", 1, true) or text:find("switch cover", 1, true)
            or text:find("playstation banner", 1, true) or text:find("ps5 banner", 1, true)
            or text:find("ps4 banner", 1, true) or text:find("xbox banner", 1, true)
            or text:find("console banner", 1, true) then
            return false
        end
    end
    return true
end

local function steamgriddb_first_asset(body, spec)
    local items = type(body) == "table" and body.data or nil
    if type(items) ~= "table" then return { url = "" } end
    if items.url then items = { items } end
    local candidates = {}
    for position, item in ipairs(items) do
        local url = type(item) == "table" and steamgriddb_image_url(item.url) or ""
        if url ~= "" and steamgriddb_asset_is_safe(item) then
            local width = tonumber(item.width)
            local height = tonumber(item.height)
            local orientation_ok = spec.orientation ~= "portrait"
                or not width or not height or height > width
            local ratio = width and height and height > 0 and width / height or nil
            local quality_ok = (not spec.min_width or (width and width >= spec.min_width))
                and (not spec.min_height or (height and height >= spec.min_height))
                and (not spec.min_ratio or (ratio and ratio >= spec.min_ratio))
                and (not spec.max_ratio or (ratio and ratio <= spec.max_ratio))
            if orientation_ok and quality_ok then
                table.insert(candidates, { item = item, url = url, position = position })
            end
        end
    end
    if #candidates == 0 then return { url = "" } end

    -- Some retired games need one human-reviewed selection because popularity
    -- cannot know which edition/composition best matches the original Library.
    -- Prefer a stable SteamGridDB asset id when one was reviewed; rank remains
    -- available for older curated entries whose chosen candidate has no id.
    local curated_id = tonumber(spec.id)
    if curated_id then
        for _, candidate in ipairs(candidates) do
            local item = candidate.item
            if tonumber(item.id) == curated_id then
                return {
                    url = candidate.url, id = item.id, provider = "steamgriddb",
                    width = tonumber(item.width), height = tonumber(item.height),
                    language = item.language, style = item.style,
                    transparent = item.transparent == true,
                    selection = "curated_id", rank = candidate.position,
                }
            end
        end
    end

    -- The rank is applied after safety/orientation filters and is returned in
    -- provenance so the decision remains auditable.
    local curated_rank = tonumber(spec.rank)
    if curated_rank and curated_rank >= 1 and candidates[curated_rank] then
        local candidate = candidates[curated_rank]
        local item = candidate.item
        return {
            url = candidate.url, id = item.id, provider = "steamgriddb",
            width = tonumber(item.width), height = tonumber(item.height),
            language = item.language, style = item.style,
            transparent = item.transparent == true,
            selection = "curated_rank", rank = curated_rank,
        }
    end

    -- SteamGridDB already returns its Highest Score order. Preserve the first
    -- safe candidate that passed the slot-quality filters above.
    local candidate = candidates[1]
    local item = candidate.item
    return { url = candidate.url, id = item.id, provider = "steamgriddb",
        width = tonumber(item.width), height = tonumber(item.height), language = item.language,
        style = item.style, transparent = item.transparent == true,
        selection = "highest_score", rank = candidate.position }
end

-- Rank within SteamGridDB's score-ordered, safety-filtered candidates. This is
-- deliberately small and data-only: automatic selection remains the default.
local STEAMGRIDDB_CURATED_RANKS = {
    ["221430"] = {
        portrait_rank = 2,
        hero_id = 38076,
        logo_id = 119351,
        wide_rank = 1,
    },
    ["237110"] = { portrait_id = 46421 },
}

function M.fetch_community_artwork(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then return cjson.encode({ error = "invalid_request" }) end
    local appid = tostring(request.steam_app_id or request.appid or "")
    if not appid:match("^%d+$") then return cjson.encode({ error = "invalid_appid" }) end

    local api_keys, seen_keys = {}, {}
    local function add_api_key(value)
        local key = tostring(value or ""):match("^%s*(.-)%s*$") or ""
        if #key >= 16 and #key <= 160 and not seen_keys[key] then
            seen_keys[key] = true
            api_keys[#api_keys + 1] = key
        end
    end
    add_api_key(request.api_key)
    if type(request.api_keys) == "table" then
        for _, value in ipairs(request.api_keys) do add_api_key(value) end
    end
    if #api_keys == 0 then return cjson.encode({ error = "api_key_missing" }) end

    -- SteamGridDB maps its own game ids from Steam AppIDs, avoiding fuzzy title
    -- searches and accidental artwork from a different edition.
    local api_key, game_id, lookup_confirmed = nil, nil, false
    for _, candidate_key in ipairs(api_keys) do
        local game, status = steamgriddb_request("games/steam/" .. appid, candidate_key)
        if status == "ok" or status == "missing" then lookup_confirmed = true end
        game_id = type(game) == "table" and type(game.data) == "table" and tonumber(game.data.id) or nil
        if game_id then api_key = candidate_key; break end
    end
    if not game_id then
        if not lookup_confirmed then
            return cjson.encode({ error = "service_unavailable", transient_error = true })
        end
        return cjson.encode({ found = false, source = "steamgriddb" })
    end

    local id = tostring(math.floor(game_id))
    local curated = STEAMGRIDDB_CURATED_RANKS[appid] or {}
    local transient_error = false
    local function resource_request(path)
        local body, status = steamgriddb_request(path, api_key)
        if status == "transient" then transient_error = true end
        return body
    end
    -- Do not lock portraits to 600x900: SteamGridDB also has high-quality
    -- 660x930 and 342x482 legacy/Galaxy covers that normalize cleanly to Steam's canvas.
    local portrait_res = resource_request("grids/game/" .. id .. "?dimensions=600x900,342x482,660x930")
    local portrait = steamgriddb_first_asset(portrait_res, {
        ratio = 600 / 900, width = 600, height = 900, orientation = "portrait",
        min_width = 300, min_height = 400, min_ratio = 0.50, max_ratio = 0.85,
        id = curated.portrait_id, rank = curated.portrait_rank,
    })
    if not portrait.url or portrait.url == "" then
        portrait = steamgriddb_first_asset(resource_request("grids/game/" .. id), {
            ratio = 600 / 900, width = 600, height = 900, orientation = "portrait",
            min_width = 300, min_height = 400, min_ratio = 0.50, max_ratio = 0.85,
            id = curated.portrait_id, rank = curated.portrait_rank,
        })
    end
    local hero = steamgriddb_first_asset(resource_request("heroes/game/" .. id), {
        ratio = 1920 / 620, width = 1920, height = 620,
        min_width = 1280, min_height = 400, min_ratio = 2.35, max_ratio = 3.65,
        id = curated.hero_id, rank = curated.hero_rank,
    })
    -- Logos have intentionally variable aspect ratios; transparency and the
    -- provider's score order are better signals than forcing a 16:9 ratio.
    local logo = steamgriddb_first_asset(resource_request("logos/game/" .. id), {
        transparent = true, id = curated.logo_id, rank = curated.logo_rank,
    })
    local wide = steamgriddb_first_asset(resource_request("grids/game/" .. id .. "?dimensions=920x430"), {
        ratio = 920 / 430, width = 920, height = 430,
        min_width = 800, min_height = 350, min_ratio = 1.8, max_ratio = 2.65, rank = curated.wide_rank,
    })
    local result = {
        found = true,
        source = "steamgriddb",
        transient_error = transient_error,
        curated = next(curated) ~= nil,
        portrait = portrait.url, hero = hero.url, logo = logo.url, wide = wide.url,
        provenance = { portrait = portrait, hero = hero, logo = logo, wide = wide },
    }
    result.found = result.portrait ~= "" or result.hero ~= "" or result.logo ~= "" or result.wide ~= ""
    -- Do not log URLs or the API key; a count is enough for diagnostics.
    logger:info("SteamGridDB fallback resolved " .. appid .. " assets="
        .. tostring((result.portrait ~= "" and 1 or 0) + (result.hero ~= "" and 1 or 0)
            + (result.logo ~= "" and 1 or 0) + (result.wide ~= "" and 1 or 0)))
    return cjson.encode(result)
end

function M.save_shortcut_artwork(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then return cjson.encode({ ok = false, error = "invalid_request" }) end
    local shortcut_app_id = tostring(request.shortcut_app_id or "")
    local image_type = tonumber(request.image_type)
    local ext = tostring(request.extension or "png"):lower()
    if ext == "jpeg" then ext = "jpg" end
    if not shortcut_app_id:match("^%d+$") or not image_type or image_type < 0 or image_type > 3
        or (ext ~= "png" and ext ~= "jpg") then
        return cjson.encode({ ok = false, error = "invalid_request" })
    end
    local body = icon_files.decode_base64(request.data_base64 or request.image_base64 or "")
    if not icon_files.validate(body, ext) then return cjson.encode({ ok = false, error = "invalid_image" }) end
    local account_id = get_active_account_id()
    if not account_id then return cjson.encode({ ok = false, error = "active_user_not_found" }) end
    local grid_dir = fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")
    if not fs.exists(grid_dir) then fs.create_directories(grid_dir) end
    if not fs.exists(grid_dir) then return cjson.encode({ ok = false, error = "grid_directory_failed" }) end
    local suffixes = { [0] = "p", [1] = "_hero", [2] = "_logo", [3] = "" }
    local suffix = suffixes[math.floor(image_type)]
    local target = fs.join(grid_dir, shortcut_app_id .. suffix .. "." .. ext)
    local temp = target .. ".tmp"
    local file = io.open(temp, "wb")
    if not file then return cjson.encode({ ok = false, error = "open_failed" }) end
    local wrote = file:write(body)
    local closed = file:close()
    if not wrote or not closed then os.remove(temp); return cjson.encode({ ok = false, error = "write_failed" }) end
    if fs.exists(target) then os.remove(target) end
    local moved = os.rename(temp, target)
    if not moved then os.remove(temp); return cjson.encode({ ok = false, error = "commit_failed" }) end
    for _, old_ext in ipairs({ "png", "jpg", "jpeg" }) do
        local old = fs.join(grid_dir, shortcut_app_id .. suffix .. "." .. old_ext)
        if old ~= target and fs.exists(old) then os.remove(old) end
    end
    logger:info("Custom shortcut artwork saved: " .. target)
    return cjson.encode({ ok = true, saved = true, path = target, image_type = image_type })
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
	local icon_epoch = icon_files.begin(shortcut_app_id)
	local function icon_write_is_current()
		return icon_files.is_current(shortcut_app_id, icon_epoch)
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
        local body = icon_files.decode_base64(icon_base64)
		if not icon_write_is_current() then return cjson.encode({ error = "superseded" }) end
        local filepath, write_error = icon_files.write(grid_dir, shortcut_app_id, ext, body)
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
                if not icon_files.validate(res.body, ext) then
                    -- Steam publishes several icon candidates for the same app. Some
                    -- endpoints answer successfully but contain a format Millennium
                    -- cannot use. This is an expected candidate miss, not a plugin
                    -- warning; the frontend can still provide the official PNG.
                    logger:info("Skipped unusable official icon candidate for " .. steam_app_id
                        .. " ext=" .. ext)
                else
					if not icon_write_is_current() then return cjson.encode({ error = "superseded" }) end
                    local filepath, write_error = icon_files.write(grid_dir, shortcut_app_id, ext, res.body)
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

local function remove_grid_files(grid_dir, sid, suffixes)
    local removed = 0
    if not fs.exists(grid_dir) then return 0 end
    local sid_str = tostring(sid or ""):match("(%d+)") or ""
    if sid_str == "" then return 0 end
    local sid_num = tonumber(sid_str)
    local signed_sid = (sid_num and sid_num >= 2147483648) and tostring(math.floor(sid_num - 4294967296)) or nil
    local ids = { sid_str }
    if signed_sid then table.insert(ids, signed_sid) end

    for _, id in ipairs(ids) do
        for _, suffix in ipairs(suffixes) do
            for _, ext in ipairs({ "jpg", "jpeg", "png", "tga", "ico" }) do
                local filepath = fs.join(grid_dir, id .. suffix .. "." .. ext)
                if fs.exists(filepath) then
                    os.remove(filepath)
                    removed = removed + 1
                end
            end
        end
    end
    return removed
end

function M.clear_artwork_except_icon(shortcut_app_id)
	icon_files.invalidate(shortcut_app_id)
    local account_id = get_active_account_id()
    if not account_id then return cjson.encode({ error = "Could not determine active Steam user" }) end
    local grid_dir = fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")
    local removed = remove_grid_files(grid_dir, tostring(shortcut_app_id), { "p", "_hero", "_logo", "" })
    return cjson.encode({ removed = removed, icon_preserved = true })
end

function M.clear_artwork(shortcut_app_id)
	icon_files.invalidate(shortcut_app_id)
    local account_id = get_active_account_id()
    if not account_id then return cjson.encode({ error = "Could not determine active Steam user" }) end
    local grid_dir = fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")
    local removed = remove_grid_files(grid_dir, tostring(shortcut_app_id), { "p", "_hero", "_logo", "_icon", "" })
    return cjson.encode({ removed = removed })
end

function M.clear_all_linked_artworks()
    local account_id = get_active_account_id()
    if not account_id then return cjson.encode({ error = "Could not determine active Steam user" }) end
    local grid_dir = fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")
    if not fs.exists(grid_dir) then return cjson.encode({ removed = 0, ok = true }) end
    local mappings_path = config.mappings_file_path()
    local removed = 0
    if fs.exists(mappings_path) then
        local f = io.open(mappings_path, "r")
        if f then
            local raw = f:read("*a")
            f:close()
            local ok, parsed = pcall(cjson.decode, raw)
            if ok and type(parsed) == "table" then
                for shortcut_id, _ in pairs(parsed) do
                    local sid = tostring(shortcut_id):match("(%d+)$")
                    if sid then
						icon_files.invalidate(sid)
                        removed = removed + remove_grid_files(grid_dir, sid, { "p", "_hero", "_logo", "_icon", "" })
                        local json_path = fs.join(grid_dir, sid .. ".json")
                        if fs.exists(json_path) then os.remove(json_path) end
                    end
                end
            end
        end
    end
    logger:info("Dismount cleanup: removed " .. tostring(removed) .. " grid files for linked shortcuts.")
    return cjson.encode({ ok = true, removed = removed })
end

return M
end
