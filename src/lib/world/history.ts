import { promises as fs } from "node:fs";
import path from "node:path";
import { applyDelta } from "./diff";
import { logger } from "@/lib/log";
import type { HistoryEvent, HistoryMark, HistoryMeta, MapEntity, SaveHeaderInfo } from "./types";

const HISTORY_DIR = path.join(process.cwd(), "data", "history");
const DAY_MS = 24 * 60 * 60 * 1000;
const KEYFRAME_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const KEYFRAME_MAX_EVENTS = 400;

type StoredMeta = HistoryMeta & {
  version: 1;
  lastKeyframeT: number | null;
  eventsSinceKeyframe: number;
  keyframes: { t: number; file: string }[];
};

type PersistInput = {
  serverId: string;
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

function needKeyframe(meta: StoredMeta, t: number, fromRev: number): boolean {
  if (fromRev === 0 || meta.lastKeyframeT == null) return true;
  if (dayKey(t) !== dayKey(meta.lastKeyframeT)) return true;
  if (t - meta.lastKeyframeT >= KEYFRAME_MAX_AGE_MS) return true;
  return meta.eventsSinceKeyframe >= KEYFRAME_MAX_EVENTS;
}

export function persistHistory(input: PersistInput): void {
  enqueue(input.serverId, () => persistHistoryNow(input));
}

async function persistHistoryNow(input: PersistInput): Promise<void> {
  const meta = await readMeta(input.serverId);
  const writeKey = needKeyframe(meta, input.t, input.fromRev);
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
    if (meta.keyframes.length > 400) meta.keyframes = meta.keyframes.slice(-200);
  } else {
    meta.eventsSinceKeyframe += 1;
  }
  meta.firstT = meta.firstT ?? input.t;
  meta.lastT = input.t;
  meta.eventCount += 1;
  meta.bytes += extraBytes;
  await writeMeta(input.serverId, meta);
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
