return function(deps)
local logger = deps.logger
local M = {}

local ffi_ok, ffi = pcall(require, "ffi")
local kernel32 = nil

if ffi_ok and ffi then
    local def_ok = pcall(function()
        ffi.cdef[[
        typedef unsigned long DWORD;
        typedef int BOOL;
        typedef void* HANDLE;
        typedef const char* LPCSTR;
        typedef char* LPSTR;

        typedef struct _SECURITY_ATTRIBUTES {
            DWORD nLength;
            void* lpSecurityDescriptor;
            BOOL bInheritHandle;
        } SECURITY_ATTRIBUTES, *LPSECURITY_ATTRIBUTES;

        typedef struct _STARTUPINFOA {
            DWORD cb;
            LPSTR lpReserved;
            LPSTR lpDesktop;
            LPSTR lpTitle;
            DWORD dwX;
            DWORD dwY;
            DWORD dwXSize;
            DWORD dwYSize;
            DWORD dwXCountChars;
            DWORD dwYCountChars;
            DWORD dwFillAttribute;
            DWORD dwFlags;
            short wShowWindow;
            short cbReserved2;
            void* lpReserved2;
            HANDLE hStdInput;
            HANDLE hStdOutput;
            HANDLE hStdError;
        } STARTUPINFOA, *LPSTARTUPINFOA;

        typedef struct _PROCESS_INFORMATION {
            HANDLE hProcess;
            HANDLE hThread;
            DWORD dwProcessId;
            DWORD dwThreadId;
        } PROCESS_INFORMATION, *LPPROCESS_INFORMATION;

        BOOL CreateProcessA(
            LPCSTR lpApplicationName,
            LPSTR lpCommandLine,
            LPSECURITY_ATTRIBUTES lpProcessAttributes,
            LPSECURITY_ATTRIBUTES lpThreadAttributes,
            BOOL bInheritHandles,
            DWORD dwCreationFlags,
            void* lpEnvironment,
            LPCSTR lpCurrentDirectory,
            LPSTARTUPINFOA lpStartupInfo,
            LPPROCESS_INFORMATION lpProcessInformation
        );

        DWORD WaitForSingleObject(HANDLE hHandle, DWORD dwMilliseconds);
        BOOL CloseHandle(HANDLE hObject);
        BOOL GetExitCodeProcess(HANDLE hProcess, DWORD* lpExitCode);
        ]]
        kernel32 = ffi.load("kernel32")
    end)
    if not def_ok then
        kernel32 = nil
    end
end

local CREATE_NO_WINDOW = 0x08000000
local STARTF_USESHOWWINDOW = 0x00000001
local SW_HIDE = 0

function M.run_silent(cmd_line, wait_timeout_ms)
    if kernel32 and ffi then
        local si = ffi.new("STARTUPINFOA")
        si.cb = ffi.sizeof("STARTUPINFOA")
        si.dwFlags = STARTF_USESHOWWINDOW
        si.wShowWindow = SW_HIDE

        local pi = ffi.new("PROCESS_INFORMATION")
        local cmd_buf = ffi.new("char[?]", #cmd_line + 1)
        ffi.copy(cmd_buf, cmd_line)

        local ok = kernel32.CreateProcessA(
            nil,
            cmd_buf,
            nil,
            nil,
            0,
            CREATE_NO_WINDOW,
            nil,
            nil,
            si,
            pi
        )

        if ok == 0 then
            return false, "CreateProcess failed"
        end

        local exit_code = 0
        if wait_timeout_ms and wait_timeout_ms > 0 then
            kernel32.WaitForSingleObject(pi.hProcess, wait_timeout_ms)
            local code_ptr = ffi.new("DWORD[1]")
            if kernel32.GetExitCodeProcess(pi.hProcess, code_ptr) ~= 0 then
                exit_code = tonumber(code_ptr[0])
            end
        end

        kernel32.CloseHandle(pi.hThread)
        kernel32.CloseHandle(pi.hProcess)
        return true, exit_code
    else
        -- Fallback if FFI is somehow unavailable
        pcall(os.execute, cmd_line)
        return true, 0
    end
end

return M
end
