import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/log";

const DATA_DIR = path.join(process.cwd(), "data");
const ICON_DIR = path.join(DATA_DIR, "icons");
const WIKI_FILE = "https://satisfactory.wiki.gg/wiki/Special:FilePath/";
const inflight = new Map<string, Promise<Buffer | null>>();

export function safeIconFile(raw: string): string | null {
  let name = raw.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // already decoded
  }
  const normalized = name.replace(/\s+/g, "_");
  if (!/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$/i.test(normalized)) return null;
  return normalized;
}

function cachePath(file: string): string {
  return path.join(DATA_DIR, "icons", file);
}

async function downloadWikiIcon(file: string): Promise<Buffer | null> {
  const url = `${WIKI_FILE}${encodeURIComponent(file)}`;
  logger.debug("wiki icon download", { file });
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "image/png,image/webp,image/*;q=0.9",
      "User-Agent": "FICSIT-Live-Map/0.1 (+https://github.com/Alenux55/satisfactory-live-map)",
    },
  });
  if (!response.ok) {
    logger.debug("wiki icon missing", { file, status: response.status });
    return null;
  }
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/html")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 80 || bytes.byteLength > 2_000_000) return null;
  await mkdir(ICON_DIR, { recursive: true });
  await writeFile(cachePath(file), bytes);
  return bytes;
}

export async function loadWikiIcon(file: string): Promise<Buffer | null> {
  const safe = safeIconFile(file);
  if (!safe) return null;
  const cached = path.join(DATA_DIR, "icons", safe);
  if (existsSync(cached)) {
    return readFile(cached);
  }
  const pending = inflight.get(safe);
  if (pending) return pending;
  const job = downloadWikiIcon(safe).finally(() => inflight.delete(safe));
  inflight.set(safe, job);
  return job;
}

export function iconEtag(bytes: Buffer): string {
  return `"${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}"`;
}
