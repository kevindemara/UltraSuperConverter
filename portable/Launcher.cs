using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Windows.Forms;

internal static class Launcher
{
    private static string dataDir;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    [STAThread]
    private static int Main(string[] args)
    {
        bool noBrowser = Array.IndexOf(args, "--no-browser") >= 0;
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string node = Path.Combine(root, "Runtime", "node.exe");
            string bootstrap = Path.Combine(root, "App", "portable", "start-server.js");
            dataDir = Path.Combine(root, "Data");
            if (!File.Exists(node) || !File.Exists(bootstrap))
                throw new Exception("Extract the entire ZIP first. Keep the EXE, App and Runtime folders together.");
            Directory.CreateDirectory(dataDir);
            string idPath = Path.Combine(dataDir, "instance-id");
            // Serialize concurrent double-clicks on the same portable folder.
            string mutexKey = BitConverter.ToString(System.Security.Cryptography.SHA256.Create()
                .ComputeHash(System.Text.Encoding.UTF8.GetBytes(Path.GetFullPath(root).ToUpperInvariant()))).Replace("-", "");
            using (var gate = new Mutex(false, "Local\\UltraSuperConverter-" + mutexKey))
            {
                bool ownsGate = false;
                try
                {
                    try { ownsGate = gate.WaitOne(60000); } catch (AbandonedMutexException) { ownsGate = true; }
                    if (!ownsGate) throw new Exception("Another launch is still starting. Please try again shortly.");
                    string id = File.Exists(idPath) ? File.ReadAllText(idPath).Trim() : Guid.NewGuid().ToString();
                    Guid parsedId;
                    if (!Guid.TryParse(id, out parsedId)) throw new Exception("Data/instance-id is invalid. Restore that file from your backup.");
                    File.WriteAllText(idPath, id);
                    int savedPort;
                    string portPath = Path.Combine(dataDir, "port");
                    if (!File.Exists(portPath) || !int.TryParse(File.ReadAllText(portPath), out savedPort) || savedPort < 1024 || savedPort > 65535) savedPort = 3847;
                    int requestedPort = 0;
                    for (int i = 0; i < args.Length; i++)
                    {
                        if (args[i] == "--no-browser") continue;
                        if (args[i] == "--port" && i + 1 < args.Length && int.TryParse(args[++i], out requestedPort) && requestedPort >= 1024 && requestedPort <= 65515) continue;
                        throw new Exception("Supported options: --no-browser, --port 1024..65515");
                    }
                    if (IsOurServer(savedPort, id)) return Open(savedPort, noBrowser);
                    int startPort = requestedPort > 0 ? requestedPort : savedPort;
                    int port = 0;
                    for (int candidate = startPort; candidate <= Math.Min(startPort + 20, 65535); candidate++)
                    {
                        if (IsOurServer(candidate, id)) return Open(candidate, noBrowser);
                        if (IsPortFree(candidate)) { port = candidate; break; }
                    }
                    if (port == 0) throw new Exception("No local port is available. Close another app or use --port with a different number.");
                    var start = new ProcessStartInfo(node, "\"" + bootstrap + "\"");
                    start.WorkingDirectory = Path.Combine(root, "App");
                    start.UseShellExecute = false;
                    start.CreateNoWindow = true;
                    start.EnvironmentVariables.Remove("NODE_OPTIONS");
                    start.EnvironmentVariables.Remove("NODE_PATH");
                    start.EnvironmentVariables["PORT"] = port.ToString();
                    start.EnvironmentVariables["USC_DATA_DIR"] = dataDir;
                    start.EnvironmentVariables["USC_PID_FILE"] = Path.Combine(dataDir, ".server.pid");
                    start.EnvironmentVariables["USC_PORTABLE"] = "1";
                    start.EnvironmentVariables["USC_PORTABLE_ID"] = id;
                    File.WriteAllText(portPath, port.ToString());
                    using (var starter = Process.Start(start))
                    {
                        if (!starter.WaitForExit(10000) || starter.ExitCode != 0)
                            throw new Exception("The engine could not start. See Data/server.log for details.");
                    }
                    for (int attempt = 0; attempt < 120; attempt++)
                    {
                        if (IsOurServer(port, id)) return Open(port, noBrowser);
                        Thread.Sleep(250);
                    }
                    throw new Exception("The engine did not become ready. See Data/server.log. If this folder is read-only, move it to a writable location.");
                }
                finally { if (ownsGate) gate.ReleaseMutex(); }
            }
        }
        catch (Exception error)
        {
            try { File.WriteAllText(Path.Combine(dataDir ?? AppDomain.CurrentDomain.BaseDirectory, "launcher-error.txt"), error.ToString()); } catch { }
            if (!noBrowser) MessageBox.Show(error.Message, "UltraSuperConverter", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static bool IsOurServer(int port, string id)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/state");
            request.Timeout = 600;
            request.ReadWriteTimeout = 600;
            request.Proxy = null;
            request.AllowAutoRedirect = false;
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                var body = Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                var engine = (Dictionary<string, object>)body["engine"];
                return engine.ContainsKey("portableId") && (string)engine["portableId"] == id;
            }
        }
        catch { return false; }
    }

    private static bool IsPortFree(int port)
    {
        var listener = new TcpListener(IPAddress.Loopback, port);
        try { listener.Start(); return true; } catch { return false; } finally { listener.Stop(); }
    }

    private static int Open(int port, bool noBrowser)
    {
        if (!noBrowser) Process.Start(new ProcessStartInfo("http://localhost:" + port + "/") { UseShellExecute = true });
        return 0;
    }
}
