local logger     = require("logger")
local millennium = require("millennium")
local http       = require("http")
local cjson      = require("json")
local fs         = require("fs")
local runtime_utils = require("utils")

local USER_AGENT = "NativeGameLink-for-Steam/2.0.0"

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
deps.lru_cache = load_factory("lru_cache")(deps)
deps.ttl_cache = load_factory("ttl_cache")(deps)
deps.process = load_factory("process")(deps)
deps.artwork_icon = load_factory("artwork_icon")(deps)
deps.shortcut_detection_text = load_factory("shortcut_detection_text")(deps)
deps.shortcut_detection_aliases = load_factory("shortcut_detection_aliases")(deps)
deps.shortcut_detection_rules = load_factory("shortcut_detection_rules")(deps)
deps.shortcut_detection_tracking = load_factory("shortcut_detection_tracking")(deps)
deps.shortcut_detection_pe = load_factory("shortcut_detection_pe")(deps)
deps.shortcut_detection_local = load_factory("shortcut_detection_local")(deps)

local mappings = load_factory("mappings")(deps)
local store = load_factory("store")(deps)
local shortcut_detection = load_factory("shortcut_detection")(deps)
local shortcut_registry = load_factory("shortcut_registry")(deps)
deps.shortcut_registry = shortcut_registry
local community = load_factory("community")(deps)
deps.community = community
local news = load_factory("news")(deps)
local social = load_factory("social")(deps)
local artwork_candidates = load_factory("artwork_candidates")(deps)
deps.artwork_candidates = artwork_candidates
local artwork = load_factory("artwork")(deps)
local artwork_image_io = load_factory("artwork_image_io")(deps)
deps.achievement_settings = load_factory("achievement_settings")(deps)
deps.achievement_policy = load_factory("achievement_policy")(deps)
deps.achievement_sources = load_factory("achievement_sources")(deps)
deps.achievement_state = load_factory("achievement_state")(deps)
local achievement_export = load_factory("achievement_export")(deps)
local steamworks_sync = load_factory("steamworks_sync")(deps)
local steam_card_farmer = load_factory("steam_card_farmer")(deps)
local achievements = load_factory("achievements")(deps)
local playtime = load_factory("playtime")(deps)

-- Millennium discovers frontend-callable functions by global name. Keep the
-- IPC surface stable while delegating implementation to cohesive modules.
function save_mapping(non_steam_id, steam_id) return mappings.save_mapping(non_steam_id, steam_id) end
function remove_mapping(non_steam_id) return mappings.remove_mapping(non_steam_id) end
function update_mappings(request_json) return mappings.update_mappings(request_json) end
function get_all_mappings() return mappings.get_all_mappings() end
function fetch_game_data(steam_app_id, language) return store.fetch_game_data(steam_app_id, language) end
function get_shortcut_details(shortcut_app_id, title) return shortcut_detection.get_shortcut_details(shortcut_app_id, title) end
function list_shortcuts() return shortcut_registry.list() end
function detect_game_candidates(request_json) return shortcut_detection.detect_game_candidates(request_json) end
function detect_game_candidates_local(request_json) return shortcut_detection.detect_game_candidates_local(request_json) end
function fetch_news(steam_app_id, language) return news.fetch_news(steam_app_id, language) end
function fetch_news_historical(steam_app_id, language) return news.fetch_news_historical(steam_app_id, language) end
function fetch_partner_events(steam_app_id, language) return news.fetch_partner_events(steam_app_id, language) end
function fetch_published_file_previews(file_ids_csv) return social.fetch_published_file_previews(file_ids_csv) end
function fetch_friend_review(steam_id64, steam_app_id) return social.fetch_friend_review(steam_id64, steam_app_id) end
function fetch_friend_personas(steam_ids_csv) return social.fetch_friend_personas(steam_ids_csv) end
function fetch_community_activity(steam_app_id, steam_id64) return social.fetch_community_activity(steam_app_id, steam_id64) end
function fetch_community_content(steam_app_id, language)
    local ok, res = pcall(community.fetch_community_content, steam_app_id, language)
    return ok and res or cjson.encode({ items = {}, available = false, error = "backend_error" })
end
function fetch_community_items_catalog(steam_app_id, language)
    local ok, res = pcall(community.fetch_community_items_catalog, steam_app_id, language)
    return ok and res or cjson.encode({ error = "backend_error" })
end
function fetch_library_assets(request_json) return artwork.fetch_library_assets(request_json) end
function fetch_community_artwork(request_json)
    local ok, res = pcall(artwork.fetch_community_artwork, request_json)
    return ok and res or cjson.encode({ error = "backend_error" })
end
function fetch_community_artwork_candidates(request_json)
    local ok, res = pcall(artwork_candidates.fetch, request_json)
    return ok and res or cjson.encode({ eligible = false, error = "backend_error" })
end
function fetch_artwork_image(request_json)
    local ok, res = pcall(artwork_image_io.fetch_remote, request_json)
    return ok and res or cjson.encode({ ok = false, error = "backend_error" })
end
function read_local_artwork_image(request_json) return artwork_image_io.read_local(request_json) end
function validate_steamgriddb_api_key(request_json) return artwork.validate_steamgriddb_api_key(request_json) end
function save_shortcut_icon(request_json) return artwork.save_shortcut_icon(request_json) end
function save_shortcut_artwork(request_json) return artwork.save_shortcut_artwork(request_json) end
function clear_artwork(shortcut_app_id) return artwork.clear_artwork(shortcut_app_id) end
function clear_artwork_except_icon(shortcut_app_id) return artwork.clear_artwork_except_icon(shortcut_app_id) end
function clear_all_linked_artworks() return artwork.clear_all_linked_artworks() end
function read_custom_logo_position(request_json) return artwork.read_custom_logo_position(request_json) end
function get_achievement_base_path() return achievements.get_achievement_base_path() end
function set_achievement_base_path(path) return achievements.set_achievement_base_path(path) end
function get_game_achievement_path(request_json) return achievements.get_game_achievement_path(request_json) end
function set_game_achievement_path(request_json) return achievements.set_game_achievement_path(request_json) end
function get_game_achievement_options(request_json) return achievements.get_game_achievement_options(request_json) end
function set_game_achievement_options(request_json) return achievements.set_game_achievement_options(request_json) end
function get_game_achievement_capabilities(request_json) return achievements.get_game_achievement_capabilities(request_json) end
function export_achievements_json(request_json) return achievement_export.export_achievements_json(request_json) end
function fetch_steam_account_achievements(steam_app_id) return steamworks_sync.fetch_steam_account_achievements(steam_app_id) end
function sync_steam_account_achievements(request_json) return steamworks_sync.sync_steam_account_achievements(request_json) end
function start_steam_card_farming(request_json) return steam_card_farmer.start_card_farming(request_json) end
function stop_steam_card_farming() return steam_card_farmer.stop_card_farming() end
function get_steam_card_farming_status() return steam_card_farmer.get_card_farming_status() end
function fetch_local_achievement_data(request_json, language, state_app_id)
    return achievements.fetch_local_achievement_data(request_json, language, state_app_id)
end
function start_playtime_session(request_json) return playtime.start_session(request_json) end
function ping_playtime_session(request_json) return playtime.ping_session(request_json) end
function stop_playtime_session(request_json) return playtime.stop_session(request_json) end
function get_playtime_data(request_json) return playtime.get_playtime(request_json) end
function get_all_playtime_data(request_json) return playtime.get_all_playtime(request_json) end
function set_playtime_data(request_json) return playtime.set_playtime(request_json) end
function suppress_admin_prompt(request_json) return deps.util.suppress_admin_prompt(request_json) end
function neutralize_steam_appid_file(request_json) return deps.util.neutralize_steam_appid_file(request_json) end
function restore_steam_appid_file(request_json) return deps.util.restore_steam_appid_file(request_json) end
function factory_reset(request_json)
    local ok_req, req = pcall(cjson.decode, tostring(request_json or "{}"))
    local delete_playtime = ok_req and type(req) == "table" and req.delete_playtime == true
    logger:info("Executing factory reset (delete_playtime=" .. tostring(delete_playtime) .. ")")
    pcall(function() artwork.clear_all_linked_artworks() end)
    pcall(function() mappings.clear_all() end)
    pcall(function() achievements.clear_all_settings() end)
    if delete_playtime then
        pcall(function() playtime.clear_all() end)
    end
    return cjson.encode({ ok = true, deleted_playtime = delete_playtime })
end
function fe_log(msg)
    logger:info("[FE] " .. tostring(msg))
    return "ok"
end

local function on_load()
    logger:info("NativeGameLink for Steam plugin loaded")
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
    local ok_flush, flush_err = pcall(function() playtime.flush() end)
    if not ok_flush then logger:warn("Could not flush playtime sessions: " .. tostring(flush_err)) end
    logger:info("NativeGameLink for Steam plugin unloaded")
end

local function on_frontend_loaded()
    logger:info("Frontend loaded - NativeGameLink for Steam ready")
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}
