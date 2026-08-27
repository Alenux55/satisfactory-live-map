import { promises as fs } from "node:fs";
import path from "node:path";

export const STAGING_DIR = path.join(process.cwd(), "data", "staging");

const SETTLE_MS = 400;
const SETTLE_ATTEMPTS = 5;
const LOCK_RETRIES = 8;
const LOCK_BACKOFF_MS = 120;
const MIN_SAVE_BYTES = 2048;

export function expandWindowsEnv(input: string): string {
  return input.replace(/%([^%]+)%/g, (all, name: string) => {
    const value = process.env[name];
    return value ? value : all;
  });
}

export function normalizeFsPath(input: string): string {
  const trimmed = input.trim().replace(/^["']|["']$/g, "");
  return path.resolve(expandWindowsEnv(trimmed));
}

export function sameFsPath(a: string, b: string): boolean {
  const left = normalizeFsPath(a);
  const right = normalizeFsPath(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function isWatchableSaveName(name: string): boolean {
  const base = path.basename(name);
  const lower = base.toLowerCase();
  if (!lower.endsWith(".sav")) return false;
  if (lower.endsWith(".sav.tmp") || lower.endsWith(".tmp.sav")) return false;
  if (lower.includes(".tmp.")) return false;
  if (base.startsWith(".") || base.startsWith("~")) return false;
  return true;
}

export function isTransientFsError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException;
  if (!err) return false;
  if (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES" || err.code === "EAGAIN") {
    return true;
  }
  const errno = err.errno != null ? Math.abs(err.errno) : 0;
  // Win32 ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION (and libuv's negative mappings).
  if (errno === 32 || errno === 33 || errno === 4082 || errno === 4048) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("sharing violation") ||
    msg.includes("being used by another process") ||
    msg.includes("resource busy") ||
    msg.includes("locked by another process")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFsRetry<T>(op: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      last = error;
      if (!isTransientFsError(error) || attempt === LOCK_RETRIES - 1) throw error;
      await sleep(LOCK_BACKOFF_MS * (attempt + 1));
    }
  }
  throw last;
}

export type SaveReadFailure = {
  ok: false;
  reason: "missing" | "empty" | "writing" | "locked";
  message: string;
  filePath?: string;
};

export type SaveReadSuccess = {
  ok: true;
  filePath: string;
  bytes: Buffer;
  size: number;
  mtimeMs: number;
};

export type SaveReadResult = SaveReadSuccess | SaveReadFailure;

async function waitForStableStat(filePath: string): Promise<{ size: number; mtimeMs: number } | null> {
  let prevSize = -1;
  let prevMtime = -1;
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    let stat;
    try {
      stat = await withFsRetry(() => fs.stat(filePath));
    } catch (error) {
      if (isTransientFsError(error)) {
        await sleep(LOCK_BACKOFF_MS * (attempt + 1));
        continue;
      }
      return null;
    }
    if (stat.size < MIN_SAVE_BYTES) {
      await sleep(SETTLE_MS);
      continue;
    }
    const ageMs = Date.now() - stat.mtimeMs;
    if (stat.size === prevSize && stat.mtimeMs === prevMtime && ageMs >= SETTLE_MS) {
      return { size: stat.size, mtimeMs: stat.mtimeMs };
    }
    prevSize = stat.size;
    prevMtime = stat.mtimeMs;
    await sleep(SETTLE_MS);
  }
  try {
    const stat = await fs.stat(filePath);
    if (stat.size >= MIN_SAVE_BYTES && stat.size === prevSize && Date.now() - stat.mtimeMs >= SETTLE_MS) {
      return { size: stat.size, mtimeMs: stat.mtimeMs };
    }
  } catch {
    return null;
  }
  return null;
}

export async function readSaveCopy(filePath: string): Promise<SaveReadResult> {
  const stable = await waitForStableStat(filePath);
  if (!stable) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size < MIN_SAVE_BYTES) {
        return {
          ok: false,
          reason: "empty",
          message: `${path.basename(filePath)} is still tiny (${stat.size} bytes) — dedicated server may still be writing`,
          filePath,
        };
      }
    } catch {
      return { ok: false, reason: "missing", message: `Save disappeared: ${filePath}` };
    }
    return {
      ok: false,
      reason: "writing",
      message: `Waiting for dedicated server to finish writing ${path.basename(filePath)}`,
      filePath,
    };
  }

  await fs.mkdir(STAGING_DIR, { recursive: true });
  const staging = path.join(STAGING_DIR, `read-${process.pid}.sav`);
  try {
    await withFsRetry(() => fs.copyFile(filePath, staging));
    const after = await fs.stat(filePath);
    if (after.size !== stable.size) {
      return {
        ok: false,
        reason: "writing",
        message: `${path.basename(filePath)} changed size during copy — will retry`,
        filePath,
      };
    }
    const bytes = await withFsRetry(() => fs.readFile(staging));
    if (bytes.byteLength !== stable.size) {
      return {
        ok: false,
        reason: "writing",
        message: `Copied ${bytes.byteLength} bytes, expected ${stable.size} — will retry`,
        filePath,
      };
    }
    return { ok: true, filePath, bytes, size: stable.size, mtimeMs: stable.mtimeMs };
  } catch (error) {
    if (isTransientFsError(error)) {
      return {
        ok: false,
        reason: "locked",
        message: `Save is locked by the dedicated server (${path.basename(filePath)}) — will retry`,
        filePath,
      };
    }
    throw error;
  }
}

export async function newestWatchableSave(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir);
  const savs = entries.filter(isWatchableSaveName);
  if (savs.length === 0) return null;
  const ranked = (
    await Promise.all(
      savs.map(async (name) => {
        const full = path.join(dir, name);
        try {
          const stat = await fs.stat(full);
          return { full, mtime: stat.mtimeMs, size: stat.size };
        } catch {
          return null;
        }
      }),
    )
  ).filter((entry): entry is { full: string; mtime: number; size: number } => entry != null);
  ranked.sort((a, b) => b.mtime - a.mtime);
  const ready = ranked.find((entry) => entry.size >= MIN_SAVE_BYTES);
  return ready?.full ?? ranked[0]?.full ?? null;
}

export function sleepMs(ms: number): Promise<void> {
  return sleep(ms);
}
