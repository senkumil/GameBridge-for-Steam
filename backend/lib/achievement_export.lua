return function(deps)
local logger = deps.logger
local fs = deps.fs
local cjson = deps.cjson
local settings = deps.achievement_settings
local state_reader = deps.achievement_state
local M = {}

local function read_file_text(path)
    if not path or path == "" or not fs.exists(path) then return nil end
    local f, err = io.open(path, "rb")
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    return content
end

local function write_file_text(path, text)
    local parent = fs.parent_path(path)
    if parent and parent ~= "" and not fs.exists(parent) then
        fs.create_directories(parent)
    end
    local f, err = io.open(path, "wb")
    if not f then return false, err end
    f:write(text)
    f:close()
    return true
end

local function copy_file(src, dst)
    local content = read_file_text(src)
    if not content then return false end
    return write_file_text(dst, content)
end

function M.export_achievements_json(request_json)
    local request = settings.parse_request(request_json)
    local state_appid = request.shortcut_app_id or request.state_app_id
    local metadata_appid = request.steam_app_id or request.appid
    if not metadata_appid or metadata_appid == "" then
        metadata_appid = state_appid
    end
    if not metadata_appid or metadata_appid == "" then
        return cjson.encode({ ok = false, error = "missing_game_id" })
    end

    local unlocked_names = type(request.unlocked_names) == "table" and request.unlocked_names or {}
    local unlocked_set = {}
    for _, name in ipairs(unlocked_names) do
        unlocked_set[tostring(name)] = true
    end

    -- 1. Determine destination path:
    local target_path = nil
    local custom_path = request.target_path or request.export_path or request.path
    if type(custom_path) == "string" and custom_path:match("%S") then
        custom_path = custom_path:match("^%s*(.-)%s*$")
        if custom_path:lower():match("%.json$") then
            target_path = custom_path
        else
            target_path = fs.join(custom_path, "achievements.json")
        end
    end

    if not target_path then
        local explicit_path, explicit_key = settings.configured_path(state_appid, metadata_appid)
        if explicit_path and explicit_path ~= "" then
            if explicit_path:lower():match("%.json$") then
                target_path = explicit_path
            else
                target_path = fs.join(explicit_path, "achievements.json")
            end
        end
    end

    local appdata = os.getenv("APPDATA") or ""
    local localappdata = os.getenv("LOCALAPPDATA") or ""
    local userprofile = os.getenv("USERPROFILE") or ""
    if appdata == "" and userprofile ~= "" then appdata = fs.join(userprofile, "AppData", "Roaming") end
    if localappdata == "" and userprofile ~= "" then localappdata = fs.join(userprofile, "AppData", "Local") end

    if not target_path then
        local candidates = {}
        if appdata ~= "" then
            candidates[#candidates + 1] = fs.join(appdata, "Goldberg SteamEmu Saves", tostring(metadata_appid), "achievements.json")
            candidates[#candidates + 1] = fs.join(appdata, "Goldberg SteamEmu Saves", tostring(state_appid or ""), "achievements.json")
            candidates[#candidates + 1] = fs.join(appdata, "GSE Saves", tostring(metadata_appid), "achievements.json")
            candidates[#candidates + 1] = fs.join(appdata, "Steam", tostring(metadata_appid), "stats", "achievements.json")
        end
        if localappdata ~= "" then
            candidates[#candidates + 1] = fs.join(localappdata, "Goldberg SteamEmu Saves", tostring(metadata_appid), "achievements.json")
            candidates[#candidates + 1] = fs.join(localappdata, "GSE Saves", tostring(metadata_appid), "achievements.json")
        end

        for _, c in ipairs(candidates) do
            if fs.exists(c) then
                target_path = c
                break
            end
        end
    end

    if not target_path then
        if appdata ~= "" then
            target_path = fs.join(appdata, "Goldberg SteamEmu Saves", tostring(metadata_appid), "achievements.json")
        else
            target_path = fs.join("C:\\Steam Auto", tostring(metadata_appid), "achievements.json")
        end
    end

    -- 2. Smart Merge with existing file (and backup):
    local backup_created = false
    local existing_map = {}
    if fs.exists(target_path) then
        local bak_path = target_path .. ".bak"
        if copy_file(target_path, bak_path) then
            backup_created = true
        end
        local parsed = state_reader.decode(target_path)
        if type(parsed) == "table" then
            if #parsed > 0 then
                for _, item in ipairs(parsed) do
                    if type(item) == "table" and item.name then
                        existing_map[tostring(item.name)] = {
                            earned = item.earned == true or item.achieved == 1 or item.unlocked == true,
                            earned_time = tonumber(item.earned_time or item.unlock_time or item.time) or 0,
                            progress = tonumber(item.progress or item.cur_progress) or 0,
                            max_progress = tonumber(item.max_progress) or 0,
                        }
                    end
                end
            else
                for k, v in pairs(parsed) do
                    if type(k) == "string" and type(v) == "table" then
                        existing_map[k] = {
                            earned = v.earned == true or v.achieved == 1 or v.unlocked == true,
                            earned_time = tonumber(v.earned_time or v.unlock_time or v.time) or 0,
                            progress = tonumber(v.progress or v.cur_progress) or 0,
                            max_progress = tonumber(v.max_progress) or 0,
                        }
                    end
                end
            end
        end
    end

    local now = os.time()
    local merged_result = {}
    local merged_count = 0

    for name, data in pairs(existing_map) do
        merged_result[name] = {
            earned = data.earned,
            earned_time = data.earned_time,
            progress = data.progress,
            max_progress = data.max_progress,
        }
        if data.earned then merged_count = merged_count + 1 end
    end

    for name, _ in pairs(unlocked_set) do
        if not merged_result[name] then
            merged_result[name] = {
                earned = true,
                earned_time = now,
                progress = 0,
                max_progress = 0,
            }
            merged_count = merged_count + 1
        elseif not merged_result[name].earned then
            merged_result[name].earned = true
            if not merged_result[name].earned_time or merged_result[name].earned_time <= 0 then
                merged_result[name].earned_time = now
            end
            merged_count = merged_count + 1
        end
    end

    local ok_json, json_text = pcall(cjson.encode, merged_result)
    if not ok_json or not json_text then
        return cjson.encode({ ok = false, error = "json_encode_failed" })
    end

    local ok_write, write_err = write_file_text(target_path, json_text)
    if not ok_write then
        return cjson.encode({ ok = false, error = "write_failed: " .. tostring(write_err) })
    end

    if custom_path and custom_path ~= "" then
        settings.set_path(state_appid, target_path)
    end

    settings.set_game_options(cjson.encode({
        shortcut_app_id = state_appid,
        steam_app_id = metadata_appid,
        simulate = false,
        simulate_count = 0,
        simulate_online_count = 0,
        unlocked_names = nil,
    }))

    return cjson.encode({
        ok = true,
        path = target_path,
        backup_created = backup_created,
        merged_count = merged_count,
    })
end

return M
end
