import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@/lib/log";
import { DEFAULT_SAVES_DIR, WorldHub } from "./hub";
import { normalizeFsPath } from "./save-io";
import {
  DEMO_SERVER_ID,
  nearestPollInterval,
  type ConfigPatch,
  type HubConfig,
  type ServerEntry,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export const DEMO_SERVER: ServerEntry = {
  id: DEMO_SERVER_ID,
  name: "Demo factory",
  kind: "demo",
  savesDir: "",
  saveFile: null,
};

function demoFirst(servers: ServerEntry[]): ServerEntry[] {
  const rest = servers.filter((server) => server.id !== DEMO_SERVER_ID);
  const demo = servers.find((server) => server.id === DEMO_SERVER_ID) ?? DEMO_SERVER;
  return [{ ...DEMO_SERVER, name: demo.name || DEMO_SERVER.name }, ...rest];
}

function newServerId(): string {
  return `srv-${Date.now().toString(36)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeEntry(raw: unknown): ServerEntry | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : newServerId();
  const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : "Server";
  if (id === DEMO_SERVER_ID || rec.kind === "demo") {
    return { id: DEMO_SERVER_ID, name, kind: "demo", savesDir: "", saveFile: null };
  }
  const savesDir =
    typeof rec.savesDir === "string" && rec.savesDir.trim()
      ? normalizeFsPath(rec.savesDir)
      : DEFAULT_SAVES_DIR;
  const saveFile =
    typeof rec.saveFile === "string" && rec.saveFile.trim() ? normalizeFsPath(rec.saveFile) : null;
  return { id, name, kind: "watch", savesDir, saveFile };
}

export function migrateConfig(raw: unknown): HubConfig {
  const rec = asRecord(raw) ?? {};
  const pollRaw = Number(rec.pollIntervalSeconds);
  const pollIntervalSeconds = nearestPollInterval(Number.isFinite(pollRaw) && pollRaw > 0 ? pollRaw : 15);

  if (Array.isArray(rec.servers)) {
    const servers = rec.servers.map(normalizeEntry).filter((entry): entry is ServerEntry => entry != null);
    return { pollIntervalSeconds, servers: demoFirst(servers) };
  }

  const servers: ServerEntry[] = [DEMO_SERVER];
  const savesDir = typeof rec.savesDir === "string" ? rec.savesDir.trim() : "";
  const saveFile = typeof rec.saveFile === "string" && rec.saveFile.trim() ? rec.saveFile : null;
  const mode = rec.mode === "watch" || rec.mode === "demo" ? rec.mode : null;
  const normalizedDir = savesDir ? normalizeFsPath(savesDir) : "";
  const keepWatch =
    mode === "watch" ||
    Boolean(saveFile) ||
    (normalizedDir && normalizedDir !== DEFAULT_SAVES_DIR);
  if (keepWatch) {
    servers.push({
      id: "dedicated",
      name: "Dedicated server",
      kind: "watch",
      savesDir: normalizedDir || DEFAULT_SAVES_DIR,
      saveFile: saveFile ? normalizeFsPath(saveFile) : null,
    });
  }
  return { pollIntervalSeconds, servers: demoFirst(servers) };
}

function applyEnvOverlay(config: HubConfig): HubConfig {
  const next: HubConfig = {
    pollIntervalSeconds: config.pollIntervalSeconds,
    servers: config.servers.map((server) => ({ ...server })),
  };
  const pollRaw = process.env.FICSIT_POLL_SECONDS;
  if (pollRaw) {
    const poll = Number(pollRaw);
    if (Number.isFinite(poll) && poll > 0) next.pollIntervalSeconds = nearestPollInterval(poll);
  }

  const dir = process.env.FICSIT_SAVES_DIR?.trim();
  const file = process.env.FICSIT_SAVE_FILE?.trim();
  const mode = process.env.FICSIT_MODE?.trim().toLowerCase();
  if (dir || file || mode === "watch") {
    const savesDir = dir ? normalizeFsPath(dir) : next.servers.find((s) => s.kind === "watch")?.savesDir ?? DEFAULT_SAVES_DIR;
    const saveFile = file ? normalizeFsPath(file) : null;
    const existing = next.servers.find(
      (server) => server.kind === "watch" && server.savesDir === savesDir && (saveFile ? server.saveFile === saveFile : true),
    );
    if (existing) {
      if (saveFile) existing.saveFile = saveFile;
    } else {
      const sameDir = next.servers.find((server) => server.kind === "watch" && server.savesDir === savesDir);
      if (sameDir && saveFile) {
        sameDir.saveFile = saveFile;
      } else if (!next.servers.some((server) => server.kind === "watch" && server.savesDir === savesDir)) {
        next.servers.push({
          id: next.servers.some((server) => server.id === "dedicated") ? newServerId() : "dedicated",
          name: "Dedicated server",
          kind: "watch",
          savesDir,
          saveFile,
        });
      }
    }
  }
  next.servers = demoFirst(next.servers);
  return next;
}

export class HubRegistry {
  private config: HubConfig = { pollIntervalSeconds: 15, servers: [DEMO_SERVER] };
  private hubs = new Map<string, WorldHub>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.bootstrap();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  getConfig(): HubConfig {
    return {
      pollIntervalSeconds: this.config.pollIntervalSeconds,
      servers: this.config.servers.map((server) => ({ ...server })),
    };
  }

  getHub(serverId?: string | null): WorldHub {
    const requested = serverId?.trim();
    if (requested) {
      const hub = this.hubs.get(requested);
      if (hub) return hub;
      logger.warn("unknown server id; using demo", { requested });
    }
    const fallback = this.hubs.get(DEMO_SERVER_ID);
    if (!fallback) throw new Error("World hubs are not ready");
    return fallback;
  }

  hasServer(serverId: string): boolean {
    return this.config.servers.some((server) => server.id === serverId);
  }

  async update(patch: ConfigPatch): Promise<{ config: HubConfig; added?: ServerEntry }> {
    let added: ServerEntry | undefined;
    if (patch.pollIntervalSeconds != null) {
      this.config.pollIntervalSeconds = nearestPollInterval(patch.pollIntervalSeconds);
      for (const hub of this.hubs.values()) hub.setPollInterval(this.config.pollIntervalSeconds);
    }
    if (patch.addServer) {
      added = await this.addServer(patch.addServer);
    }
    if (patch.updateServer) {
      await this.updateServer(patch.updateServer);
    }
    if (patch.removeServerId) {
      await this.removeServer(patch.removeServerId);
    }
    await this.persist();
    logger.info("catalog updated", {
      poll: this.config.pollIntervalSeconds,
      servers: this.config.servers.map((server) => ({ id: server.id, kind: server.kind, name: server.name })),
    });
    return { config: this.getConfig(), added };
  }

  async ingestUpload(serverId: string | null, fileName: string, bytes: Buffer): Promise<string> {
    let targetId = serverId?.trim() || DEMO_SERVER_ID;
    if (!this.hasServer(targetId) || targetId === DEMO_SERVER_ID) {
      const created = await this.addServer({
        name: fileName.replace(/\.sav$/i, "") || "Uploaded save",
        savesDir: path.join(process.cwd(), "data", "uploads"),
      });
      targetId = created.id;
    }
    const hub = this.getHub(targetId);
    await hub.ingestUpload(fileName, bytes);
    const entry = hub.getEntry();
    this.config.servers = this.config.servers.map((server) => (server.id === entry.id ? entry : server));
    await this.persist();
    return targetId;
  }

  private async addServer(input: { name: string; savesDir: string; saveFile?: string | null }): Promise<ServerEntry> {
    const name = input.name.trim() || `Server ${this.config.servers.length}`;
    const entry: ServerEntry = {
      id: newServerId(),
      name,
      kind: "watch",
      savesDir: normalizeFsPath(input.savesDir || DEFAULT_SAVES_DIR),
      saveFile: input.saveFile?.trim() ? normalizeFsPath(input.saveFile) : null,
    };
    this.config.servers = demoFirst([...this.config.servers, entry]);
    this.hubs.set(entry.id, new WorldHub(entry, this.config.pollIntervalSeconds));
    await this.hubs.get(entry.id)!.whenReady();
    return entry;
  }

  private async updateServer(patch: { id: string; name?: string; savesDir?: string; saveFile?: string | null }): Promise<void> {
    const index = this.config.servers.findIndex((server) => server.id === patch.id);
    if (index < 0) throw new Error(`Unknown server ${patch.id}`);
    const current = this.config.servers[index];
    if (current.kind === "demo") {
      if (patch.name?.trim()) current.name = patch.name.trim();
      this.config.servers[index] = { ...current };
      this.hubs.get(current.id)?.applyEntry(this.config.servers[index]);
      return;
    }
    const next: ServerEntry = {
      ...current,
      name: patch.name?.trim() || current.name,
      savesDir: patch.savesDir?.trim() ? normalizeFsPath(patch.savesDir) : current.savesDir,
      saveFile: patch.saveFile === undefined ? current.saveFile : patch.saveFile?.trim() ? normalizeFsPath(patch.saveFile) : null,
    };
    this.config.servers[index] = next;
    this.hubs.get(next.id)?.applyEntry(next);
  }

  private async removeServer(id: string): Promise<void> {
    if (id === DEMO_SERVER_ID) throw new Error("Demo factory cannot be removed");
    this.config.servers = this.config.servers.filter((server) => server.id !== id);
    const hub = this.hubs.get(id);
    hub?.dispose();
    this.hubs.delete(id);
  }

  private async bootstrap(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    let loaded: unknown = null;
    try {
      loaded = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
    } catch {
      loaded = null;
    }
    this.config = applyEnvOverlay(migrateConfig(loaded));
    await this.persist();
    logger.info("server catalog loaded", {
      poll: this.config.pollIntervalSeconds,
      servers: this.config.servers.map((server) => server.id),
    });
    for (const entry of this.config.servers) {
      this.hubs.set(entry.id, new WorldHub(entry, this.config.pollIntervalSeconds));
    }
    await Promise.all([...this.hubs.values()].map((hub) => hub.whenReady()));
  }

  private async persist(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }
}

export function getRegistry(): HubRegistry {
  const globalRef = globalThis as typeof globalThis & { __ficsitRegistry?: HubRegistry };
  if (!globalRef.__ficsitRegistry) {
    globalRef.__ficsitRegistry = new HubRegistry();
  }
  return globalRef.__ficsitRegistry;
}

export async function hubForRequest(request: Request): Promise<WorldHub> {
  const registry = getRegistry();
  await registry.whenReady();
  return registry.getHub(serverIdFromRequest(request));
}

export function serverIdFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("server");
}
