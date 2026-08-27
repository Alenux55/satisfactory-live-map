import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireAdmin } from "@/lib/auth/guard";
import { withRequestLog } from "@/lib/log";
import { normalizeFsPath } from "@/lib/world/save-io";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Entry = { name: string; path: string; dir: boolean; sav?: boolean };

function windowsRoots(): string[] {
  const roots: string[] = [];
  for (const letter of "CDEFGH") {
    roots.push(`${letter}:\\`);
  }
  return roots;
}

async function existsDir(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function suggestions(): Promise<Entry[]> {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  const candidates = [
    path.join(local, "FactoryGame", "Saved", "SaveGames", "server"),
    path.join(local, "FactoryGame", "Saved", "SaveGames"),
    path.join(process.cwd(), "data", "saves"),
    home,
  ];
  const out: Entry[] = [];
  for (const dir of candidates) {
    if (await existsDir(dir)) out.push({ name: path.basename(dir) || dir, path: dir, dir: true });
  }
  if (process.platform === "win32") {
    for (const root of windowsRoots()) {
      if (await existsDir(root)) out.push({ name: root, path: root, dir: true });
    }
  } else {
    out.push({ name: "/", path: "/", dir: true });
  }
  const seen = new Set<string>();
  return out.filter((entry) => {
    const key = entry.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: Request) {
  return withRequestLog("GET", "/api/fs/browse", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const url = new URL(request.url);
    const raw = url.searchParams.get("path")?.trim() ?? "";
    if (!raw) {
      return Response.json({ path: "", parent: null, entries: await suggestions() });
    }
    const dir = normalizeFsPath(raw);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) {
      return Response.json({ error: "Folder not found" }, { status: 404 });
    }
    const names = await fs.readdir(dir);
    const entries: Entry[] = [];
    for (const name of names.slice(0, 400)) {
      if (name.startsWith(".") || name === "System Volume Information") continue;
      const full = path.join(dir, name);
      try {
        const info = await fs.lstat(full);
        if (info.isSymbolicLink()) continue;
        if (info.isDirectory()) entries.push({ name, path: full, dir: true });
        else if (name.toLowerCase().endsWith(".sav")) entries.push({ name, path: full, dir: false, sav: true });
      } catch {
        // skip unreadable
      }
    }
    entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    const parent = path.dirname(dir);
    return Response.json({
      path: dir,
      parent: parent !== dir ? parent : null,
      entries,
    });
  });
}
