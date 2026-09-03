-- Text/path normalization and fuzzy title comparison for shortcut detection.
-- Keeping this pure makes the expensive filesystem/network detector easier to
-- profile and lets fixture tests exercise identity rules independently.
return function(_deps)
local M = {}

function M.trim(value)
    return tostring(value or ""):match("^%s*(.-)%s*$") or ""
end

function M.clean_path(value)
    local path = M.trim(value)
    local quoted = path:match('^"(.-)"$')
    if quoted then path = quoted end
    return path:gsub("/", "\\")
end

function M.basename(value)
    local path = M.clean_path(value):gsub("[\\/]+$", "")
    return path:match("([^\\/]+)$") or path
end

function M.stem(value)
    return M.basename(value):gsub("%.[^%.]+$", "")
end

function M.game_exe_hint(value)
    local stem = M.basename(value)
    local lower = stem:lower()
    while lower:match("%.lnk$") or lower:match("%.url$") do
        stem = M.stem(stem)
        lower = stem:lower()
    end
    if lower:match("%.exe$") or lower:match("%.com$") or lower:match("%.bat$")
        or lower:match("%.cmd$") or lower:match("%.appimage$") then
        stem = M.stem(stem)
    end
    stem = stem:gsub("[%s_%-]+[Ww][Ii][Nn]64[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    stem = stem:gsub("[%s_%-]+[Ww][Ii][Nn]32[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    stem = stem:gsub("[%s_%-]+[Ll][Ii][Nn][Uu][Xx][%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]$", "")
    return stem
end

local function strip_accents(value)
    local accents = {
        ["á"] = "a", ["à"] = "a", ["ä"] = "a", ["â"] = "a", ["ã"] = "a", ["å"] = "a",
        ["é"] = "e", ["è"] = "e", ["ë"] = "e", ["ê"] = "e",
        ["í"] = "i", ["ì"] = "i", ["ï"] = "i", ["î"] = "i",
        ["ó"] = "o", ["ò"] = "o", ["ö"] = "o", ["ô"] = "o", ["õ"] = "o",
        ["ú"] = "u", ["ù"] = "u", ["ü"] = "u", ["û"] = "u", ["ñ"] = "n", ["ç"] = "c",
        ["Á"] = "a", ["À"] = "a", ["Ä"] = "a", ["Â"] = "a", ["É"] = "e", ["È"] = "e",
        ["Ë"] = "e", ["Ê"] = "e", ["Í"] = "i", ["Ì"] = "i", ["Ï"] = "i", ["Î"] = "i",
        ["Ó"] = "o", ["Ò"] = "o", ["Ö"] = "o", ["Ô"] = "o", ["Ú"] = "u", ["Ù"] = "u",
        ["Ü"] = "u", ["Û"] = "u", ["Ñ"] = "n", ["Ç"] = "c",
    }
    local result = tostring(value or "")
    for from, to in pairs(accents) do result = result:gsub(from, to) end
    return result
end

function M.normalize(value)
    local text = strip_accents(value):lower()
    text = text:gsub("™", ""):gsub("®", ""):gsub("©", "")
    text = text:gsub("[’'`´]", ""):gsub("[–—_:|/\\%[%]%(%){}]+", " ")
    text = text:gsub("[^%w]+", " "):gsub("%s+", " ")
    return M.trim(text)
end

function M.clean_game_title(value)
    local text = tostring(value or "")
    text = text:gsub("%b[]", " "):gsub("%b()", " ")
    text = text:gsub("[vV]%d+%.%d+[%d%.]*", " ")
    text = text:gsub("[%s_%-]+[Bb][Uu][Ii][Ll][Dd][%s_%-]+%d+", " ")
    text = text:gsub("[%s_%-]+[Ww][Ii][Nn]%d%d[%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]", " ")
    text = text:gsub("[%s_%-]+[Ll][Ii][Nn][Uu][Xx][%s_%-]+[Ss][Hh][Ii][Pp][Pp][Ii][Nn][Gg]", " ")
    text = text:gsub("[%s_%-]+[Ww][Ii][Nn]%d%d$", ""):gsub("[%s_%-]+[Xx]64$", "")
    text = text:gsub("[%s_%-]+[Xx]86$", ""):gsub("[%s_%-]+[Dd][Xx]11$", "")
    text = text:gsub("[%s_%-]+[Dd][Xx]12$", ""):gsub("[%s_%-]+[Rr][Ee][Pp][Aa][Cc][Kk]", " ")
    return M.trim(text)
end

local function replace_roman(value)
    local text = " " .. M.normalize(value) .. " "
    for roman, number in pairs({ viii = 8, vii = 7, vi = 6, iv = 4, v = 5, iii = 3, ii = 2, ix = 9, x = 10 }) do
        text = text:gsub("%s+" .. roman .. "%s+", " " .. number .. " ")
    end
    return M.trim(text)
end

M.generic_words = {
    launcher = true, launch = true, game = true, start = true, protected = true,
    shipping = true, win64 = true, win32 = true, windows = true, x64 = true,
    x86 = true, dx11 = true, dx12 = true, binary = true, binaries = true,
    games = true, juegos = true, steamapps = true, common = true,
    repack = true, fitgirl = true, dodi = true, gog = true, rune = true,
    unins000 = true, uninstaller = true, uninstall = true, setup = true, installer = true, install = true,
}
M.generic_exes = {
    ["game"] = true, ["launcher"] = true, ["start"] = true,
    ["start protected game"] = true, ["playnite fullscreenapp"] = true,
    ["playnite desktopapp"] = true, ["heroic"] = true, ["epicgameslauncher"] = true,
    ["galaxyclient"] = true, ["retroarch"] = true, ["steam"] = true,
    ["unins000"] = true, ["uninstall"] = true, ["uninstaller"] = true, ["setup"] = true,
}

function M.tokens(value, discard_generic)
    local set, count = {}, 0
    for token in M.normalize(value):gmatch("%S+") do
        if #token > 1 and (not discard_generic or not M.generic_words[token]) and not set[token] then
            set[token], count = true, count + 1
        end
    end
    return set, count
end

local function raw_similarity(left, right)
    local a, ac = M.tokens(left, false)
    local b, bc = M.tokens(right, false)
    if ac == 0 or bc == 0 then return 0 end
    local common = 0
    for token in pairs(a) do if b[token] then common = common + 1 end end
    return (2 * common) / (ac + bc)
end

function M.similarity(left, right)
    return math.max(raw_similarity(left, right), raw_similarity(replace_roman(left), replace_roman(right)))
end

local function raw_compact_similarity(left, right)
    local a, b = M.normalize(left):gsub("%s+", ""), M.normalize(right):gsub("%s+", "")
    if a == "" or b == "" then return 0 end
    if a == b then return 1 end
    local shorter, longer = a, b
    if #shorter > #longer then shorter, longer = longer, shorter end
    if #shorter >= 4 and longer:find(shorter, 1, true) then return math.min(0.95, (#shorter / #longer) + 0.30) end
    return 0
end

function M.compact_similarity(left, right)
    return math.max(raw_compact_similarity(left, right), raw_compact_similarity(replace_roman(left), replace_roman(right)))
end

local OPTIONAL_ACRONYM_WORDS = { part = true, chapter = true, episode = true, edition = true }
local function title_acronym(value, omit_optional_words)
    local pieces = {}
    for token in M.normalize(value):gmatch("%S+") do
        if token:match("^%d+$") or token:match("^[ivxlcdm]+$") then pieces[#pieces + 1] = token
        elseif #token > 0 and (not omit_optional_words or not OPTIONAL_ACRONYM_WORDS[token]) then
            pieces[#pieces + 1] = token:sub(1, 1)
        end
    end
    return table.concat(pieces, "")
end

function M.acronym_similarity(left, right)
    local left_compact = M.normalize(left):gsub("%s+", "")
    local right_compact = M.normalize(right):gsub("%s+", "")
    local function compare(compact, acronym)
        if #compact < 3 or #acronym < 3 then return 0 end
        if compact == acronym then return 1 end
        if acronym:sub(1, #compact) == compact then return 0.96 end
        return 0
    end
    return math.max(
        compare(left_compact, title_acronym(right)), compare(left_compact, title_acronym(right, true)),
        compare(right_compact, title_acronym(left)), compare(right_compact, title_acronym(left, true))
    )
end

return M
end
