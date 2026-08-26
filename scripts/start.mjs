import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot);
mkdirSync(path.join(repoRoot, "data"), { recursive: true });

process.env.NODE_ENV ??= "production";
process.env.FICSIT_LOG ??= "debug";
process.env.FICSIT_LOG_FILE ??= path.join(repoRoot, "data", "server.log");
process.env.HOSTNAME ??= "0.0.0.0";
process.env.PORT ??= "43147";
process.env.FICSIT_PARSE_CHILD ??= path.join(repoRoot, ".next", "parse-worker", "parse-worker.js");

const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT;

console.log(
  `${new Date().toISOString()} [INFO] starting next start -H 0.0.0.0 -p ${port}  FICSIT_LOG=${process.env.FICSIT_LOG}  logFile=${process.env.FICSIT_LOG_FILE}`,
);

const child = spawn(process.execPath, [nextCli, "start", "-H", "0.0.0.0", "-p", port], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
