import { promises as fs } from "node:fs";
import path from "node:path";
import { applyDelta } from "./diff";
import { logger } from "@/lib/log";
import { sameFsPath } from "./save-io";
import { DEMO_SERVER_ID, type HistoryEvent, type HistoryMark, type HistoryMeta, type MapEntity, type SaveHeaderInfo } from "./types";

const HISTORY_DIR = path.join(process.cwd(), "data", "history");
const DAY_MS = 24 * 60 * 60 * 1000;
const KEYFRAME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KEYFRAME_MAX_EVENTS = 400;
/** Keep the first baseline plus the newest snapshot; drop copies in between. */
const KEYFRAME_KEEP_TAIL = 1;

export type HistoryIdentity = {
  saveIdentifier?: string;
  sessionName?: string;
  mapName?: string;
  savesDir?: string;
};

type StoredMeta = HistoryMeta & {
  version: 1;
  lastKeyframeT: number | null;
  eventsSinceKeyframe: number;
  keyframes: { t: number; file: string }[];
  identity?: HistoryIdentity;
};

type PersistInput = {
  serverId: string;
  savesDir?: string;
  t: number;
  rev: number;
  fromRev: number;
  added: MapEntity[];
  updated: MapEntity[];
  removed: string[];
  entities: MapEntity[];
  header: SaveHeaderInfo | null;
  entityCount: number;
};

const queues = new Map<string, Promise<void>>();

function safeId(serverId: string): string {
  return serverId.replace(/[^\w.-]+/g, "_") || "server";
}

function dirFor(serverId: string): string {
  return path.join(HISTORY_DIR, safeId(serverId));
}

function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function eventsPath(serverId: string, t: number): string {
  return path.join(dirFor(serverId), `events-${dayKey(t)}.ndjson`);
}

function keyPath(serverId: string, t: number): string {
  return path.join(dirFor(serverId), `key-${t}.json`);
}

function metaPath(serverId: string): string {
  return path.join(dirFor(serverId), "meta.json");
}

function emptyMeta(): StoredMeta {
  return {
    version: 1,
    firstT: null,
    lastT: null,
    eventCount: 0,
    keyframeCount: 0,
    bytes: 0,
    lastKeyframeT: null,
    eventsSinceKeyframe: 0,
    keyframes: [],
  };
}

function unnamedSession(name: string | undefined): boolean {
  const value = name?.trim() ?? "";
  if (!value) return true;
  const lower = value.toLowerCase();
  return lower === "unnamed session" || lower.startsWith("grass fields");
}

export function historyIdentityKey(identity: HistoryIdentity): string | null {
  const guid = identity.saveIdentifier?.trim();
  if (guid) return `id:${guid.toLowerCase()}`;
  const session = identity.sessionName?.trim();
  const map = (identity.mapName?.trim() || "Persistent_Level").toLowerCase();
  if (session && !unnamedSession(session)) return `sess:${session.toLowerCase()}|${map}`;
  const dir = identity.savesDir?.trim();
  if (dir) {
    const normalized = process.platform === "win32" ? dir.toLowerCase() : dir;
    return `dir:${normalized}`;
  }
  return null;
}

function mergeIdentity(base: HistoryIdentity | undefined, extra: HistoryIdentity | undefined): HistoryIdentity {
  return {
    saveIdentifier: extra?.saveIdentifier?.trim() || base?.saveIdentifier,
    sessionName: extra?.sessionName?.trim() || base?.sessionName,
    mapName: extra?.mapName?.trim() || base?.mapName,
    savesDir: extra?.savesDir?.trim() || base?.savesDir,
  };
}

async function readMeta(serverId: string): Promise<StoredMeta> {
  try {
    const raw = await fs.readFile(metaPath(serverId), "utf8");
    const parsed = JSON.parse(raw) as StoredMeta;
    if (parsed?.version !== 1) return emptyMeta();
    return { ...emptyMeta(), ...parsed, keyframes: parsed.keyframes ?? [] };
  } catch {
    return emptyMeta();
  }
}

async function writeMeta(serverId: string, meta: StoredMeta): Promise<void> {
  await fs.mkdir(dirFor(serverId), { recursive: true });
  const tmp = `${metaPath(serverId)}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(meta)}\n`);
  await fs.rename(tmp, metaPath(serverId));
}

async function writeMetaAt(dir: string, meta: StoredMeta): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, "meta.json");
  const tmp = `${dest}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(meta)}\n`);
  await fs.rename(tmp, dest);
}

async function pruneKeyframesInDir(dir: string, logId: string): Promise<number> {
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  const keys = names
    .map((name) => {
      const match = /^key-(\d+)\.json$/.exec(name);
      return match ? { t: Number(match[1]), file: name } : null;
    })
    .filter((entry): entry is { t: number; file: string } => entry != null)
    .sort((a, b) => a.t - b.t);
  const keepCount = Math.min(keys.length, 1 + KEYFRAME_KEEP_TAIL);
  if (keys.length <= keepCount) return 0;
  const keep = new Set<string>([keys[0].file]);
  for (const frame of keys.slice(-KEYFRAME_KEEP_TAIL)) keep.add(frame.file);
  let removed = 0;
  let freed = 0;
  for (const frame of keys) {
    if (keep.has(frame.file)) continue;
    const full = path.join(dir, frame.file);
    try {
      freed += (await fs.stat(full)).size;
      await fs.unlink(full);
      removed += 1;
    } catch {
      // already gone
    }
  }
  if (removed === 0) return 0;
  const remaining = keys.filter((frame) => keep.has(frame.file));
  try {
    const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    const meta = { ...emptyMeta(), ...(JSON.parse(raw) as StoredMeta) };
    meta.keyframes = remaining;
    meta.keyframeCount = remaining.length;
    meta.lastKeyframeT = remaining[remaining.length - 1]?.t ?? null;
    meta.bytes = Math.max(0, (meta.bytes ?? 0) - freed);
    await writeMetaAt(dir, meta);
  } catch {
    // meta rewrite is best-effort; files are already gone
  }
  logger.info("history keyframes pruned", {
    id: logId,
    removed,
    kept: remaining.length,
    freedMb: Number((freed / (1024 * 1024)).toFixed(1)),
  });
  return removed;
}

async function findMetaDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  let names: string[] = [];
  try {
    names = await fs.readdir(root);
  } catch {
    return found;
  }
  for (const name of names) {
    if (name === DEMO_SERVER_ID) continue;
    const full = path.join(root, name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    try {
      await fs.access(path.join(full, "meta.json"));
      found.push(full);
    } catch {
      found.push(...(await findMetaDirs(full)));
    }
  }
  return found;
}

export async function pruneAllHistoryKeyframes(): Promise<number> {
  let total = 0;
  for (const dir of await findMetaDirs(HISTORY_DIR)) {
    total += await pruneKeyframesInDir(dir, path.relative(HISTORY_DIR, dir));
  }
  return total;
}

function enqueue(serverId: string, work: () => Promise<void>): void {
  const prev = queues.get(serverId) ?? Promise.resolve();
  const next = prev.then(work).catch((error) => {
    logger.error("history write failed", {
      serverId,
      err: error instanceof Error ? error.message : String(error),
    });
  });
  queues.set(serverId, next);
}

function needKeyframe(meta: StoredMeta, t: number): boolean {
  if (meta.lastKeyframeT == null) return true;
  if (t - meta.lastKeyframeT >= KEYFRAME_MAX_AGE_MS) return true;
  return meta.eventsSinceKeyframe >= KEYFRAME_MAX_EVENTS;
}

export function persistHistory(input: PersistInput): void {
  enqueue(input.serverId, () => persistHistoryNow(input));
}

async function persistHistoryNow(input: PersistInput): Promise<void> {
  const meta = await readMeta(input.serverId);
  if (input.fromRev === 0 && meta.lastKeyframeT != null) {
    return;
  }
  const writeKey = needKeyframe(meta, input.t);
  const event: HistoryEvent = {
    t: input.t,
    rev: input.rev,
    added: input.fromRev === 0 ? [] : input.added,
    updated: input.fromRev === 0 ? [] : input.updated,
    removed: input.fromRev === 0 ? [] : input.removed,
    entityCount: input.entityCount,
    header: input.header,
  };
  await fs.mkdir(dirFor(input.serverId), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  await fs.appendFile(eventsPath(input.serverId, input.t), line);
  let extraBytes = Buffer.byteLength(line);
  if (writeKey) {
    const file = path.basename(keyPath(input.serverId, input.t));
    const body = `${JSON.stringify({ t: input.t, rev: input.rev, header: input.header, entities: input.entities })}\n`;
    await fs.writeFile(keyPath(input.serverId, input.t), body);
    extraBytes += Buffer.byteLength(body);
    meta.lastKeyframeT = input.t;
    meta.eventsSinceKeyframe = 0;
    meta.keyframeCount += 1;
    meta.keyframes.push({ t: input.t, file });
  } else {
    meta.eventsSinceKeyframe += 1;
  }
  meta.firstT = meta.firstT ?? input.t;
  meta.lastT = input.t;
  meta.eventCount += 1;
  meta.bytes += extraBytes;
  meta.identity = mergeIdentity(meta.identity, {
    saveIdentifier: input.header?.saveIdentifier,
    sessionName: input.header?.sessionName,
    mapName: input.header?.mapName,
    savesDir: input.savesDir,
  });
  await writeMeta(input.serverId, meta);
  if (writeKey) await pruneKeyframesInDir(dirFor(input.serverId), input.serverId);
  logger.info("history recorded", {
    serverId: input.serverId,
    rev: input.rev,
    t: input.t,
    keyframe: writeKey,
    added: event.added.length,
    updated: event.updated.length,
    removed: event.removed.length,
    mb: Number((meta.bytes / (1024 * 1024)).toFixed(2)),
  });
}

export async function historyMeta(serverId: string): Promise<HistoryMeta> {
  const meta = await readMeta(serverId);
  return {
    firstT: meta.firstT,
    lastT: meta.lastT,
    eventCount: meta.eventCount,
    keyframeCount: meta.keyframeCount,
    bytes: meta.bytes,
  };
}

async function readDayEvents(serverId: string, day: string): Promise<HistoryEvent[]> {
  try {
    const raw = await fs.readFile(path.join(dirFor(serverId), `events-${day}.ndjson`), "utf8");
    const events: HistoryEvent[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as HistoryEvent);
      } catch {
        // skip a corrupt line
      }
    }
    return events;
  } catch {
    return [];
  }
}

function daysInRange(from: number, to: number): string[] {
  const days: string[] = [];
  const start = Date.parse(`${dayKey(from)}T00:00:00.000Z`);
  const end = Date.parse(`${dayKey(to)}T00:00:00.000Z`);
  for (let t = start; t <= end; t += DAY_MS) days.push(dayKey(t));
  return days;
}

export async function historyMarks(serverId: string, from: number, to: number): Promise<HistoryMark[]> {
  const marks: HistoryMark[] = [];
  for (const day of daysInRange(from, to)) {
    for (const event of await readDayEvents(serverId, day)) {
      if (event.t < from || event.t > to) continue;
      marks.push({
        t: event.t,
        rev: event.rev,
        added: event.added.length,
        updated: event.updated.length,
        removed: event.removed.length,
        entityCount: event.entityCount,
      });
    }
  }
  return marks;
}

export async function historyEvents(serverId: string, from: number, to: number): Promise<HistoryEvent[]> {
  const events: HistoryEvent[] = [];
  for (const day of daysInRange(from, to)) {
    for (const event of await readDayEvents(serverId, day)) {
      if (event.t < from || event.t > to) continue;
      events.push(event);
    }
  }
  return events;
}

async function loadKeyframe(
  serverId: string,
  entry: { t: number; file: string },
): Promise<{ t: number; rev: number; header: SaveHeaderInfo | null; entities: MapEntity[] } | null> {
  try {
    const raw = await fs.readFile(path.join(dirFor(serverId), entry.file), "utf8");
    return JSON.parse(raw) as { t: number; rev: number; header: SaveHeaderInfo | null; entities: MapEntity[] };
  } catch {
    return null;
  }
}

export async function snapshotAt(
  serverId: string,
  at: number,
): Promise<{ t: number; rev: number; header: SaveHeaderInfo | null; entities: MapEntity[] } | null> {
  const meta = await readMeta(serverId);
  if (meta.firstT == null) return null;
  const t = Math.min(Math.max(at, meta.firstT), meta.lastT ?? at);
  const keyframes = meta.keyframes.filter((entry) => entry.t <= t);
  const key = keyframes[keyframes.length - 1];
  if (!key) return null;
  const frame = await loadKeyframe(serverId, key);
  if (!frame) return null;
  let entities = new Map(frame.entities.map((entity) => [entity.id, entity]));
  let header = frame.header;
  let rev = frame.rev;
  let lastT = frame.t;
  for (const event of await historyEvents(serverId, frame.t + 1, t)) {
    entities = applyDelta(entities, event);
    header = event.header ?? header;
    rev = event.rev;
    lastT = event.t;
  }
  return { t: lastT, rev, header, entities: [...entities.values()] };
}

async function listHistoryIds(): Promise<string[]> {
  try {
    const names = await fs.readdir(HISTORY_DIR);
    const ids: string[] = [];
    for (const name of names) {
      if (name === DEMO_SERVER_ID) continue;
      try {
        const stat = await fs.stat(path.join(HISTORY_DIR, name));
        if (stat.isDirectory()) ids.push(name);
      } catch {
        // skip
      }
    }
    return ids;
  } catch {
    return [];
  }
}

async function peekFirstEventHeader(filePath: string): Promise<SaveHeaderInfo | null> {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      let collected = "";
      let offset = 0;
      const buf = Buffer.allocUnsafe(64 * 1024);
      while (collected.length < 8 * 1024 * 1024) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
        collected += buf.subarray(0, bytesRead).toString("utf8");
        const nl = collected.indexOf("\n");
        if (nl < 0) continue;
        const line = collected.slice(0, nl).trim();
        if (!line) {
          collected = collected.slice(nl + 1);
          continue;
        }
        const parsed = JSON.parse(line) as HistoryEvent;
        return parsed.header ?? null;
      }
      return null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export async function peekHistoryIdentity(serverId: string): Promise<HistoryIdentity> {
  const meta = await readMeta(serverId);
  const fromMeta = meta.identity ?? {};
  if (fromMeta.saveIdentifier || fromMeta.sessionName || fromMeta.savesDir) return fromMeta;
  const dir = dirFor(serverId);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return fromMeta;
  }
  const eventFiles = names.filter((name) => name.startsWith("events-") && name.endsWith(".ndjson")).sort().reverse();
  for (const name of eventFiles) {
    const header = await peekFirstEventHeader(path.join(dir, name));
    if (header?.saveIdentifier || header?.sessionName) {
      return mergeIdentity(fromMeta, {
        saveIdentifier: header.saveIdentifier,
        sessionName: header.sessionName,
        mapName: header.mapName,
      });
    }
  }
  return fromMeta;
}

function identitiesMatch(want: HistoryIdentity, have: HistoryIdentity): boolean {
  const wantKey = historyIdentityKey(want);
  const haveKey = historyIdentityKey(have);
  if (wantKey && haveKey && wantKey === haveKey) return true;
  if (want.savesDir && have.savesDir && sameFsPath(want.savesDir, have.savesDir)) return true;
  const wantSession = want.sessionName?.trim();
  const haveSession = have.sessionName?.trim();
  if (
    wantSession &&
    haveSession &&
    !unnamedSession(wantSession) &&
    wantSession.toLowerCase() === haveSession.toLowerCase()
  ) {
    const wantMap = (want.mapName?.trim() || "Persistent_Level").toLowerCase();
    const haveMap = (have.mapName?.trim() || "Persistent_Level").toLowerCase();
    if (wantMap === haveMap) return true;
  }
  return false;
}

export async function findOrphanHistoryId(opts: {
  savesDir: string;
  header: SaveHeaderInfo | null;
  catalogIds: Iterable<string>;
}): Promise<string | null> {
  const catalog = new Set(opts.catalogIds);
  const want: HistoryIdentity = {
    saveIdentifier: opts.header?.saveIdentifier,
    sessionName: opts.header?.sessionName,
    mapName: opts.header?.mapName,
    savesDir: opts.savesDir,
  };
  if (!historyIdentityKey(want) && !want.savesDir) return null;
  let best: { id: string; events: number } | null = null;
  for (const id of await listHistoryIds()) {
    if (catalog.has(id)) continue;
    const identity = await peekHistoryIdentity(id);
    if (!identitiesMatch(want, identity)) continue;
    const meta = await readMeta(id);
    if (!best || meta.eventCount > best.events) best = { id, events: meta.eventCount };
  }
  return best?.id ?? null;
}

async function mergeDayEvents(keeperId: string, sourceId: string, fileName: string): Promise<void> {
  const day = fileName.slice("events-".length, -".ndjson".length);
  const byT = new Map<number, HistoryEvent>();
  for (const event of [...(await readDayEvents(keeperId, day)), ...(await readDayEvents(sourceId, day))]) {
    const prev = byT.get(event.t);
    if (!prev || event.rev >= prev.rev) byT.set(event.t, event);
  }
  const merged = [...byT.values()].sort((a, b) => a.t - b.t);
  const dest = path.join(dirFor(keeperId), fileName);
  await fs.mkdir(dirFor(keeperId), { recursive: true });
  await fs.writeFile(dest, merged.map((event) => `${JSON.stringify(event)}\n`).join(""));
}

async function rebuildMetaFromDisk(serverId: string, identity?: HistoryIdentity): Promise<void> {
  const dir = dirFor(serverId);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  const keyframes: { t: number; file: string }[] = [];
  let eventCount = 0;
  let firstT: number | null = null;
  let lastT: number | null = null;
  let bytes = 0;
  for (const name of names) {
    if (name.endsWith(".tmp") || name === "meta.json") continue;
    const full = path.join(dir, name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    bytes += stat.size;
    const keyMatch = /^key-(\d+)\.json$/.exec(name);
    if (keyMatch) keyframes.push({ t: Number(keyMatch[1]), file: name });
  }
  keyframes.sort((a, b) => a.t - b.t);
  for (const name of names.filter((entry) => entry.startsWith("events-") && entry.endsWith(".ndjson")).sort()) {
    const day = name.slice("events-".length, -".ndjson".length);
    for (const event of await readDayEvents(serverId, day)) {
      eventCount += 1;
      firstT = firstT == null ? event.t : Math.min(firstT, event.t);
      lastT = lastT == null ? event.t : Math.max(lastT, event.t);
    }
  }
  const lastKeyframeT = keyframes.length ? keyframes[keyframes.length - 1].t : null;
  let eventsSinceKeyframe = 0;
  if (lastKeyframeT != null && lastT != null) {
    eventsSinceKeyframe = (await historyEvents(serverId, lastKeyframeT + 1, lastT)).length;
  }
  const prev = await readMeta(serverId);
  await writeMeta(serverId, {
    ...emptyMeta(),
    firstT,
    lastT,
    eventCount,
    keyframeCount: keyframes.length,
    bytes,
    lastKeyframeT,
    eventsSinceKeyframe,
    keyframes: keyframes.length > 400 ? keyframes.slice(-200) : keyframes,
    identity: mergeIdentity(prev.identity, identity),
  });
}

export async function mergeHistoryInto(keeperId: string, sourceIds: string[]): Promise<number> {
  const unique = [...new Set(sourceIds.map(safeId))].filter((id) => id && id !== safeId(keeperId));
  if (unique.length === 0) return 0;
  await fs.mkdir(dirFor(keeperId), { recursive: true });
  const keeperIdentity = await peekHistoryIdentity(keeperId);
  let merged = 0;
  for (const sourceId of unique) {
    const sourceDir = dirFor(sourceId);
    let names: string[];
    try {
      names = await fs.readdir(sourceDir);
    } catch {
      continue;
    }
    const sourceIdentity = await peekHistoryIdentity(sourceId);
    for (const name of names) {
      if (name.endsWith(".tmp") || name === "meta.json") continue;
      const from = path.join(sourceDir, name);
      const to = path.join(dirFor(keeperId), name);
      try {
        const stat = await fs.stat(from);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }
      if (name.startsWith("events-") && name.endsWith(".ndjson")) {
        await mergeDayEvents(keeperId, sourceId, name);
        await fs.unlink(from).catch(() => undefined);
        continue;
      }
      try {
        await fs.access(to);
        await fs.unlink(from).catch(() => undefined);
      } catch {
        await fs.rename(from, to);
      }
    }
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => undefined);
    merged += 1;
    logger.info("history folders merged", { keeperId, sourceId });
    await rebuildMetaFromDisk(keeperId, mergeIdentity(keeperIdentity, sourceIdentity));
  }
  if (merged > 0) {
    await rebuildMetaFromDisk(keeperId, keeperIdentity);
    await pruneKeyframesInDir(dirFor(keeperId), keeperId);
  }
  return merged;
}

export async function reclaimHistoryForServers(
  servers: { id: string; kind: string; savesDir: string }[],
  identities: Map<string, HistoryIdentity>,
): Promise<number> {
  const catalogIds = new Set(servers.map((server) => server.id));
  const folders = await listHistoryIds();
  const folderIdentities = new Map<string, HistoryIdentity>();
  for (const id of folders) {
    folderIdentities.set(id, await peekHistoryIdentity(id));
  }

  let merged = 0;
  for (const server of servers) {
    if (server.kind !== "watch") continue;
    const want = mergeIdentity(identities.get(server.id), { savesDir: server.savesDir });
    const sources: string[] = [];
    for (const id of folders) {
      if (id === server.id) continue;
      if (catalogIds.has(id) && id !== server.id) continue;
      const have = folderIdentities.get(id);
      if (!have) continue;
      if (identitiesMatch(want, have) || (have.savesDir && sameFsPath(have.savesDir, server.savesDir))) {
        sources.push(id);
      }
    }
    if (sources.length === 0) continue;
    merged += await mergeHistoryInto(server.id, sources);
    for (const id of sources) {
      catalogIds.delete(id);
      folderIdentities.delete(id);
    }
  }
  return merged;
}
