using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;

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

        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        LoadHostJson(Path.Combine(exeDir, "host.json"), ref repoRoot, ref nodePath, ref port);
        if (!string.IsNullOrEmpty(nodePath) && !File.Exists(nodePath))
        {
            nodePath = null;
            LoadHostJson(Path.Combine(exeDir, "host.json"), ref repoRoot, ref nodePath, ref port);
        }

        if (string.IsNullOrEmpty(repoRoot))
        {
            repoRoot = Path.GetFullPath(Path.Combine(exeDir, ".."));
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
                throw new InvalidOperationException("Node.js was not found. Re-run service.ps1 Install so data\\host.json has the node.exe path.");
            }

            string starter = Path.Combine(repoRoot, "scripts", "start.mjs");
            if (!File.Exists(starter))
            {
                throw new FileNotFoundException("Missing start script.", starter);
            }

            AppendLog(logFile, "[launcher] starting " + nodePath + " " + starter + "  repo=" + repoRoot + "  port=" + port);

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
                AppendLog(logFile, "[launcher] node exited code=" + child.ExitCode);
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

    static void LoadHostJson(string path, ref string repoRoot, ref string nodePath, ref string port)
    {
        if (!File.Exists(path)) return;
        string json = File.ReadAllText(path);
        if (string.IsNullOrEmpty(repoRoot)) repoRoot = JsonField(json, "repo");
        if (string.IsNullOrEmpty(nodePath)) nodePath = JsonField(json, "node");
        string fromFile = JsonField(json, "port");
        if (!string.IsNullOrEmpty(fromFile)) port = fromFile;
    }

    static string JsonField(string json, string key)
    {
        Match quoted = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
        if (quoted.Success) return quoted.Groups[1].Value.Replace("\\\\", "\\").Replace("\\\"", "\"");
        Match number = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*(-?\\d+)");
        if (number.Success) return number.Groups[1].Value;
        return null;
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
        if (!string.IsNullOrEmpty(env))
        {
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
        }
        string[] fallbacks = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", fileName),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", fileName)
        };
        for (int i = 0; i < fallbacks.Length; i++)
        {
            if (File.Exists(fallbacks[i])) return fallbacks[i];
        }
        return null;
    }
}
