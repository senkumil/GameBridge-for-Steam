using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace SteamCardFarmer
{
    class Program
    {
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

        const string DefaultEventName = "NativeGameLink_Steam_CardFarmer_StopEvent";

        static void Main(string[] args)
        {
            if (args.Length == 0) return;

            string command = args[0].ToLowerInvariant();
            string eventName = args.Length >= 3 ? args[2] : DefaultEventName;

            if (command == "stop")
            {
                try
                {
                    using (var stopEvent = EventWaitHandle.OpenExisting(eventName))
                    {
                        stopEvent.Set();
                    }
                }
                catch {}
                return;
            }

            if (command != "run" && command != "idle") return;

            ulong appId = 0;
            if (args.Length < 2 || !ulong.TryParse(args[1], out appId) || appId == 0) return;

            EventWaitHandle exitHandle = null;
            bool createdNew = false;
            try
            {
                exitHandle = new EventWaitHandle(false, EventResetMode.ManualReset, eventName, out createdNew);
            }
            catch
            {
                return;
            }

            Environment.SetEnvironmentVariable("SteamAppId", appId.ToString());
            Environment.SetEnvironmentVariable("SteamGameId", appId.ToString());

            string steamPath = Environment.GetEnvironmentVariable("SteamPath");
            if (string.IsNullOrEmpty(steamPath) || !Directory.Exists(steamPath))
            {
                steamPath = @"C:\Program Files (x86)\Steam";
            }
            SetDllDirectoryA(steamPath);
            string dllName = IntPtr.Size == 8 ? "steamclient64.dll" : "steamclient.dll";
            string dllPath = Path.Combine(steamPath, dllName);

            IntPtr hModule = LoadLibraryA(dllPath);
            if (hModule == IntPtr.Zero) return;

            IntPtr proc = GetProcAddress(hModule, "CreateInterface");
            if (proc == IntPtr.Zero) return;

            int retCode = 0;
            var createInterface = (CreateInterfaceFn)Marshal.GetDelegateForFunctionPointer(proc, typeof(CreateInterfaceFn));
            IntPtr steamClient = createInterface("SteamClient020", ref retCode);
            if (steamClient == IntPtr.Zero) return;

            var createSteamPipe = GetDelegate<CreateSteamPipeFn>(steamClient, 0);
            var releaseSteamPipe = GetDelegate<ReleaseSteamPipeFn>(steamClient, 1);
            var connectToGlobalUser = GetDelegate<ConnectToGlobalUserFn>(steamClient, 2);
            var releaseUser = GetDelegate<ReleaseUserFn>(steamClient, 4);
            var getUserStats = GetDelegate<GetISteamUserStatsFn>(steamClient, 13);

            int pipe = createSteamPipe(steamClient);
            if (pipe == 0) return;

            int user = connectToGlobalUser(steamClient, pipe);
            if (user == 0)
            {
                releaseSteamPipe(steamClient, pipe);
                return;
            }

            IntPtr userStats = getUserStats(steamClient, user, pipe, "STEAMUSERSTATS_INTERFACE_VERSION012");
            if (userStats != IntPtr.Zero)
            {
                var reqCurrentStats = GetDelegate<RequestCurrentStatsFn>(userStats, 0);
                if (reqCurrentStats != null) reqCurrentStats(userStats);
            }

            // Main idling loop: keep pipe active and pump callbacks until stop signal
            while (!exitHandle.WaitOne(1000))
            {
                CallbackMsg msg = new CallbackMsg();
                while (Steam_BGetCallback(pipe, ref msg))
                {
                    Steam_FreeLastCallback(pipe);
                }
            }

            // Clean shutdown
            releaseUser(steamClient, pipe, user);
            releaseSteamPipe(steamClient, pipe);
            exitHandle.Dispose();
        }
    }
}
