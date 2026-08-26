import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot);
mkdirSync(path.join(repoRoot, "data"), { recursive: true });

process.env.NODE_ENV ??= "production";
process.env.FICSIT_LOG ??= "info";
process.env.FICSIT_LOG_FILE ??= path.join(repoRoot, "data", "server.log");
process.env.HOSTNAME ??= "0.0.0.0";
process.env.PORT ??= "43147";
process.env.FICSIT_PARSE_CHILD ??= path.join(repoRoot, ".next", "parse-worker", "parse-worker.js");

const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT;
const pidPath = path.join(repoRoot, "data", "server.pid");

console.log(
  `${new Date().toISOString()} [INFO] starting next start -H 0.0.0.0 -p ${port}  FICSIT_LOG=${process.env.FICSIT_LOG}  logFile=${process.env.FICSIT_LOG_FILE}`,
);

const child = spawn(process.execPath, [nextCli, "start", "-H", "0.0.0.0", "-p", port], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

function writePid() {
  writeFileSync(
    pidPath,
    JSON.stringify(
      {
        starter: process.pid,
        next: child.pid ?? null,
        port: Number(port),
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function clearPid() {
  try {
    unlinkSync(pidPath);
  } catch {
    // already gone
  }
}

writePid();
if (child.pid == null) {
  child.once("spawn", writePid);
}

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child.pid) {
    try {
      child.kill();
    } catch {
      // already exited
    }
  }
  clearPid();
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

child.on("exit", (code, signal) => {
  clearPid();
  if (shuttingDown) return;
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});
