using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("FICSIT Live Map")]
[assembly: AssemblyProduct("FICSIT Live Map")]
[assembly: AssemblyDescription("Sidecar live map for a Satisfactory dedicated server.")]
[assembly: AssemblyCompany("FICSIT Cartography")]

internal static class Program
{
    static int Main(string[] args)
    {
        string repoRoot = null;
        string nodePath = null;
        string port = "43147";
        for (int i = 0; i < args.Length; i++)
        {
            string flag = args[i];
            string value = i + 1 < args.Length ? args[i + 1] : null;
            if (flag == "-Repo" && value != null)
            {
                repoRoot = value;
                i++;
            }
            else if (flag == "-Port" && value != null)
            {
                port = value;
                i++;
            }
            else if (flag == "-Node" && value != null)
            {
                nodePath = value;
                i++;
            }
        }

        if (string.IsNullOrEmpty(repoRoot))
        {
            repoRoot = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
        }

        string logFile = Path.Combine(repoRoot, "data", "server.log");
        try
        {
            Directory.SetCurrentDirectory(repoRoot);
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("NODE_ENV")))
            {
                Environment.SetEnvironmentVariable("NODE_ENV", "production");
            }
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("HOSTNAME")))
            {
                Environment.SetEnvironmentVariable("HOSTNAME", "0.0.0.0");
            }
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PORT")))
            {
                Environment.SetEnvironmentVariable("PORT", port);
            }
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("FICSIT_LOG")))
            {
                Environment.SetEnvironmentVariable("FICSIT_LOG", "info");
            }
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("FICSIT_LOG_FILE")))
            {
                Environment.SetEnvironmentVariable("FICSIT_LOG_FILE", logFile);
            }
            logFile = Environment.GetEnvironmentVariable("FICSIT_LOG_FILE");

            if (string.IsNullOrEmpty(nodePath) || !File.Exists(nodePath))
            {
                nodePath = FindOnPath("node.exe");
            }
            if (string.IsNullOrEmpty(nodePath) || !File.Exists(nodePath))
            {
                throw new InvalidOperationException("Node.js was not found. Pass -Node with the full path to node.exe.");
            }

            string starter = Path.Combine(repoRoot, "scripts", "start.mjs");
            if (!File.Exists(starter))
            {
                throw new FileNotFoundException("Missing start script.", starter);
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = nodePath;
            psi.Arguments = Quote(starter);
            psi.WorkingDirectory = repoRoot;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;

            using (Process child = new Process())
            {
                child.StartInfo = psi;
                child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                {
                    if (e.Data != null) AppendLog(logFile, e.Data);
                };
                child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                {
                    if (e.Data != null) AppendLog(logFile, e.Data);
                };
                child.Start();
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                child.WaitForExit();
                return child.ExitCode;
            }
        }
        catch (Exception ex)
        {
            try
            {
                AppendLog(logFile, "[launcher] " + ex);
            }
            catch
            {
            }
            return 1;
        }
    }

    static void AppendLog(string logFile, string line)
    {
        if (string.IsNullOrEmpty(logFile) || string.IsNullOrEmpty(line)) return;
        string dir = Path.GetDirectoryName(logFile);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        File.AppendAllText(logFile, DateTime.Now.ToString("o") + " " + line + Environment.NewLine);
    }

    static string Quote(string path)
    {
        if (path.IndexOfAny(new char[] { ' ', '\t' }) < 0) return path;
        return "\"" + path.Replace("\"", "\\\"") + "\"";
    }

    static string FindOnPath(string fileName)
    {
        string env = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrEmpty(env)) return null;
        string[] parts = env.Split(Path.PathSeparator);
        for (int i = 0; i < parts.Length; i++)
        {
            try
            {
                string candidate = Path.Combine(parts[i].Trim('"'), fileName);
                if (File.Exists(candidate)) return candidate;
            }
            catch
            {
            }
        }
        string pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", fileName);
        if (File.Exists(pf)) return pf;
        return null;
    }
}
