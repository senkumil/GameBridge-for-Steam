return function(_deps)
local M = {}

function M.trim(value)
    return tostring(value or ""):match("^%s*(.-)%s*$") or ""
end

function M.url_encode(value)
    return tostring(value or ""):gsub("\n", "\r\n"):gsub("([^%w%-_%.~])", function(char)
        return string.format("%%%02X", string.byte(char))
    end)
end

function M.html_unescape(value)
    local s = tostring(value or "")
    return (s:gsub("&quot;", '"'):gsub("&#39;", "'"):gsub("&lt;", "<"):gsub("&gt;", ">")
        :gsub("&nbsp;", " "):gsub("&amp;", "&"))
end

function M.strip_html(value)
    local s = tostring(value or ""):gsub("<br%s*/?>", "\n"):gsub("<[^>]+>", "")
    return M.trim(M.html_unescape(s))
end

function M.safe_language(value)
    local lang = tostring(value or "english"):gsub("[^%w_-]", "")
    return lang ~= "" and lang or "english"
end

function M.normalize_appid_and_language(first, second)
    local appid = tostring(first or "")
    local language = tostring(second or "english")
    if not appid:match("^%d+$") and language:match("^%d+$") then
        appid, language = language, appid
    end
    return appid, M.safe_language(language)
end

function M.decode_json(cjson, raw)
    local ok, value = pcall(cjson.decode, tostring(raw or ""))
    if ok then return value, nil end
    return nil, tostring(value)
end

return M
end
