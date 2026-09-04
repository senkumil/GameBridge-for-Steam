return function(deps)
local logger = deps.logger
local http = deps.http
local cjson = deps.cjson
local util = deps.util
local USER_AGENT = deps.user_agent or "NativeGameLink-for-Steam/2.0.0"
local M = {}

local function trim(value)
    return tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function fetch(url, accept, timeout)
    local ok, response, err = pcall(http.get, url, {
        headers = {
            ["Accept"] = accept or "*/*",
            ["User-Agent"] = USER_AGENT,
        },
        timeout = timeout or 15,
    })
    if not ok or not response then return nil, tostring(err or response) end
    return response, nil
end

local function community_game_name(html)
    local name = tostring(html or ""):match('class="apphub_AppName"[^>]*>([^<]+)<')
        or tostring(html or ""):match("<title>%s*Steam Community ::%s*([^<]+)</title>")
    name = trim(util.html_unescape(name or ""))
    if name == "" or name:lower() == "steam community" then return nil end
    return name
end

local function community_achievement_count(appid)
    local response = fetch(
        "https://steamcommunity.com/stats/" .. appid .. "/achievements?l=english",
        "text/html,*/*",
        8
    )
    if not response or response.status ~= 200 or not response.body then return 0 end

    -- Steam's generic error page can also return HTTP 200. Only actual rows
    -- prove that this AppID published a Steam achievement schema.
    local _, count = response.body:gsub('<div class="achieveRow[%s"]', "")
    return tonumber(count) or 0
end

local function is_historical_store_record(data)
    -- Steam preserves AppDetails for some removed products, but changes their
    -- type to "advertising". They have an App Hub and official metadata, yet
    -- no longer have a usable Store game page. Treat those records as retired
    -- so the library renders the historical information and resource recovery
    -- surfaces instead of Steam's empty non-Steam placeholder.
    return type(data) == "table" and tostring(data.type or ""):lower() == "advertising"
end

local function recover_delisted_game(appid)
    local response = fetch("https://steamcommunity.com/app/" .. appid, "text/html,*/*", 10)
    if not response or response.status ~= 200 or not response.body then return nil end

    local game_name = community_game_name(response.body)
    if not game_name then return nil end

    local achievement_count = community_achievement_count(appid)
    local asset_root = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/" .. appid .. "/"
    local data = {
        type = "game",
        name = game_name,
        steam_appid = tonumber(appid) or 0,
        header_image = asset_root .. "header.jpg",
        capsule_image = "",
        capsule_imagev5 = "",
        background = "",
        background_raw = "",
        short_description = "",
        achievements = { total = achievement_count },
        is_delisted = true,
        metadata_sources = {
            identity = "steam_community_app_hub",
            artwork = "probe_on_demand",
            news = "steam_news_web_api",
            community = "steam_community_app_hub",
            achievements = achievement_count > 0 and "steam_community_stats" or "unavailable",
        },
        historical_capabilities = {
            identity = "available",
            artwork = "probe_on_demand",
            news = "probe_on_demand",
            community = "available",
            achievements = achievement_count > 0 and "available" or "unavailable",
        },
    }
    logger:info("Delisted game recovered via Steam Community: " .. game_name .. " (" .. appid
        .. ", achievements: " .. tostring(achievement_count) .. ")")
    return data
end

function M.fetch_game_data(steam_app_id, language)
    local appid, requested_language = util.normalize_appid_and_language(steam_app_id, language)
    if not appid:match("^%d+$") then return cjson.encode({ error = "invalid_appid" }) end
    local url = "https://store.steampowered.com/api/appdetails?appids=" .. appid .. "&l=" .. requested_language
    logger:info("Fetching game data from: " .. url)
    local res, request_error = fetch(url, "application/json", 15)
    if res and res.status == 200 and res.body then
        local ok, body = pcall(cjson.decode, res.body)
        local app_data = ok and body and body[appid] or nil
        if app_data and app_data.success and type(app_data.data) == "table" then
            -- Most valid AppDetails records are active Store pages. A small
            -- retired class remains queryable but identifies itself as
            -- "advertising" (for example Pro Evolution Soccer 2014); this is
            -- authoritative evidence that the normal game page is gone.
            if is_historical_store_record(app_data.data) then
                app_data.data.is_delisted = true
                app_data.data.historical_capabilities = app_data.data.historical_capabilities or {
                    identity = "available",
                    artwork = "probe_on_demand",
                    news = "probe_on_demand",
                    community = "probe_on_demand",
                    achievements = "probe_on_demand",
                }
                logger:info("Retired Steam AppDetails record recovered: " .. tostring(app_data.data.name or appid)
                    .. " (" .. appid .. ")")
            end
            app_data.data.metadata_sources = app_data.data.metadata_sources or {
                identity = "steam_store_api",
                artwork = "steam_store_api",
            }
            return cjson.encode(app_data.data)
        end
    end

    -- The App Hub is an independent official source. Try it after every Store
    -- failure (HTTP, parse or success=false), not only after a negative JSON.
    local recovered = recover_delisted_game(appid)
    if recovered then return cjson.encode(recovered) end
    if request_error then logger:info("Store request failed for " .. appid .. ": " .. request_error) end
    return cjson.encode({ error = "App not found in Steam Store or Steam Community" })
end

return M
end
