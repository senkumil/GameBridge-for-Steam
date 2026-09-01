return function(deps)
local fs = deps.fs
local detection_text = deps.shortcut_detection_text
local detection_clean_path = detection_text.clean_path
local detection_basename = detection_text.basename
local detection_stem = detection_text.stem
local detection_game_exe_hint = detection_text.game_exe_hint
local detection_normalize = detection_text.normalize
local detection_clean_game_title = detection_text.clean_game_title
local KNOWN_TITLE_ALIASES = deps.shortcut_detection_aliases or {}

local M = {}

local game_rules = deps.shortcut_detection_rules

-- Some PC releases keep the launcher alive as the process Steam owns while
-- the visible game process is spawned separately. Keep this allowlist narrow
-- and title-scoped so unknown launchers still receive the normal review path.
local PERSISTENT_LAUNCHER_OVERRIDES = {
    ["reddeadredemption2"] = { ["launcher.exe"] = true },
}

local function should_preserve_selected_launcher(exe_path, shortcut_title)
    if game_rules and game_rules.should_preserve_launcher then
        return game_rules.should_preserve_launcher(exe_path, shortcut_title)
    end
    local exe_name = detection_basename(exe_path):lower()
    return exe_name == "launcher.exe"
end

-- RDR2's Empress build keeps the game session attached to the sibling
-- Launcher.exe rather than RDR2.exe. Specific titles with dedicated tracking rules
-- are managed in shortcut_detection_rules.
local function find_persistent_launcher_override(exe_path, start_dir, shortcut_title)
    if game_rules and game_rules.find_game_rule_override then
        local target, dir, auto = game_rules.find_game_rule_override(exe_path, start_dir, shortcut_title)
        if target then return target, dir, auto end
    end

    local exe_name = detection_basename(exe_path):lower()
    if exe_name == "rdr2.exe" then
        local selected_dir = fs.parent_path(exe_path)
        local launcher = fs.join(selected_dir, "Launcher.exe")
        if fs.exists(launcher) then return launcher, selected_dir, true end
    end
    return nil, nil
end

local skipped_directories = {
    ["_commonredist"] = true, ["redist"] = true, ["redistributables"] = true,
    ["directx"] = true, ["vcredist"] = true, ["installers"] = true,
    ["content"] = true, ["engine"] = true, ["saved"] = true, ["intermediate"] = true,
    ["plugins"] = true, ["shaders"] = true, ["movies"] = true, ["videos"] = true,
    ["data"] = true, ["textures"] = true, ["audio"] = true, ["sounds"] = true,
    ["music"] = true, ["localization"] = true, ["node_modules"] = true,
}

local function is_ignored_executable(lower_name)
    return lower_name:match("^unins") ~= nil
        or lower_name:match("crash") ~= nil
        or lower_name:match("^crs") ~= nil
        or lower_name:match("handler") ~= nil
        or lower_name:match("setup") ~= nil
        or lower_name:match("installer") ~= nil
        or lower_name:match("vcredist") ~= nil
        or lower_name:match("dxsetup") ~= nil
        or lower_name:match("directx") ~= nil
        or lower_name:match("dotnet") ~= nil
        or lower_name:match("update") ~= nil
        or lower_name:match("patcher") ~= nil
        or lower_name:match("config") ~= nil
        or lower_name:match("settings") ~= nil
        or lower_name:match("unitycrash") ~= nil
        or lower_name:match("report") ~= nil
        or lower_name:match("telemetry") ~= nil
        or lower_name:match("tool") ~= nil
        or lower_name:match("server") ~= nil
        or lower_name:match("cef") ~= nil
        or lower_name:match("chrome") ~= nil
        or lower_name:match("launcher") ~= nil
        or lower_name:match("prelauncher") ~= nil
        or lower_name:match("dowser") ~= nil
        or lower_name:match("easyanticheat") ~= nil
        or lower_name:match("eac_") ~= nil
        or lower_name:match("battleye") ~= nil
        or lower_name:match("helper") ~= nil
        or lower_name:match("service") ~= nil
        or lower_name:match("benchmark") ~= nil
        or lower_name:match("prereq") ~= nil
        or lower_name:match("redist") ~= nil
end

local function compute_title_acronyms(title)
    local clean = detection_clean_game_title(title or "")
    local words = {}
    for word in clean:gmatch("%w+") do
        table.insert(words, word:lower())
    end
    if #words == 0 then return {} end
    local full_initials = ""
    local no_articles = ""
    for _, w in ipairs(words) do
        local c = w:sub(1, 1)
        full_initials = full_initials .. c
        if w ~= "the" and w ~= "a" and w ~= "an" and w ~= "of" and w ~= "and" then
            no_articles = no_articles .. c
        end
    end
    local results = {}
    if full_initials ~= "" then results[full_initials] = true end
    if no_articles ~= "" then results[no_articles] = true end
    if full_initials:match("i+$") then
        results[full_initials:gsub("i+$", "")] = true
    end
    return results
end

function M.find_tracking_executable(exe_path, start_dir, shortcut_title)
    local selected = detection_clean_path(exe_path)
    if selected == "" then return nil, nil end
    local persistent_launcher, persistent_start, persistent_auto = find_persistent_launcher_override(
        selected, start_dir, shortcut_title)
    if persistent_launcher then
        return persistent_launcher, persistent_start, persistent_auto or true
    end
    if should_preserve_selected_launcher(selected, shortcut_title) then
        return nil, nil
    end
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
    local title_stem_norm = detection_normalize(detection_clean_game_title(shortcut_title or "")):gsub("%s+", "")
    local acronyms = compute_title_acronyms(shortcut_title or "")
    local root_stem_norm = detection_normalize(detection_game_exe_hint(detection_basename(root))):gsub("%s+", "")

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

    -- Fast-path 3: Check standard game binaries when a launcher or bridge exe was selected
    local is_launcher_bridge = lower_selected:match("launcher") ~= nil
        or lower_selected:match("bootstrapper") ~= nil
        or lower_selected:match("bootstrap") ~= nil
        or lower_selected:match("start%.exe$") ~= nil
        or lower_selected:match("play%.exe$") ~= nil
        or lower_selected:match("launch%.exe$") ~= nil
        or lower_selected:match("prelauncher") ~= nil
        or lower_selected:match("dowser") ~= nil
        or lower_selected:match("easyanticheat") ~= nil
        or lower_selected:match("eac_") ~= nil
        or lower_selected:match("gamelauncher") ~= nil
        or lower_selected:match("redprelauncher") ~= nil
        or lower_selected:match("wrapper") ~= nil
        or is_ignored_executable(detection_basename(selected):lower())

    local search_roots = { root }
    local parent_root = fs.parent_path(root)
    if parent_root and parent_root ~= "" and fs.exists(parent_root) and parent_root ~= root then
        table.insert(search_roots, parent_root)
    end

    local common_subdirs = {}
    local seen_subdirs = {}
    for _, base_dir in ipairs(search_roots) do
        local list = {
            base_dir,
            fs.join(base_dir, "DiscContentPC"),
            fs.join(base_dir, "Binaries", "Win64"),
            fs.join(base_dir, "Binaries", "Win32"),
            fs.join(base_dir, "Binaries"),
            fs.join(base_dir, "Engine", "Binaries", "Win64"),
            fs.join(base_dir, "Engine", "Binaries", "Win32"),
            fs.join(base_dir, "bin", "x64"),
            fs.join(base_dir, "bin", "win64"),
            fs.join(base_dir, "bin", "Win64"),
            fs.join(base_dir, "bin", "x86"),
            fs.join(base_dir, "bin", "win32"),
            fs.join(base_dir, "bin", "retail"),
            fs.join(base_dir, "bin", "Win64_Master"),
            fs.join(base_dir, "bin"),
            fs.join(base_dir, "x64"),
            fs.join(base_dir, "x86"),
            fs.join(base_dir, "game"),
            fs.join(base_dir, "Game"),
            fs.join(base_dir, "retail"),
            fs.join(base_dir, "Retail"),
            fs.join(base_dir, "build"),
            fs.join(base_dir, "main"),
            fs.join(base_dir, "runtime"),
            fs.join(base_dir, "app"),
            fs.join(base_dir, "pc"),
            fs.join(base_dir, "PC"),
        }
        for _, sub in ipairs(list) do
            local key = sub:lower()
            if not seen_subdirs[key] then
                seen_subdirs[key] = true
                table.insert(common_subdirs, sub)
            end
        end
    end

    local function score_candidate_exe(name, path)
        local lower_name = name:lower()
        if not lower_name:match("%.exe$") or is_ignored_executable(lower_name) or path:lower() == lower_selected then
            return 0
        end
        local cand_raw = detection_stem(name)
        local cand_stem = detection_normalize(detection_game_exe_hint(name)):gsub("%s+", "")
        local score = 30
        if lower_name:match("[%s_%-]win%d%d[%s_%-]shipping%.exe$") then score = score + 110 end
        if title_stem_norm ~= "" and cand_stem == title_stem_norm then score = score + 100
        elseif acronyms[cand_stem] or acronyms[cand_raw:lower()] then score = score + 95
        elseif KNOWN_TITLE_ALIASES[cand_stem] or KNOWN_TITLE_ALIASES[cand_raw:lower()] then score = score + 90
        elseif root_stem_norm ~= "" and cand_stem == root_stem_norm then score = score + 70
        elseif selected_stem_norm ~= "" and cand_stem == selected_stem_norm then score = score + 60 end
        if lower_name:match("x64") or lower_name:match("win64") then score = score + 15 end
        if not lower_name:match("[%-_][a-z]$") then score = score + 10 end
        if lower_name:match("game") or lower_name:match("shipping") then score = score + 20 end
        return score
    end

    local bridge_candidates = {}
    for _, subdir in ipairs(common_subdirs) do
        if fs.exists(subdir) then
            local ok_list, entries = pcall(fs.list, subdir)
            if ok_list and type(entries) == "table" then
                for _, entry in ipairs(entries) do
                    if not entry.is_directory then
                        local name = tostring(entry.name or detection_basename(entry.path or ""))
                        local path = tostring(entry.path or "")
                        if path == "" then path = fs.join(subdir, name) end
                        local score = score_candidate_exe(name, path)
                        if score >= 50 then
                            table.insert(bridge_candidates, { path = path, score = score })
                        end
                    end
                end
            end
        end
    end

    if #bridge_candidates > 0 then
        table.sort(bridge_candidates, function(a, b) return a.score > b.score end)
        if bridge_candidates[1] and (is_launcher_bridge or bridge_candidates[1].score >= 80) then
            return bridge_candidates[1].path, fs.parent_path(bridge_candidates[1].path)
        end
    end

    -- Targeted shallow fallback walk (max depth 3, max 150 entries, skip heavy asset folders)
    local candidates = {}
    local visited = 0
    local visited_dirs = {}
    local function walk(directory, depth)
        if depth > 3 or visited >= 150 or not directory or directory == "" then return end
        local dir_key = directory:lower()
        if visited_dirs[dir_key] then return end
        visited_dirs[dir_key] = true
        local ok_list, entries = pcall(function() return fs.list(directory) end)
        if not ok_list or type(entries) ~= "table" then return end
        for _, entry in ipairs(entries) do
            if visited >= 150 then break end
            visited = visited + 1
            local name = tostring(entry.name or detection_basename(entry.path or ""))
            local path = tostring(entry.path or "")
            if path == "" then path = fs.join(directory, name) end
            if entry.is_directory then
                if not skipped_directories[name:lower()] then walk(path, depth + 1) end
            else
                local score = score_candidate_exe(name, path)
                if score >= 50 then
                    table.insert(candidates, { path = path, score = score })
                end
            end
        end
    end
    for _, base_dir in ipairs(search_roots) do
        walk(base_dir, 0)
    end

    table.sort(candidates, function(a, b) return a.score > b.score end)
    if candidates[1] and candidates[1].score >= 50 then
        return candidates[1].path, fs.parent_path(candidates[1].path)
    end
    return nil, nil
end

return M
end
