using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace SteamAchievementSync
{
    public class Program
    {
        static string ResultFilePath;

        static string[] ConfigureResultFile(string[] args)
        {
            var remaining = new List<string>();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--result-file" && i + 1 < args.Length)
                {
                    ResultFilePath = args[++i];
                    continue;
                }
                remaining.Add(args[i]);
            }
            return remaining.ToArray();
        }

        static void WriteOutput(string text)
        {
            if (!string.IsNullOrEmpty(ResultFilePath))
            {
                try
                {
                    File.WriteAllText(ResultFilePath, text, new UTF8Encoding(false));
                }
                catch {}
            }
            try
            {
                byte[] bytes = Encoding.UTF8.GetBytes(text + "\r\n");
                var stdout = Console.OpenStandardOutput();
                stdout.Write(bytes, 0, bytes.Length);
                stdout.Flush();
                return;
            }
            catch {}
            try { Console.WriteLine(text); } catch {}
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
        static extern bool SetDllDirectoryA(string lpPathName);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
        static extern IntPtr LoadLibraryA(string lpLibFileName);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
        static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate IntPtr CreateInterfaceFn(string version, ref int returnCode);

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        struct CallbackMsg
        {
            public int m_hSteamUser;
            public int m_iCallback;
            public IntPtr m_pubParam;
            public int m_cubParam;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        struct UserStatsReceived_t
        {
            public ulong m_nGameID;
            public int m_eResult;
            public ulong m_steamIDUser;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 8)]
        struct UserStatsStored_t
        {
            public ulong m_nGameID;
            public int m_eResult;
        }

        [DllImport("steamclient64.dll", EntryPoint = "Steam_BGetCallback", CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        static extern bool Steam_BGetCallback64(int hPipe, ref CallbackMsg pCallbackMsg);

        [DllImport("steamclient64.dll", EntryPoint = "Steam_FreeLastCallback", CallingConvention = CallingConvention.Cdecl)]
        static extern void Steam_FreeLastCallback64(int hPipe);

        [DllImport("steamclient.dll", EntryPoint = "Steam_BGetCallback", CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        static extern bool Steam_BGetCallback32(int hPipe, ref CallbackMsg pCallbackMsg);

        [DllImport("steamclient.dll", EntryPoint = "Steam_FreeLastCallback", CallingConvention = CallingConvention.Cdecl)]
        static extern void Steam_FreeLastCallback32(int hPipe);

        static bool Steam_BGetCallback(int hPipe, ref CallbackMsg pCallbackMsg)
        {
            return IntPtr.Size == 8 ? Steam_BGetCallback64(hPipe, ref pCallbackMsg) : Steam_BGetCallback32(hPipe, ref pCallbackMsg);
        }

        static void Steam_FreeLastCallback(int hPipe)
        {
            if (IntPtr.Size == 8) Steam_FreeLastCallback64(hPipe);
            else Steam_FreeLastCallback32(hPipe);
        }

        static T GetDelegate<T>(IntPtr iface, int slot) where T : class
        {
            if (iface == IntPtr.Zero) return null;
            IntPtr vtable = Marshal.ReadIntPtr(iface);
            IntPtr methodPtr = Marshal.ReadIntPtr(vtable, slot * IntPtr.Size);
            return Marshal.GetDelegateForFunctionPointer(methodPtr, typeof(T)) as T;
        }

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate int CreateSteamPipeFn(IntPtr thisPtr);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate bool ReleaseSteamPipeFn(IntPtr thisPtr, int hPipe);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate int ConnectToGlobalUserFn(IntPtr thisPtr, int hPipe);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate void ReleaseUserFn(IntPtr thisPtr, int hPipe, int hUser);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate IntPtr GetISteamUserStatsFn(IntPtr thisPtr, int hUser, int hPipe, [MarshalAs(UnmanagedType.LPStr)] string version);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate bool RequestCurrentStatsFn(IntPtr thisPtr);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate uint GetNumAchievementsFn(IntPtr thisPtr);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate IntPtr GetAchievementNameFn(IntPtr thisPtr, uint iAch);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate bool GetAchievementAndUnlockTimeFn(IntPtr thisPtr, [MarshalAs(UnmanagedType.LPStr)] string name, [MarshalAs(UnmanagedType.I1)] ref bool achieved, ref uint unlockTime);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate bool SetAchievementFn(IntPtr thisPtr, [MarshalAs(UnmanagedType.LPStr)] string name);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate bool ClearAchievementFn(IntPtr thisPtr, [MarshalAs(UnmanagedType.LPStr)] string name);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        delegate bool StoreStatsFn(IntPtr thisPtr);

        static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n");
        }

        public static void Main(string[] args)
        {
            try
            {
                args = ConfigureResultFile(args);
                if (args.Length == 0)
                {
                    WriteOutput("{\"ok\":false,\"error\":\"missing_arguments\"}");
                    return;
                }

                string command = args[0].ToLowerInvariant();
                if (command != "status" && command != "sync")
                {
                    WriteOutput("{\"ok\":false,\"error\":\"unknown_command\"}");
                    return;
                }

                ulong appId = 0;
                if (args.Length < 2 || !ulong.TryParse(args[1], out appId) || appId == 0)
                {
                    WriteOutput("{\"ok\":false,\"error\":\"invalid_appid\"}");
                    return;
                }

                Environment.SetEnvironmentVariable("SteamAppId", appId.ToString());
                Environment.SetEnvironmentVariable("SteamGameId", appId.ToString());

                string steamPath = Environment.GetEnvironmentVariable("SteamPath");
                if (string.IsNullOrEmpty(steamPath) || !Directory.Exists(steamPath)) steamPath = @"C:\Program Files (x86)\Steam";
                SetDllDirectoryA(steamPath);
                string dllName = IntPtr.Size == 8 ? "steamclient64.dll" : "steamclient.dll";
                string dllPath = Path.Combine(steamPath, dllName);

                IntPtr hModule = LoadLibraryA(dllPath);
                if (hModule == IntPtr.Zero)
            {
                WriteOutput("{\"ok\":false,\"error\":\"steam_client_dll_not_found\"}");
                return;
            }

                IntPtr proc = GetProcAddress(hModule, "CreateInterface");
                if (proc == IntPtr.Zero)
            {
                WriteOutput("{\"ok\":false,\"error\":\"create_interface_not_found\"}");
                return;
            }

                int retCode = 0;
                var createInterface = (CreateInterfaceFn)Marshal.GetDelegateForFunctionPointer(proc, typeof(CreateInterfaceFn));
                IntPtr steamClient = createInterface("SteamClient020", ref retCode);
                if (steamClient == IntPtr.Zero)
            {
                WriteOutput("{\"ok\":false,\"error\":\"steamclient020_not_available\"}");
                return;
            }

                var createSteamPipe = GetDelegate<CreateSteamPipeFn>(steamClient, 0);
                var releaseSteamPipe = GetDelegate<ReleaseSteamPipeFn>(steamClient, 1);
                var connectToGlobalUser = GetDelegate<ConnectToGlobalUserFn>(steamClient, 2);
                var releaseUser = GetDelegate<ReleaseUserFn>(steamClient, 4);
                var getUserStats = GetDelegate<GetISteamUserStatsFn>(steamClient, 13);

                int pipe = createSteamPipe(steamClient);
                if (pipe == 0)
            {
                WriteOutput("{\"ok\":false,\"error\":\"steam_not_running\"}");
                return;
            }

                int user = connectToGlobalUser(steamClient, pipe);
                if (user == 0)
            {
                releaseSteamPipe(steamClient, pipe);
                WriteOutput("{\"ok\":false,\"error\":\"steam_user_not_logged_in\"}");
                return;
            }

                IntPtr userStats = getUserStats(steamClient, user, pipe, "STEAMUSERSTATS_INTERFACE_VERSION012");
                if (userStats == IntPtr.Zero)
            {
                releaseUser(steamClient, pipe, user);
                releaseSteamPipe(steamClient, pipe);
                WriteOutput("{\"ok\":false,\"error\":\"steam_userstats_unavailable\"}");
                return;
            }

                var reqCurrentStats = GetDelegate<RequestCurrentStatsFn>(userStats, 0);
                if (reqCurrentStats == null || !reqCurrentStats(userStats))
                {
                    releaseUser(steamClient, pipe, user);
                    releaseSteamPipe(steamClient, pipe);
                    WriteOutput("{\"ok\":false,\"error\":\"request_current_stats_failed\"}");
                    return;
                }

                bool received = false;
                int statsResult = 0;
                var start = DateTime.UtcNow;
                while ((DateTime.UtcNow - start).TotalSeconds < 8)
            {
                CallbackMsg msg = new CallbackMsg();
                while (Steam_BGetCallback(pipe, ref msg))
                {
                    if (msg.m_iCallback == 1101) // UserStatsReceived_t
                    {
                        var data = (UserStatsReceived_t)Marshal.PtrToStructure(msg.m_pubParam, typeof(UserStatsReceived_t));
                        if (data.m_nGameID == appId)
                        {
                            statsResult = data.m_eResult;
                            received = true;
                        }
                    }
                    Steam_FreeLastCallback(pipe);
                }
                if (received) break;
                Thread.Sleep(30);
            }

                if (!received || statsResult != 1)
            {
                releaseUser(steamClient, pipe, user);
                releaseSteamPipe(steamClient, pipe);
                WriteOutput("{\"ok\":false,\"error\":\"game_stats_not_owned_or_unavailable\",\"result\":" + statsResult + "}");
                return;
            }

                if (command == "status")
            {
                var getNumAch = GetDelegate<GetNumAchievementsFn>(userStats, 14);
                var getAchName = GetDelegate<GetAchievementNameFn>(userStats, 15);
                var getAchTime = GetDelegate<GetAchievementAndUnlockTimeFn>(userStats, 9);

                uint totalAchs = getNumAch != null ? getNumAch(userStats) : 0;
                var sb = new StringBuilder();
                sb.Append("{\"ok\":true,\"appid\":" + appId + ",\"total\":" + totalAchs + ",\"achievements\":{");

                for (uint i = 0; i < totalAchs; i++)
                {
                    IntPtr namePtr = getAchName(userStats, i);
                    if (namePtr == IntPtr.Zero) continue;
                    string name = Marshal.PtrToStringAnsi(namePtr);
                    if (string.IsNullOrEmpty(name)) continue;

                    bool achieved = false;
                    uint unlockTime = 0;
                    if (getAchTime != null) getAchTime(userStats, name, ref achieved, ref unlockTime);

                    if (i > 0) sb.Append(",");
                    sb.Append("\"" + EscapeJson(name) + "\":{\"achieved\":" + (achieved ? "true" : "false") + ",\"unlock_time\":" + unlockTime + "}");
                }

                sb.Append("}}");
                WriteOutput(sb.ToString());
            }
                else if (command == "sync")
            {
                var setAch = GetDelegate<SetAchievementFn>(userStats, 7);
                var clearAch = GetDelegate<ClearAchievementFn>(userStats, 8);
                var storeStats = GetDelegate<StoreStatsFn>(userStats, 10);

                var unlockList = new List<string>();
                var lockList = new List<string>();

                for (int i = 2; i < args.Length; i++)
                {
                    string arg = args[i];
                    if (arg.StartsWith("+"))
                    {
                        unlockList.Add(arg.Substring(1).Trim());
                    }
                    else if (arg.StartsWith("-"))
                    {
                        lockList.Add(arg.Substring(1).Trim());
                    }
                    else
                    {
                        unlockList.Add(arg.Trim());
                    }
                }

                int unlockedCount = 0;
                int lockedCount = 0;

                foreach (var ach in unlockList)
                {
                    if (string.IsNullOrEmpty(ach)) continue;
                    if (setAch != null && setAch(userStats, ach)) unlockedCount++;
                }

                foreach (var ach in lockList)
                {
                    if (string.IsNullOrEmpty(ach)) continue;
                    if (clearAch != null && clearAch(userStats, ach)) lockedCount++;
                }

                bool stored = false;
                if (storeStats != null)
                {
                    stored = storeStats(userStats);
                }

                // Poll for UserStatsStored_t callback (1102)
                bool storedCallback = false;
                var storeStart = DateTime.UtcNow;
                while ((DateTime.UtcNow - storeStart).TotalSeconds < 4)
                {
                    CallbackMsg msg = new CallbackMsg();
                    while (Steam_BGetCallback(pipe, ref msg))
                    {
                        if (msg.m_iCallback == 1102) // UserStatsStored_t
                        {
                            var data = (UserStatsStored_t)Marshal.PtrToStructure(msg.m_pubParam, typeof(UserStatsStored_t));
                            if (data.m_nGameID == appId && data.m_eResult == 1)
                            {
                                storedCallback = true;
                            }
                        }
                        Steam_FreeLastCallback(pipe);
                    }
                    if (storedCallback) break;
                    Thread.Sleep(30);
                }

                    bool committed = stored && storedCallback;
                    WriteOutput("{\"ok\":" + (committed ? "true" : "false") + ",\"appid\":" + appId + ",\"unlocked_count\":" + unlockedCount + ",\"locked_count\":" + lockedCount + ",\"stored\":" + (stored ? "true" : "false") + ",\"callback_confirmed\":" + (storedCallback ? "true" : "false") + (committed ? "" : ",\"error\":\"store_stats_not_confirmed\"") + "}");
                }

                releaseUser(steamClient, pipe, user);
                releaseSteamPipe(steamClient, pipe);
            }
            catch (Exception ex)
            {
                WriteOutput("{\"ok\":false,\"error\":\"helper_exception\",\"detail\":\"" + EscapeJson(ex.GetType().Name) + "\"}");
            }
        }
    }
}
