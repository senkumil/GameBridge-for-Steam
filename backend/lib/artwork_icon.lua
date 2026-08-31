return function(deps)
local fs = deps.fs
local M, epochs = {}, {}

local chars, lookup = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", {}
for index = 1, #chars do lookup[chars:sub(index, index)] = index - 1 end

function M.decode_base64(data)
    data = tostring(data or ""):gsub("%s", "")
    if data == "" or #data % 4 ~= 0 or data:find("[^A-Za-z0-9%+/%=]") then return nil end
    local output = {}
    for index = 1, #data, 4 do
        local c1, c2 = data:sub(index, index), data:sub(index + 1, index + 1)
        local c3, c4 = data:sub(index + 2, index + 2), data:sub(index + 3, index + 3)
        local a, b = lookup[c1], lookup[c2]
        local c, d = c3 == "=" and 0 or lookup[c3], c4 == "=" and 0 or lookup[c4]
        if not a or not b or c == nil or d == nil then return nil end
        if (c3 == "=" and c4 ~= "=") or ((c3 == "=" or c4 == "=") and index + 3 ~= #data) then return nil end
        local value = a * 262144 + b * 4096 + c * 64 + d
        local first = math.floor(value / 65536) % 256
        if c3 == "=" then output[#output + 1] = string.char(first)
        else
            local second = math.floor(value / 256) % 256
            output[#output + 1] = c4 == "=" and string.char(first, second)
                or string.char(first, second, value % 256)
        end
    end
    return table.concat(output)
end

function M.validate(body, ext)
    if type(body) ~= "string" or #body <= 100 then return false end
    ext = tostring(ext or ""):lower(); if ext == "jpeg" then ext = "jpg" end
    if ext == "png" then
        return body:byte(1) == 137 and body:byte(2) == 80 and body:byte(3) == 78 and body:byte(4) == 71
            and body:byte(5) == 13 and body:byte(6) == 10 and body:byte(7) == 26 and body:byte(8) == 10
    elseif ext == "jpg" then return body:byte(1) == 255 and body:byte(2) == 216
    elseif ext == "ico" then
        return body:byte(1) == 0 and body:byte(2) == 0 and body:byte(3) == 1
            and body:byte(4) == 0 and (body:byte(5) or 0) > 0
    elseif ext == "tga" then
        local image_type, width = body:byte(3) or 0, (body:byte(13) or 0) + (body:byte(14) or 0) * 256
        local height = (body:byte(15) or 0) + (body:byte(16) or 0) * 256
        return (image_type == 1 or image_type == 2 or image_type == 3 or image_type == 9 or image_type == 10 or image_type == 11)
            and width > 0 and height > 0 and width <= 4096 and height <= 4096
    end
    return false
end

function M.write(grid_dir, shortcut_app_id, ext, body)
    ext = tostring(ext or ""):lower(); if ext == "jpeg" then ext = "jpg" end
    if ext ~= "tga" and ext ~= "png" and ext ~= "ico" and ext ~= "jpg" then return nil, "invalid_extension" end
    if not M.validate(body, ext) then return nil, "invalid_image" end
    local filepath, temp_path, backup_path = fs.join(grid_dir, shortcut_app_id .. "_icon." .. ext), nil, nil
    temp_path, backup_path = filepath .. ".tmp", filepath .. ".bak"
    local file = io.open(temp_path, "wb"); if not file then return nil, "open_failed" end
    local wrote, write_error = file:write(body); local closed, close_error = file:close()
    if not wrote or not closed then os.remove(temp_path); return nil, tostring(write_error or close_error or "write_failed") end
    os.remove(backup_path)
    local had_previous = fs.exists(filepath); if had_previous then os.rename(filepath, backup_path) end
    local renamed, rename_error = os.rename(temp_path, filepath)
    if not renamed then
        os.remove(temp_path); if had_previous and fs.exists(backup_path) then os.rename(backup_path, filepath) end
        return nil, tostring(rename_error or "rename_failed")
    end
    os.remove(backup_path)
    for _, old_ext in ipairs({ "tga", "ico", "jpg", "jpeg", "png" }) do
        local old_path = fs.join(grid_dir, shortcut_app_id .. "_icon." .. old_ext)
        if old_path ~= filepath and fs.exists(old_path) then os.remove(old_path) end
    end
    return filepath, nil
end

function M.begin(shortcut_app_id) return tonumber(epochs[tostring(shortcut_app_id)] or 0) end
function M.is_current(shortcut_app_id, epoch) return M.begin(shortcut_app_id) == epoch end
function M.invalidate(shortcut_app_id)
    local key = tostring(shortcut_app_id or ""); epochs[key] = M.begin(key) + 1
end
return M
end
