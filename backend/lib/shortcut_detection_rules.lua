-- Declarative game rules module for title-specific tracking behaviors,
-- persistent launcher preservation, and automatic thread overrides.
return function(deps)
local fs = deps.fs
local detection_text = deps.shortcut_detection_text
local detection_clean_path = detection_text.clean_path
local detection_basename = detection_text.basename
local detection_normalize = detection_text.normalize
local detection_clean_game_title = detection_text.clean_game_title

local M = {}

-- Declarative registry of game-specific override and tracking behaviors.
-- Adding a new game only requires adding a table entry here.
local GAME_CUSTOM_RULES = {
    ["red_dead_redemption"] = {
        title_patterns = { "reddead", "rdr" },
        auto_override_target = "Launcher.exe",
        auto_override_triggers = { ["rdr2.exe"] = true },
        preserve_launchers = { ["launcher.exe"] = true },
        sibling_indicators = { "rdr2.exe", "rdr.exe" },
    },
    ["the_last_of_us"] = {
        title_patterns = { "thelastofus", "tlou", "lastofus" },
        auto_override_target = "tlou-i.exe",
        auto_override_from_launchers = true,
        auto_override_triggers = {
            ["launcher.exe"] = true,
            ["tlou-i-l.exe"] = true,
            ["tlou.exe"] = true,
            ["start.exe"] = true,
            ["play.exe"] = true,
            ["tlou_launcher.exe"] = true,
        },
        sibling_indicators = { "tlou-i.exe" },
    },
    ["mortal_kombat_ke"] = {
        title_patterns = { "mkke", "mortalkombatke", "mortalkombatkomplete" },
        auto_override_target = "MKKE.exe",
        auto_override_from_launchers = true,
        auto_override_triggers = {
            ["launcher.exe"] = true,
            ["mkke_launcher.exe"] = true,
            ["mortalkombat_launcher.exe"] = true,
            ["start.exe"] = true,
            ["play.exe"] = true,
        },
        sibling_indicators = { "MKKE.exe", "mkke.exe" },
    },
}

local function normalized_title_key(shortcut_title)
    return detection_normalize(detection_clean_game_title(shortcut_title or "")):gsub("%s+", "")
end

local function matches_rule_title(rule, title_key)
    if not title_key or title_key == "" then return false end
    for _, pattern in ipairs(rule.title_patterns or {}) do
        if title_key:match(pattern) then return true end
    end
    return false
end

local function has_sibling_indicator(directory, indicators)
    if not directory or directory == "" or not indicators then return false end
    for _, name in ipairs(indicators) do
        if fs.exists(fs.join(directory, name))
            or fs.exists(fs.join(directory, name:upper()))
            or fs.exists(fs.join(directory, name:lower())) then
            return true
        end
    end
    return false
end

-- Checks whether a launcher executable should be preserved as the tracking executable.
function M.should_preserve_launcher(exe_path, shortcut_title)
    local exe_name = detection_basename(exe_path):lower()
    local title_key = normalized_title_key(shortcut_title)
    local selected_dir = fs.parent_path(exe_path)

    for _, rule in pairs(GAME_CUSTOM_RULES) do
        if rule.preserve_launchers and rule.preserve_launchers[exe_name] then
            if matches_rule_title(rule, title_key)
                or has_sibling_indicator(selected_dir, rule.sibling_indicators) then
                return true
            end
        end
    end
    return false
end

-- Locates if a selected executable should be automatically redirected to a preferred main thread.
function M.find_game_rule_override(exe_path, start_dir, shortcut_title)
    local exe_name = detection_basename(exe_path):lower()
    local title_key = normalized_title_key(shortcut_title)
    local selected_dir = fs.parent_path(exe_path)
    local root = detection_clean_path(start_dir)
    local candidates = { selected_dir }
    if root ~= "" and root ~= selected_dir then table.insert(candidates, root) end

    for _, rule in pairs(GAME_CUSTOM_RULES) do
        if rule.auto_override_target and exe_name ~= rule.auto_override_target:lower() then
            local trigger_matched = (rule.auto_override_triggers and rule.auto_override_triggers[exe_name])
                or (rule.auto_override_from_launchers and (exe_name:match("launcher") or exe_name:match("start") or exe_name:match("play") or exe_name:match("wrapper")))
            local title_matched = matches_rule_title(rule, title_key)

            if trigger_matched or title_matched then
                for _, directory in ipairs(candidates) do
                    if directory and directory ~= "" then
                        local direct_target = fs.join(directory, rule.auto_override_target)
                        if fs.exists(direct_target) then
                            return direct_target, directory, true
                        end
                        local lower_target = fs.join(directory, rule.auto_override_target:lower())
                        if fs.exists(lower_target) then
                            return lower_target, directory, true
                        end
                    end
                end
            end
        end
    end
    return nil, nil, false
end

M.GAME_CUSTOM_RULES = GAME_CUSTOM_RULES
M.normalized_title_key = normalized_title_key
return M
end
