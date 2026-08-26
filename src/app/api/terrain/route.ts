import { readFile } from "node:fs/promises";
import { ensureTerrainMap, TERRAIN_CACHE } from "@/lib/world/terrain-map";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const ok = await ensureTerrainMap();
  if (!ok) {
    return new Response("Terrain map unavailable", { status: 404 });
  }
  const bytes = await readFile(TERRAIN_CACHE);
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
