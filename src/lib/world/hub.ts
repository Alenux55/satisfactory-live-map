import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { countCategories, diffWorld } from "./diff";
import { buildDemoWorld, DEMO_HEADER } from "./demo";
import { parseSaveAsync } from "./parse-async";
import { logger, memorySnapshot } from "@/lib/log";
import {
  isTransientFsError,
  newestWatchableSave,
  normalizeFsPath,
  readSaveCopy,
  sleepMs,
  STAGING_DIR,
} from "./save-io";
import {
  EMPTY_COUNTS,
  nearestPollInterval,
  type HubStatus,
  type MapEntity,
  type SaveHeaderInfo,
  type ServerEntry,
  type WorldDelta,
  type WorldSnapshot,
  type WorldSource,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const DEFAULT_SAVES_DIR = path.join(DATA_DIR, "saves");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Listener = (event: string, data: unknown) => void;

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function toMap(entities: MapEntity[]): Map<string, MapEntity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

export class WorldHub {
  private entities = new Map<string, MapEntity>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private folderWatcher: FSWatcher | null = null;
  private watchDebounce: ReturnType<typeof setTimeout> | null = null;
  private folderWatch = false;
  private busy = false;
  private demoTick = 8;
  private lastHash = "";
  private lastFailedHash = "";
  private lastSize = 0;
  private lastMtime = 0;
  private entry: ServerEntry;
  private pollIntervalSeconds: number;
  private header: SaveHeaderInfo | null = { ...DEMO_HEADER };
  private source: WorldSource | null = null;
  private rev = 0;
  private status: HubStatus["status"] = "idle";
  private progress = 1;
  private progressMessage = "Demo factory loaded";
  private error: string | null = null;
  private lastTickAt: number | null = null;
  private lastChangeAt: number | null = null;
  private skippedUnchanged = false;
  private lastDelta: HubStatus["lastDelta"] = null;
  private ready: Promise<void>;

  constructor(entry: ServerEntry, pollIntervalSeconds: number) {
    this.entry = { ...entry };
    this.pollIntervalSeconds = nearestPollInterval(pollIntervalSeconds);
    logger.info("world hub created", {
      pid: process.pid,
      serverId: entry.id,
      kind: entry.kind,
      ...memorySnapshot(),
    });
    this.ready = this.bootstrap();
  }

  async whenReady(): Promise<void> {
    const started = Date.now();
    await this.ready;
    const waited = Date.now() - started;
    if (waited > 50) logger.debug("whenReady waited", { ms: waited, status: this.status });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    logger.debug("sse client subscribed", { clients: this.listeners.size });
    listener("status", this.getStatus());
    return () => {
      this.listeners.delete(listener);
      logger.debug("sse client left", { clients: this.listeners.size });
    };
  }

  getSnapshot(): WorldSnapshot {
    const entities = [...this.entities.values()];
    return {
      rev: this.rev,
      entities,
      header: this.header,
      counts: countCategories(entities),
      source: this.source ?? {
        kind: "demo",
        name: "demo",
        sizeBytes: 0,
        hash: "demo",
        mtimeMs: Date.now(),
      },
      parsedMs: this.lastDelta?.parsedMs ?? 0,
      entityCount: entities.length,
    };
  }

  getStatus(): HubStatus {
    return {
      rev: this.rev,
      status: this.status,
      progress: this.progress,
      progressMessage: this.progressMessage,
      error: this.error,
      mode: this.entry.kind,
      pollIntervalSeconds: this.pollIntervalSeconds,
      savesDir: this.entry.savesDir,
      saveFile: this.entry.saveFile,
      lastTickAt: this.lastTickAt,
      lastChangeAt: this.lastChangeAt,
      skippedUnchanged: this.skippedUnchanged,
      folderWatch: this.folderWatch,
      source: this.source,
      counts: this.entities.size ? countCategories(this.entities.values()) : { ...EMPTY_COUNTS },
      entityCount: this.entities.size,
      header: this.header,
      lastDelta: this.lastDelta,
      serverId: this.entry.id,
      serverName: this.entry.name,
    };
  }

  getEntry(): ServerEntry {
    return { ...this.entry };
  }

  setPollInterval(seconds: number): void {
    this.pollIntervalSeconds = nearestPollInterval(seconds);
    this.restartTimer();
  }

  applyEntry(entry: ServerEntry): void {
    const pathChanged =
      entry.kind !== this.entry.kind ||
      entry.savesDir !== this.entry.savesDir ||
      entry.saveFile !== this.entry.saveFile;
    this.entry = { ...entry };
    if (pathChanged) {
      this.lastHash = "";
      this.lastFailedHash = "";
      this.lastSize = 0;
      this.lastMtime = 0;
      this.restartFolderWatch();
      void this.tick();
    }
    this.emit("status", this.getStatus());
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.watchDebounce) clearTimeout(this.watchDebounce);
    this.watchDebounce = null;
    this.folderWatcher?.close();
    this.folderWatcher = null;
    this.listeners.clear();
  }

  async ingestUpload(fileName: string, bytes: Buffer): Promise<void> {
    if (this.entry.kind === "demo") {
      throw new Error("Upload a save onto a watchable server, or add a new save location first");
    }
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const safe = fileName.replace(/[^\w.\- ]+/g, "_") || "upload.sav";
    const dest = path.join(UPLOADS_DIR, this.entry.id.replace(/[^\w.-]+/g, "_"), safe);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, bytes);
    this.entry.kind = "watch";
    this.entry.saveFile = dest;
    this.lastHash = "";
    this.lastFailedHash = "";
    this.lastSize = 0;
    this.lastMtime = 0;
    this.restartTimer();
    this.restartFolderWatch();
    await this.commitFromBuffer(safe, bytes, dest, Date.now(), "upload");
  }

  async tick(): Promise<void> {
    if (this.busy) {
      logger.debug("tick skipped; already busy", { status: this.status, serverId: this.entry.id, mode: this.entry.kind });
      return;
    }
    this.busy = true;
    this.lastTickAt = Date.now();
    logger.debug("tick start", { serverId: this.entry.id, mode: this.entry.kind, poll: this.pollIntervalSeconds });
    try {
      if (this.entry.kind === "demo") {
        this.tickDemo();
      } else {
        await this.tickWatch();
      }
      logger.debug("tick end", { status: this.status, skipped: this.skippedUnchanged, rev: this.rev });
    } catch (error) {
      this.status = "error";
      this.error = error instanceof Error ? error.message : "Unknown error";
      this.progressMessage = this.error;
      logger.error("tick failed", { err: this.error });
      this.emit("status", this.getStatus());
    } finally {
      this.busy = false;
    }
  }

  private async bootstrap(): Promise<void> {
    await fs.mkdir(DEFAULT_SAVES_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(STAGING_DIR, { recursive: true });
    if (this.entry.kind === "demo") {
      this.commitEntities(
        buildDemoWorld(this.demoTick),
        { ...DEMO_HEADER },
        {
          kind: "demo",
          name: this.entry.name,
          sizeBytes: 0,
          hash: `demo-${this.demoTick}`,
          mtimeMs: Date.now(),
        },
        0,
      );
      this.status = "ready";
    } else {
      await this.tick();
    }
    this.restartTimer();
    this.restartFolderWatch();
  }

  private tickDemo(): void {
    this.demoTick += 1;
    const started = Date.now();
    this.commitEntities(
      buildDemoWorld(this.demoTick),
      { ...DEMO_HEADER, playDurationSeconds: 60 * 47 + this.demoTick * 15 },
      {
        kind: "demo",
        name: this.entry.name,
        sizeBytes: 0,
        hash: `demo-${this.demoTick}`,
        mtimeMs: Date.now(),
      },
      Date.now() - started,
    );
    this.status = "ready";
    this.progress = 1;
    this.progressMessage = `Demo factory tick ${this.demoTick}`;
    this.error = null;
    this.emit("status", this.getStatus());
  }

  private async tickWatch(): Promise<void> {
    const file = await this.resolveSaveFile();
    if (!file) {
      this.status = "waiting";
      try {
        await fs.access(this.entry.savesDir);
        this.progressMessage = this.entry.saveFile
          ? `Pinned save not found: ${this.entry.saveFile}`
          : `Watching ${this.entry.savesDir} for a .sav file`;
        logger.info("watch: no save yet", { dir: this.entry.savesDir, saveFile: this.entry.saveFile });
      } catch {
        this.progressMessage = `Save folder not found: ${this.entry.savesDir}`;
        logger.warn("watch: save folder missing", { dir: this.entry.savesDir });
      }
      this.emit("status", this.getStatus());
      return;
    }
    let stat;
    try {
      stat = await fs.stat(file);
    } catch (error) {
      if (isTransientFsError(error)) {
        this.status = "waiting";
        this.progressMessage = `Save is locked by the dedicated server (${path.basename(file)}) — will retry`;
        logger.info("watch: save locked on stat", { file });
        this.emit("status", this.getStatus());
        return;
      }
      throw error;
    }
    if (stat.size === this.lastSize && stat.mtimeMs === this.lastMtime && this.rev > 0) {
      this.skippedUnchanged = true;
      this.progress = 1;
      if (this.lastFailedHash) {
        this.status = "error";
        this.progressMessage = "Last parse failed; waiting for the next save write";
      } else {
        this.status = "ready";
        this.progressMessage = "Save unchanged — skipped parse";
        logger.debug("watch: size/mtime unchanged, skip parse", {
          file,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
        this.emit("heartbeat", { rev: this.rev, skipped: true, at: Date.now() });
      }
      this.emit("status", this.getStatus());
      return;
    }
    this.status = "hashing";
    this.progress = 0.05;
    this.progressMessage = `Reading ${path.basename(file)} (${(stat.size / (1024 * 1024)).toFixed(1)} MB)`;
    this.emit("status", this.getStatus());

    let read = await readSaveCopy(file);
    const giveUp = Date.now() + 10_000;
    while (!read.ok && (read.reason === "writing" || read.reason === "locked") && Date.now() < giveUp) {
      this.status = "waiting";
      this.progressMessage = read.message;
      this.emit("status", this.getStatus());
      logger.debug("watch: waiting for save write", { file, reason: read.reason });
      await sleepMs(500);
      read = await readSaveCopy(file);
    }
    if (!read.ok) {
      this.status = "waiting";
      this.progressMessage = read.message;
      this.error = null;
      this.emit("status", this.getStatus());
      logger.warn("watch: could not read save", { file, reason: read.reason, message: read.message });
      return;
    }

    const hash = sha256(read.bytes);
    if (hash === this.lastHash && this.rev > 0) {
      this.lastSize = read.size;
      this.lastMtime = read.mtimeMs;
      this.lastFailedHash = "";
      this.skippedUnchanged = true;
      this.status = "ready";
      this.progress = 1;
      this.progressMessage = "Save hash unchanged — skipped parse";
      logger.info("watch: hash unchanged, skip parse", { file, hash: hash.slice(0, 12), size: read.size });
      this.emit("heartbeat", { rev: this.rev, skipped: true, at: Date.now() });
      this.emit("status", this.getStatus());
      return;
    }
    if (hash === this.lastFailedHash) {
      this.lastSize = read.size;
      this.lastMtime = read.mtimeMs;
      this.status = "error";
      this.progressMessage = "Save hash unchanged after a failed parse — waiting for a new write";
      logger.warn("watch: not retrying failed hash", { file, hash: hash.slice(0, 12) });
      this.emit("status", this.getStatus());
      return;
    }

    try {
      await this.commitFromBuffer(path.basename(file), read.bytes, file, read.mtimeMs, "watch");
      this.lastSize = read.size;
      this.lastMtime = read.mtimeMs;
      this.lastFailedHash = "";
    } catch (error) {
      this.lastSize = read.size;
      this.lastMtime = read.mtimeMs;
      this.lastFailedHash = hash;
      throw error;
    }
  }

  private async commitFromBuffer(
    name: string,
    bytes: Buffer,
    filePath: string,
    mtimeMs: number,
    kind: WorldSource["kind"],
  ): Promise<void> {
    const hash = sha256(bytes);
    this.status = "parsing";
    this.progress = 0.1;
    this.progressMessage = `Parsing ${name}`;
    this.skippedUnchanged = false;
    this.emit("status", this.getStatus());
    logger.info("parse begin", {
      name,
      kind,
      mb: Number((bytes.byteLength / (1024 * 1024)).toFixed(2)),
      ...memorySnapshot(),
    });
    const started = Date.now();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    let lastStatusEmit = 0;
    let lastLoggedBucket = -1;
    const parsed = await parseSaveAsync(name, copy as ArrayBuffer, (progress, message) => {
      this.progress = 0.1 + progress * 0.85;
      this.progressMessage = message || `Parsing ${name}`;
      const bucket = Math.floor(progress * 10);
      if (bucket !== lastLoggedBucket) {
        lastLoggedBucket = bucket;
        logger.debug(`parse ${name} ${Math.round(progress * 100)}%`, { message });
      }
      const now = Date.now();
      if (now - lastStatusEmit >= 250 || progress >= 1) {
        lastStatusEmit = now;
        this.emit("status", this.getStatus());
      }
    });
    logger.info("parse extract complete", {
      name,
      ms: Date.now() - started,
      entities: parsed.entities.length,
      session: parsed.header.sessionName,
      ...memorySnapshot(),
    });
    if (this.rev > 0 && this.entities.size > 20 && parsed.entities.length === 0) {
      throw new Error(`Parse of ${name} produced no buildings; treating as an incomplete write`);
    }
    this.lastHash = hash;
    this.commitEntities(
      parsed.entities,
      parsed.header,
      {
        kind,
        name: filePath,
        sizeBytes: bytes.byteLength,
        hash,
        mtimeMs,
      },
      Date.now() - started,
    );
    this.status = "ready";
    this.progress = 1;
    this.progressMessage = `Live from ${name}`;
    this.error = null;
    logger.info("parse committed", { name, rev: this.rev, entities: this.entities.size, ...memorySnapshot() });
    this.emit("status", this.getStatus());
  }

  private commitEntities(
    list: MapEntity[],
    header: SaveHeaderInfo,
    source: WorldSource,
    parsedMs: number,
  ): void {
    const next = toMap(list);
    const diff = diffWorld(this.entities, next);
    const changed = diff.added.length + diff.updated.length + diff.removed.length > 0;
    this.entities = next;
    this.header = header;
    this.source = source;
    if (!changed && this.rev > 0) {
      this.skippedUnchanged = true;
      this.lastDelta = { added: 0, updated: 0, removed: 0, parsedMs };
      logger.debug("delta empty after parse", { parsedMs, entities: list.length });
      return;
    }
    const fromRev = this.rev;
    this.rev += 1;
    this.lastChangeAt = Date.now();
    this.skippedUnchanged = false;
    this.lastDelta = {
      added: diff.added.length,
      updated: diff.updated.length,
      removed: diff.removed.length,
      parsedMs,
    };
    logger.info("delta", {
      fromRev,
      rev: this.rev,
      added: this.lastDelta.added,
      updated: this.lastDelta.updated,
      removed: this.lastDelta.removed,
      parsedMs,
      entities: this.entities.size,
    });
    const payload: WorldDelta = {
      rev: this.rev,
      fromRev,
      added: diff.added,
      updated: diff.updated,
      removed: diff.removed,
      header,
      counts: countCategories(this.entities.values()),
      source,
      parsedMs,
      skipped: false,
      entityCount: this.entities.size,
    };
    this.emit("delta", payload);
  }

  private async resolveSaveFile(): Promise<string | null> {
    if (this.entry.saveFile) {
      try {
        await fs.access(this.entry.saveFile);
        return this.entry.saveFile;
      } catch {
        return null;
      }
    }
    try {
      return await newestWatchableSave(this.entry.savesDir);
    } catch {
      return null;
    }
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalSeconds * 1000);
    this.timer.unref?.();
    logger.info("poll timer set", { serverId: this.entry.id, seconds: this.pollIntervalSeconds });
  }

  private restartFolderWatch(): void {
    if (this.watchDebounce) {
      clearTimeout(this.watchDebounce);
      this.watchDebounce = null;
    }
    this.folderWatcher?.close();
    this.folderWatcher = null;
    this.folderWatch = false;
    if (this.entry.kind !== "watch") return;
    const dir = this.entry.saveFile ? path.dirname(this.entry.saveFile) : this.entry.savesDir;
    try {
      this.folderWatcher = watch(dir, (event, filename) => {
        const name = filename?.toString() ?? "";
        logger.debug("fs.watch", { event, file: name, dir, serverId: this.entry.id });
        if (this.watchDebounce) clearTimeout(this.watchDebounce);
        this.watchDebounce = setTimeout(() => {
          this.watchDebounce = null;
          void this.tick();
        }, 800);
      });
      this.folderWatcher.unref?.();
      this.folderWatch = true;
      logger.info("fs.watch started", { dir, serverId: this.entry.id });
    } catch (error) {
      logger.warn("fs.watch unavailable; poll only", {
        dir,
        serverId: this.entry.id,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emit(event: string, data: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // Drop a broken SSE client without taking down the hub.
      }
    }
  }
}

