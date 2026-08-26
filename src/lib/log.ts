import { appendFile } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): LogLevel {
  const raw = (process.env.FICSIT_LOG ?? "debug").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  if (raw === "silent" || raw === "off") return "error";
  return "debug";
}

function logFilePath(): string | null {
  const fromEnv = process.env.FICSIT_LOG_FILE?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), "data", "server.log");
}

export function memorySnapshot(): { rssMb: number; heapMb: number } {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round(usage.rss / 1024 / 1024),
    heapMb: Math.round(usage.heapUsed / 1024 / 1024),
  };
}

function formatLine(level: LogLevel, message: string, extra?: Record<string, unknown>): string {
  const mem = memorySnapshot();
  const payload = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  return `${new Date().toISOString()} [${level.toUpperCase()}] rss=${mem.rssMb}MB heap=${mem.heapMb}MB ${message}${payload}`;
}

let fileQueue: Promise<void> = Promise.resolve();

function writeToFile(line: string): void {
  const file = logFilePath();
  if (!file) return;
  fileQueue = fileQueue
    .then(() => appendFile(file, `${line}\n`, "utf8"))
    .catch((error) => {
      console.error(`FICSIT log file write failed: ${error instanceof Error ? error.message : error}`);
    });
}

export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (RANK[level] < RANK[activeLevel()]) return;
  const line = formatLine(level, message, extra);
  if (level === "error") console.error(line);
  else console.log(line);
  writeToFile(line);
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => log("debug", message, extra),
  info: (message: string, extra?: Record<string, unknown>) => log("info", message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => log("warn", message, extra),
  error: (message: string, extra?: Record<string, unknown>) => log("error", message, extra),
};

export async function withRequestLog(
  method: string,
  route: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  logger.debug(`http ${method} ${route} start`);
  try {
    const response = await handler();
    logger.debug(`http ${method} ${route} ${response.status} ${Date.now() - started}ms`);
    return response;
  } catch (error) {
    logger.error(`http ${method} ${route} failed ${Date.now() - started}ms`, {
      err: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
