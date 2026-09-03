return function(deps)
local http = deps.http
local cjson = deps.cjson
local icon_files = deps.artwork_icon
local USER_AGENT = deps.user_agent or "NativeGameLink-for-Steam/2.0.0"
local M = {}

local function encode_image(body)
    if type(body) ~= "string" or #body <= 100 or #body > 12 * 1024 * 1024 then return nil, nil end
    local mime = nil
    if body:byte(1) == 137 and body:sub(2, 4) == "PNG" then mime = "image/png"
    elseif body:byte(1) == 255 and body:byte(2) == 216 then mime = "image/jpeg"
    elseif body:sub(1, 4) == "RIFF" and body:sub(9, 12) == "WEBP" then mime = "image/webp" end
    if not mime then return nil, nil end
    return mime, icon_files.encode_base64(body)
end

function M.read_local(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then return cjson.encode({ ok = false, error = "invalid_request" }) end
    local path = tostring(request.path or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if path == "" or #path > 4096 or path:find("%z") or path:find("[\r\n]") then
        return cjson.encode({ ok = false, error = "invalid_path" })
    end
    local file = io.open(path, "rb")
    if not file then file = io.open(path:gsub("\\", "/"), "rb") end
    if not file then return cjson.encode({ ok = false, error = "open_failed" }) end
    local body = file:read("*a")
    file:close()
    local mime, data = encode_image(body)
    if not mime then return cjson.encode({ ok = false, error = "unsupported_image" }) end
    return cjson.encode({ ok = true, mime = mime, data_base64 = data })
end

local function trusted_download_url(value)
    local url = tostring(value or "")
    local host = url:match("^https://([^/%?#]+)")
    host = host and host:lower():gsub(":%d+$", "") or ""
    if host == "steamgriddb.com" or host:match("^[a-z0-9-]+%.steamgriddb%.com$")
        or host == "steamstatic.com" or host:match("^[a-z0-9.-]+%.steamstatic%.com$")
        or host == "steampowered.com" or host:match("^[a-z0-9.-]+%.steampowered%.com$") then
        return url
    end
    return ""
end

function M.fetch_remote(request_json)
    local ok_request, request = pcall(cjson.decode, tostring(request_json or ""))
    if not ok_request or type(request) ~= "table" then return cjson.encode({ ok = false, error = "invalid_request" }) end
    local url = trusted_download_url(request.url)
    if url == "" then return cjson.encode({ ok = false, error = "untrusted_url" }) end
    local ok_http, response = pcall(http.get, url, {
        headers = { ["Accept"] = "image/avif,image/webp,image/png,image/jpeg,*/*", ["User-Agent"] = USER_AGENT },
        timeout = 15,
    })
    if not ok_http or not response then return cjson.encode({ ok = false, error = "network_error" }) end
    local status = tonumber(response.status) or 0
    local body = response.body
    if status ~= 200 then return cjson.encode({ ok = false, error = "http_error", status = status }) end
    local mime, data = encode_image(body)
    if not mime then return cjson.encode({ ok = false, error = "unsupported_image" }) end
    return cjson.encode({ ok = true, mime = mime, data_base64 = data })
end

return M
end
