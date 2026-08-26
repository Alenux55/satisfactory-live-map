import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { countCategories, diffWorld } from "./diff";
import { buildDemoWorld, DEMO_HEADER } from "./demo";
import { parseSaveBuffer } from "./extract";
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
  type HubConfig,
  type HubStatus,
  type MapEntity,
  type SaveHeaderInfo,
  type WorldDelta,
  type WorldSnapshot,
  type WorldSource,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const DEFAULT_SAVES_DIR = path.join(DATA_DIR, "saves");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

type Listener = (event: string, data: unknown) => void;

const DEFAULT_CONFIG: HubConfig = {
  mode: "demo",
  pollIntervalSeconds: 15,
  savesDir: DEFAULT_SAVES_DIR,
  saveFile: null,
};

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
  private busy = false;
  private demoTick = 8;
  private lastHash = "";
  private lastFailedHash = "";
  private lastSize = 0;
  private lastMtime = 0;
  private config: HubConfig = { ...DEFAULT_CONFIG };
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

  constructor() {
    this.ready = this.bootstrap();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener("status", this.getStatus());
    return () => {
      this.listeners.delete(listener);
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
      mode: this.config.mode,
      pollIntervalSeconds: this.config.pollIntervalSeconds,
      savesDir: this.config.savesDir,
      saveFile: this.config.saveFile,
      lastTickAt: this.lastTickAt,
      lastChangeAt: this.lastChangeAt,
      skippedUnchanged: this.skippedUnchanged,
      source: this.source,
      counts: this.entities.size ? countCategories(this.entities.values()) : { ...EMPTY_COUNTS },
      entityCount: this.entities.size,
      header: this.header,
      lastDelta: this.lastDelta,
    };
  }

  getConfig(): HubConfig {
    return { ...this.config };
  }

  async updateConfig(patch: Partial<HubConfig>): Promise<HubConfig> {
    if (patch.pollIntervalSeconds != null) {
      this.config.pollIntervalSeconds = nearestPollInterval(patch.pollIntervalSeconds);
    }
    if (patch.savesDir != null && patch.savesDir.trim()) {
      this.config.savesDir = normalizeFsPath(patch.savesDir);
    }
    if (patch.saveFile !== undefined) {
      this.config.saveFile = patch.saveFile?.trim() ? normalizeFsPath(patch.saveFile) : null;
    }
    if (patch.mode && patch.mode !== this.config.mode) {
      this.config.mode = patch.mode;
      this.lastHash = "";
      this.lastFailedHash = "";
      this.lastSize = 0;
      this.lastMtime = 0;
    }
    await this.persistConfig();
    this.restartTimer();
    this.emit("status", this.getStatus());
    void this.tick();
    return this.getConfig();
  }

  async ingestUpload(fileName: string, bytes: Buffer): Promise<void> {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const safe = fileName.replace(/[^\w.\- ]+/g, "_") || "upload.sav";
    const dest = path.join(UPLOADS_DIR, safe);
    await fs.writeFile(dest, bytes);
    this.config.mode = "watch";
    this.config.saveFile = dest;
    this.lastHash = "";
    this.lastFailedHash = "";
    this.lastSize = 0;
    this.lastMtime = 0;
    await this.persistConfig();
    this.restartTimer();
    await this.commitFromBuffer(safe, bytes, dest, Date.now(), "upload");
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.lastTickAt = Date.now();
    try {
      if (this.config.mode === "demo") {
        this.tickDemo();
      } else {
        await this.tickWatch();
      }
    } catch (error) {
      this.status = "error";
      this.error = error instanceof Error ? error.message : "Unknown error";
      this.progressMessage = this.error;
      this.emit("status", this.getStatus());
    } finally {
      this.busy = false;
    }
  }

  private async bootstrap(): Promise<void> {
    await fs.mkdir(DEFAULT_SAVES_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(STAGING_DIR, { recursive: true });
    await this.loadConfig();
    if (this.config.mode === "demo") {
      this.commitEntities(
        buildDemoWorld(this.demoTick),
        { ...DEMO_HEADER },
        {
          kind: "demo",
          name: "Grass Fields demo",
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
  }

  private tickDemo(): void {
    this.demoTick += 1;
    const started = Date.now();
    this.commitEntities(
      buildDemoWorld(this.demoTick),
      { ...DEMO_HEADER, playDurationSeconds: 60 * 47 + this.demoTick * 15 },
      {
        kind: "demo",
        name: "Grass Fields demo",
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
        await fs.access(this.config.savesDir);
        this.progressMessage = this.config.saveFile
          ? `Pinned save not found: ${this.config.saveFile}`
          : `Watching ${this.config.savesDir} for a .sav file`;
      } catch {
        this.progressMessage = `Save folder not found: ${this.config.savesDir}`;
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
      await sleepMs(500);
      read = await readSaveCopy(file);
    }
    if (!read.ok) {
      this.status = "waiting";
      this.progressMessage = read.message;
      this.error = null;
      this.emit("status", this.getStatus());
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
      this.emit("heartbeat", { rev: this.rev, skipped: true, at: Date.now() });
      this.emit("status", this.getStatus());
      return;
    }
    if (hash === this.lastFailedHash) {
      this.lastSize = read.size;
      this.lastMtime = read.mtimeMs;
      this.status = "error";
      this.progressMessage = "Save hash unchanged after a failed parse — waiting for a new write";
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
    const started = Date.now();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const parsed = parseSaveBuffer(name, copy as ArrayBuffer, (progress, message) => {
      this.progress = 0.1 + progress * 0.85;
      this.progressMessage = message || `Parsing ${name}`;
      this.emit("status", this.getStatus());
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
    if (this.config.saveFile) {
      try {
        await fs.access(this.config.saveFile);
        return this.config.saveFile;
      } catch {
        return null;
      }
    }
    try {
      return await newestWatchableSave(this.config.savesDir);
    } catch {
      return null;
    }
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.pollIntervalSeconds * 1000);
    this.timer.unref?.();
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

  private applyEnvOverlay(): boolean {
    const mode = process.env.FICSIT_MODE?.trim().toLowerCase();
    const dir = process.env.FICSIT_SAVES_DIR;
    const file = process.env.FICSIT_SAVE_FILE;
    const pollRaw = process.env.FICSIT_POLL_SECONDS;
    let touched = false;
    if (mode === "demo" || mode === "watch") {
      this.config.mode = mode;
      touched = true;
    }
    if (dir?.trim()) {
      this.config.savesDir = normalizeFsPath(dir);
      if (mode !== "demo" && mode !== "watch") this.config.mode = "watch";
      touched = true;
    }
    if (file?.trim()) {
      this.config.saveFile = normalizeFsPath(file);
      if (mode !== "demo" && mode !== "watch") this.config.mode = "watch";
      touched = true;
    }
    if (pollRaw) {
      const poll = Number(pollRaw);
      if (Number.isFinite(poll) && poll > 0) {
        this.config.pollIntervalSeconds = nearestPollInterval(poll);
        touched = true;
      }
    }
    return touched;
  }

  private async loadConfig(): Promise<void> {
    try {
      const raw = await fs.readFile(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<HubConfig>;
      this.config = { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
    if (this.config.savesDir) this.config.savesDir = normalizeFsPath(this.config.savesDir);
    if (this.config.saveFile) this.config.saveFile = normalizeFsPath(this.config.saveFile);
    if (this.applyEnvOverlay()) await this.persistConfig();
  }

  private async persistConfig(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }
}

export function getWorldHub(): WorldHub {
  const globalRef = globalThis as typeof globalThis & { __satisfactoryLiveMap?: WorldHub };
  if (!globalRef.__satisfactoryLiveMap) {
    globalRef.__satisfactoryLiveMap = new WorldHub();
  }
  return globalRef.__satisfactoryLiveMap;
}
