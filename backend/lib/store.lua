return function(deps)
local logger = deps.logger
local http = deps.http
local cjson = deps.cjson
local util = deps.util
local USER_AGENT = deps.user_agent or "Steam-Game-Data-Linker-Mod/2.6"
local M = {}

function M.fetch_game_data(steam_app_id, language)
    local appid, requested_language = util.normalize_appid_and_language(steam_app_id, language)
    if not appid:match("^%d+$") then return cjson.encode({ error = "invalid_appid" }) end
    local url = "https://store.steampowered.com/api/appdetails?appids=" .. appid .. "&l=" .. requested_language
    logger:info("Fetching game data from: " .. url)
    local ok_http, res, err = pcall(http.get, url, {
        headers = { ["Accept"] = "application/json", ["User-Agent"] = USER_AGENT }, timeout = 15
    })
    if not ok_http or not res then return cjson.encode({ error = "Request failed: " .. tostring(err or res) }) end
    if res.status ~= 200 then return cjson.encode({ error = "HTTP " .. tostring(res.status) }) end
    local ok, body = pcall(cjson.decode, res.body)
    if not ok then return cjson.encode({ error = "Parse error" }) end
    local app_data = body[appid]
    if not app_data or not app_data.success then return cjson.encode({ error = "App not found or API returned unsuccessful" }) end
    return cjson.encode(app_data.data)
end

return M
end
