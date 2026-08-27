import { existsSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/log";

/** 1.0 in-game map from the official wiki. Coffee Stain art; not SCIM tiles. Not committed. */
export const WIKI_MAP_PAGE = "https://satisfactory.wiki.gg/wiki/File:Map.jpg";
const WIKI_MAP_FILE = "https://satisfactory.wiki.gg/wiki/Special:FilePath/Map.jpg";
const MIN_BYTES = 100_000;

export const TERRAIN_CACHE = path.join(process.cwd(), "data", "world-map.jpg");

let inflight: Promise<boolean> | null = null;

export function terrainCacheExists(): boolean {
  return existsSync(/*turbopackIgnore: true*/ TERRAIN_CACHE);
}

async function downloadWikiMap(): Promise<boolean> {
  logger.info("terrain map download start", { from: WIKI_MAP_FILE });
  const response = await fetch(WIKI_MAP_FILE, {
    redirect: "follow",
    headers: {
      Accept: "image/jpeg,image/*;q=0.9",
      "User-Agent": "FICSIT-Live-Map/0.1 (+https://github.com/Alenux55/satisfactory-live-map)",
    },
  });
  if (!response.ok) {
    logger.warn("terrain map download failed", { status: response.status });
    return false;
  }
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    logger.warn("terrain map download returned HTML instead of an image");
    return false;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < MIN_BYTES) {
    logger.warn("terrain map download too small", { bytes: bytes.byteLength });
    return false;
  }
  await mkdir(path.dirname(TERRAIN_CACHE), { recursive: true });
  const tmp = `${TERRAIN_CACHE}.part`;
  await writeFile(tmp, bytes);
  try {
    await rename(tmp, TERRAIN_CACHE);
  } catch {
    await unlink(TERRAIN_CACHE).catch(() => undefined);
    await rename(tmp, TERRAIN_CACHE);
  }
  logger.info("terrain map cached", { bytes: bytes.byteLength });
  return true;
}

export async function ensureTerrainMap(): Promise<boolean> {
  if (terrainCacheExists()) return true;
  if (!inflight) {
    inflight = downloadWikiMap().finally(() => {
      inflight = null;
    });
  }
  try {
    return await inflight;
  } catch (error) {
    logger.warn("terrain map download error", {
      err: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
