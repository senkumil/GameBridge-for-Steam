local logger     = require("logger")
local millennium = require("millennium")
local http       = require("http")
local cjson      = require("json")
local fs         = require("fs")

local USER_AGENT = "Steam-Game-Data-Linker-Mod/2.6"

local function resolve_backend_dir()
    local raw = tostring(MILLENNIUM_PLUGIN_SECRET_BACKEND_ABSOLUTE or "")
    if raw == "" then error("Millennium backend path is unavailable") end
    if raw:lower():match("%.lua$") then return fs.parent_path(raw) end
    if fs.exists(fs.join(raw, "main.lua")) then return raw end
    return raw
end

local BACKEND_DIR = resolve_backend_dir()

local function load_factory(name)
    local path = fs.join(BACKEND_DIR, "lib", name .. ".lua")
    local chunk, err = loadfile(path)
    if not chunk then error("Could not load backend module " .. name .. ": " .. tostring(err)) end
    local factory = chunk()
    if type(factory) ~= "function" then error("Backend module " .. name .. " did not return a factory") end
    return factory
end

local deps = {
    logger = logger,
    millennium = millennium,
    http = http,
    cjson = cjson,
    fs = fs,
    user_agent = USER_AGENT,
}

deps.util = load_factory("util")(deps)
deps.config = load_factory("config")(deps)

local mappings = load_factory("mappings")(deps)
local store = load_factory("store")(deps)
local shortcut_detection = load_factory("shortcut_detection")(deps)
local news = load_factory("news")(deps)
local social = load_factory("social")(deps)
local community = load_factory("community")(deps)
local artwork = load_factory("artwork")(deps)
local achievements = load_factory("achievements")(deps)

-- Millennium discovers frontend-callable functions by global name. Keep the
-- IPC surface stable while delegating implementation to cohesive modules.
function save_mapping(non_steam_id, steam_id) return mappings.save_mapping(non_steam_id, steam_id) end
function remove_mapping(non_steam_id) return mappings.remove_mapping(non_steam_id) end
function update_mappings(request_json) return mappings.update_mappings(request_json) end
function get_all_mappings() return mappings.get_all_mappings() end
function fetch_game_data(steam_app_id, language) return store.fetch_game_data(steam_app_id, language) end
function get_shortcut_details(shortcut_app_id) return shortcut_detection.get_shortcut_details(shortcut_app_id) end
function detect_game_candidates(request_json) return shortcut_detection.detect_game_candidates(request_json) end
function fetch_news(steam_app_id, language) return news.fetch_news(steam_app_id, language) end
function fetch_partner_events(steam_app_id, language) return news.fetch_partner_events(steam_app_id, language) end
function fetch_published_file_previews(file_ids_csv) return social.fetch_published_file_previews(file_ids_csv) end
function fetch_friend_review(steam_id64, steam_app_id) return social.fetch_friend_review(steam_id64, steam_app_id) end
function fetch_friend_personas(steam_ids_csv) return social.fetch_friend_personas(steam_ids_csv) end
function fetch_community_content(steam_app_id, language) return community.fetch_community_content(steam_app_id, language) end
function fetch_community_items_catalog(steam_app_id, language) return community.fetch_community_items_catalog(steam_app_id, language) end
function fetch_library_assets(request_json) return artwork.fetch_library_assets(request_json) end
function save_shortcut_icon(request_json) return artwork.save_shortcut_icon(request_json) end
function save_artwork(shortcut_app_id, steam_app_id) return artwork.save_artwork(shortcut_app_id, steam_app_id) end
function clear_artwork(shortcut_app_id) return artwork.clear_artwork(shortcut_app_id) end
function get_achievement_base_path() return achievements.get_achievement_base_path() end
function set_achievement_base_path(path) return achievements.set_achievement_base_path(path) end
function get_game_achievement_path(request_json) return achievements.get_game_achievement_path(request_json) end
function set_game_achievement_path(request_json) return achievements.set_game_achievement_path(request_json) end
function fetch_local_achievement_data(request_json, language, state_app_id)
    return achievements.fetch_local_achievement_data(request_json, language, state_app_id)
end
function fe_log(msg)
    logger:info("[FE] " .. tostring(msg))
    return "ok"
end

local function on_load()
    logger:info("GameBridge for Steam plugin loaded")
    local ok_diag, diag_err = pcall(function()
        logger:info("  Steam path: " .. tostring(millennium.steam_path()))
        logger:info("  Backend dir: " .. tostring(BACKEND_DIR))
        local cfg = deps.config.get_config_path()
        logger:info("  Config path: " .. tostring(cfg))
        logger:info("  Config exists: " .. tostring(fs.exists(cfg)))
        local data = mappings.read_mappings()
        logger:info("  Mappings loaded: " .. tostring(data ~= nil) .. " (" .. tostring(#cjson.encode(data)) .. " bytes)")
    end)
    if not ok_diag then logger:warn("  Diagnostic check failed: " .. tostring(diag_err)) end
    millennium.ready()
end

local function on_unload()
    logger:info("GameBridge for Steam plugin unloaded")
end

local function on_frontend_loaded()
    logger:info("Frontend loaded - GameBridge for Steam ready")
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}
