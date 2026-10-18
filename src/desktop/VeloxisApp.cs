using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace Veloxis
{
    static class Program
    {
        private static NotifyIcon trayIcon;
        private static ContextMenuStrip trayMenu;
        private static Process engineProcess = null;
        private static Mutex singleInstanceMutex = null;
        private static System.Windows.Forms.Timer healthTimer;
        private const string MutexName = "Global\\VeloxisAcceleratorAppMutex";
        private const string DaemonUrl = "http://localhost:6789";

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isSilent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("--background", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
            }

            // Single instance lock
            bool createdNew;
            try
            {
                singleInstanceMutex = new Mutex(true, MutexName, out createdNew);
            }
            catch
            {
                createdNew = false;
            }

            if (!createdNew)
            {
                // Another instance is already running
                if (!isSilent)
                {
                    OpenAppWindow();
                }
                return;
            }

            // Ensure background engine is running
            StartEngineIfNeeded();

            // Initialize System Tray Icon ("Show hidden icons")
            InitializeTray();

            // If not silent PC boot, open dashboard window
            if (!isSilent)
            {
                // Wait briefly for engine to respond before opening window
                new Thread(() =>
                {
                    WaitForEngineReady(30);
                    OpenAppWindow();
                }).Start();
            }

            // Message loop
            Application.Run();

            // Cleanup on shutdown
            ShutdownEngine();
        }

        private static void InitializeTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Renderer = new ToolStripProfessionalRenderer(new DarkColorTable());

            var itemOpen = new ToolStripMenuItem("⚡ Open Veloxis");
            itemOpen.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            itemOpen.Click += (s, e) => OpenAppWindow();
            trayMenu.Items.Add(itemOpen);

            var itemAdd = new ToolStripMenuItem("➕ Add Download Address");
            itemAdd.Click += (s, e) => OpenAppWindow("#add-url");
            trayMenu.Items.Add(itemAdd);

            trayMenu.Items.Add(new ToolStripSeparator());

            var itemResume = new ToolStripMenuItem("▶ Resume All Downloads");
            itemResume.Click += (s, e) => SendApiPost("/api/tasks/resume-all");
            trayMenu.Items.Add(itemResume);

            var itemPause = new ToolStripMenuItem("⏸ Pause All Downloads");
            itemPause.Click += (s, e) => SendApiPost("/api/tasks/pause-all");
            trayMenu.Items.Add(itemPause);

            trayMenu.Items.Add(new ToolStripSeparator());

            var itemSettings = new ToolStripMenuItem("⚙ Settings");
            itemSettings.Click += (s, e) => OpenAppWindow("#settings");
            trayMenu.Items.Add(itemSettings);

            trayMenu.Items.Add(new ToolStripSeparator());

            var itemExit = new ToolStripMenuItem("❌ Exit Application");
            itemExit.ForeColor = Color.FromArgb(239, 68, 68);
            itemExit.Click += (s, e) =>
            {
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
                ShutdownEngine();
                Application.Exit();
            };
            trayMenu.Items.Add(itemExit);

            Icon appIcon = LoadAppIcon();

            trayIcon = new NotifyIcon
            {
                Text = "Veloxis Download Accelerator",
                Icon = appIcon,
                ContextMenuStrip = trayMenu,
                Visible = true
            };

            trayIcon.DoubleClick += (s, e) => OpenAppWindow();
            trayIcon.MouseClick += (s, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    OpenAppWindow();
                }
            };

            // Health check timer
            healthTimer = new System.Windows.Forms.Timer();
            healthTimer.Interval = 4000;
            healthTimer.Tick += (s, e) => EnsureEngineRunning();
            healthTimer.Start();
        }

        private static Icon LoadAppIcon()
        {
            try
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string iconPath = Path.Combine(appDir, "assets", "icon.ico");
                if (File.Exists(iconPath))
                {
                    return new Icon(iconPath);
                }
                iconPath = Path.Combine(appDir, "icon.ico");
                if (File.Exists(iconPath))
                {
                    return new Icon(iconPath);
                }
            }
            catch { }

            // Extract associated executable icon or fallback
            try
            {
                Icon extracted = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (extracted != null) return extracted;
            }
            catch { }

            return SystemIcons.Application;
        }

        private static bool IsServerRunning()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(DaemonUrl + "/api/tasks");
                req.Timeout = 800;
                req.Method = "GET";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void WaitForEngineReady(int maxAttempts)
        {
            for (int i = 0; i < maxAttempts; i++)
            {
                if (IsServerRunning()) return;
                Thread.Sleep(200);
            }
        }

        private static void StartEngineIfNeeded()
        {
            if (IsServerRunning()) return;

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string engineExe = Path.Combine(appDir, "VeloxisEngine.exe");

            if (!File.Exists(engineExe))
            {
                engineExe = Path.Combine(appDir, "dist", "VeloxisEngine.exe");
            }

            if (File.Exists(engineExe))
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = engineExe,
                    Arguments = "--background",
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                try
                {
                    engineProcess = Process.Start(psi);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Failed to start Veloxis Engine: " + ex.Message, "Veloxis Accelerator", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            else
            {
                // Fallback for dev mode where Node is available
                string script = Path.Combine(appDir, "src", "server", "index.js");
                if (File.Exists(script))
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "node.exe",
                        Arguments = "\"" + script + "\"",
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        UseShellExecute = false
                    };
                    try
                    {
                        engineProcess = Process.Start(psi);
                    }
                    catch { }
                }
            }
        }

        private static void EnsureEngineRunning()
        {
            if (!IsServerRunning())
            {
                StartEngineIfNeeded();
            }
        }

        public static void OpenAppWindow(string hash = "")
        {
            string url = DaemonUrl + hash;
            try
            {
                // Microsoft Edge borderless standalone window
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "msedge.exe",
                    Arguments = "--app=\"" + url + "\" --window-size=1280,820",
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            catch
            {
                try
                {
                    // Chrome fallback
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "chrome.exe",
                        Arguments = "--app=\"" + url + "\" --window-size=1280,820",
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                }
                catch
                {
                    // Default browser fallback
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = url,
                        UseShellExecute = true
                    });
                }
            }
        }

        private static void SendApiPost(string endpoint)
        {
            new Thread(() =>
            {
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(DaemonUrl + endpoint);
                    req.Method = "POST";
                    req.Timeout = 1500;
                    req.ContentLength = 0;
                    using (var resp = req.GetResponse()) { }
                }
                catch { }
            }).Start();
        }

        private static void ShutdownEngine()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(DaemonUrl + "/api/shutdown");
                req.Method = "POST";
                req.Timeout = 1000;
                req.ContentLength = 0;
                using (var resp = req.GetResponse()) { }
            }
            catch { }

            if (engineProcess != null && !engineProcess.HasExited)
            {
                try
                {
                    if (!engineProcess.WaitForExit(800))
                    {
                        engineProcess.Kill();
                    }
                }
                catch { }
            }
        }
    }

    // Modern dark styling for system tray context menu
    class DarkColorTable : ProfessionalColorTable
    {
        public override Color MenuBorder { get { return Color.FromArgb(40, 45, 55); } }
        public override Color MenuItemBorder { get { return Color.FromArgb(50, 55, 68); } }
        public override Color MenuItemSelected { get { return Color.FromArgb(32, 38, 50); } }
        public override Color ToolStripDropDownBackground { get { return Color.FromArgb(16, 20, 28); } }
        public override Color ImageMarginGradientBegin { get { return Color.FromArgb(16, 20, 28); } }
        public override Color ImageMarginGradientMiddle { get { return Color.FromArgb(16, 20, 28); } }
        public override Color ImageMarginGradientEnd { get { return Color.FromArgb(16, 20, 28); } }
        public override Color SeparatorDark { get { return Color.FromArgb(35, 40, 52); } }
        public override Color SeparatorLight { get { return Color.FromArgb(20, 24, 32); } }
    }
}
