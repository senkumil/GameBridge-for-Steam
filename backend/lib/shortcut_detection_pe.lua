-- PE metadata inspection and product name extraction for Windows executables.
return function(deps)
local fs = deps.fs
local detection_text = deps.shortcut_detection_text or {}
local detection_normalize = detection_text.normalize or function(v) return tostring(v or ""):lower() end
local DETECTION_GENERIC_WORDS = detection_text.generic_words or {}
local DETECTION_GENERIC_EXES = detection_text.generic_exes or {}

local M = {}

local ffi_ok, ffi = pcall(require, "ffi")
local version_dll = nil

if ffi_ok and ffi then
    pcall(function()
        ffi.cdef[[
            typedef unsigned long DWORD;
            typedef int BOOL;
            DWORD GetFileVersionInfoSizeA(const char* lptstrFilename, DWORD* lpdwHandle);
            BOOL GetFileVersionInfoA(const char* lptstrFilename, DWORD dwHandle, DWORD dwLen, void* lpData);
            BOOL VerQueryValueA(const void* pBlock, const char* lpSubBlock, void** lplpBuffer, unsigned int* puLen);
        ]]
        version_dll = ffi.load("version.dll")
    end)
end

function M.is_generic_product_name(value)
    if not value or value == "" then return true end
    local norm = detection_normalize(value)
    if #norm < 2 then return true end
    if DETECTION_GENERIC_WORDS[norm] or DETECTION_GENERIC_EXES[norm] then return true end
    if norm:match("^unreal") or norm:match("^unity") or norm:match("^cryengine")
        or norm:match("^redengine") or norm:match("^godot") or norm:match("^microsoft")
        or norm:match("^windows") or norm:match("^steam") or norm:match("^epic games")
        or norm:match("^game launcher") or norm:match("^crash handler")
        or norm == "game" or norm == "launcher" or norm == "application"
        or norm == "shipping" or norm == "executable" or norm == "bootstrapper"
        or norm == "start" or norm == "unins000" or norm == "setup" or norm == "installer" then
        return true
    end
    return false
end

function M.read_pe_metadata(exe_path)
    if not exe_path or exe_path == "" or not version_dll or not ffi then return nil, nil end
    local ok_exists, exists = pcall(fs.exists, exe_path)
    if not ok_exists or not exists then return nil, nil end

    local ok, prod, desc = pcall(function()
        local handle = ffi.new("DWORD[1]")
        local size = version_dll.GetFileVersionInfoSizeA(exe_path, handle)
        if size <= 0 then return nil, nil end
        local buf = ffi.new("char[?]", size)
        if version_dll.GetFileVersionInfoA(exe_path, 0, size, buf) == 0 then return nil, nil end
        local function query_str(sub_block)
            local ptr = ffi.new("void*[1]")
            local len = ffi.new("unsigned int[1]")
            if version_dll.VerQueryValueA(buf, sub_block, ptr, len) ~= 0 and len[0] > 1 and ptr[0] ~= nil then
                return ffi.string(ptr[0])
            end
            return nil
        end
        local p = nil
        local d = nil
        local sub_blocks = {}
        local trans_ptr = ffi.new("void*[1]")
        local trans_len = ffi.new("unsigned int[1]")
        if version_dll.VerQueryValueA(buf, "\\VarFileInfo\\Translation", trans_ptr, trans_len) ~= 0 and trans_len[0] >= 4 and trans_ptr[0] ~= nil then
            local trans = ffi.cast("unsigned short*", trans_ptr[0])
            local count = math.min(math.floor(trans_len[0] / 4), 8)
            for i = 0, count - 1 do
                local hex = string.format("%04x%04x", trans[i * 2], trans[i * 2 + 1])
                table.insert(sub_blocks, hex)
            end
        end
        for _, hex in ipairs({ "040904b0", "040904e4", "000004b0", "04090000", "080904b0" }) do
            table.insert(sub_blocks, hex)
        end
        for _, hex in ipairs(sub_blocks) do
            if not p then p = query_str("\\StringFileInfo\\" .. hex .. "\\ProductName") end
            if not d then d = query_str("\\StringFileInfo\\" .. hex .. "\\FileDescription") end
            if p and d then break end
        end
        return p, d
    end)
    if ok and (prod or desc) then
        return prod, desc
    end
    return nil, nil
end

return M
end
