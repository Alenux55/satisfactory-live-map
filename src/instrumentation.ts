export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger, memorySnapshot } = await import("./lib/log");
  logger.info("next runtime ready", {
    node: process.version,
    pid: process.pid,
    cwd: process.cwd(),
    log: process.env.FICSIT_LOG ?? "debug",
    mode: process.env.FICSIT_MODE ?? "(config.json)",
    saves: process.env.FICSIT_SAVES_DIR ?? "(config.json)",
    ...memorySnapshot(),
  });
}
