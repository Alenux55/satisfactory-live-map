export const POLL_INTERVALS_SEC = [5, 10, 15, 30, 45, 60, 120, 180, 300, 600] as const;

export function nearestPollInterval(seconds: number): (typeof POLL_INTERVALS_SEC)[number] {
  return POLL_INTERVALS_SEC.reduce((best, value) =>
    Math.abs(value - seconds) < Math.abs(best - seconds) ? value : best,
  );
}

export type WorldMode = "demo" | "watch";

export const DEMO_SERVER_ID = "demo";

export type ServerEntry = {
  id: string;
  name: string;
  kind: WorldMode;
  savesDir: string;
  saveFile: string | null;
};

export type ConfigPatch = {
  pollIntervalSeconds?: number;
  addServer?: { name: string; savesDir: string; saveFile?: string | null };
  updateServer?: { id: string; name?: string; savesDir?: string; saveFile?: string | null };
  removeServerId?: string;
};

export type EntityCategory =
  | "special"
  | "production"
  | "power"
  | "logistics"
  | "organization"
  | "foundations"
  | "walls"
  | "architecture"
  | "transport"
  | "resource"
  | "player"
  | "crates"
  | "other";

export type Point = [number, number];

export type MapEntity = {
  id: string;
  type: string;
  category: EntityCategory;
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  recipe?: string;
  label?: string;
  path?: Point[];
  purity?: "impure" | "normal" | "pure";
  claimed?: boolean;
  resource?: string;
  clock?: number;
  powerShards?: number;
  somersloops?: number;
  production?: number;
  /** Conveyor Throughput Monitor items/min. Omitted when the save has no rate. */
  throughput?: number;
  /** 0–100. Game fills this as the 1-minute average window fills. */
  throughputConfidence?: number;
};

export type SaveHeaderInfo = {
  sessionName: string;
  mapName: string;
  playDurationSeconds: number;
  saveDateTime: string;
  buildVersion: number;
  creativeModeEnabled?: boolean;
  /** Session GUID from the save header (`saveIdentifier`). Stable across autosaves. */
  saveIdentifier?: string;
};

export type WorldSource = {
  kind: WorldMode | "upload";
  name: string;
  sizeBytes: number;
  hash: string;
  mtimeMs: number;
};

export type ParseStatus =
  | "idle"
  | "waiting"
  | "hashing"
  | "parsing"
  | "ready"
  | "error";

export type CategoryCounts = Record<EntityCategory, number>;

export type WorldSnapshot = {
  rev: number;
  entities: MapEntity[];
  header: SaveHeaderInfo | null;
  counts: CategoryCounts;
  source: WorldSource;
  parsedMs: number;
  entityCount: number;
};

export type WorldDelta = {
  rev: number;
  fromRev: number;
  added: MapEntity[];
  updated: MapEntity[];
  removed: string[];
  header: SaveHeaderInfo | null;
  counts: CategoryCounts;
  source: WorldSource;
  parsedMs: number;
  skipped: boolean;
  entityCount: number;
  /** When true, the delta is too large to send inline — refetch GET /api/world. */
  refetch?: boolean;
};

export type HistoryMark = {
  t: number;
  rev: number;
  added: number;
  updated: number;
  removed: number;
  entityCount: number;
};

export type HistoryEvent = {
  t: number;
  rev: number;
  added: MapEntity[];
  updated: MapEntity[];
  removed: string[];
  entityCount: number;
  header?: SaveHeaderInfo | null;
};

export type HistoryMeta = {
  firstT: number | null;
  lastT: number | null;
  eventCount: number;
  keyframeCount: number;
  bytes: number;
};

export type HubStatus = {
  rev: number;
  status: ParseStatus;
  progress: number;
  progressMessage: string;
  error: string | null;
  mode: WorldMode;
  pollIntervalSeconds: number;
  savesDir: string;
  saveFile: string | null;
  lastTickAt: number | null;
  lastChangeAt: number | null;
  skippedUnchanged: boolean;
  folderWatch: boolean;
  source: WorldSource | null;
  counts: CategoryCounts;
  entityCount: number;
  header: SaveHeaderInfo | null;
  lastDelta: {
    added: number;
    updated: number;
    removed: number;
    parsedMs: number;
  } | null;
  serverId: string;
  serverName: string;
};

export type HubConfig = {
  pollIntervalSeconds: number;
  servers: ServerEntry[];
};

export const EMPTY_COUNTS: CategoryCounts = {
  special: 0,
  production: 0,
  power: 0,
  logistics: 0,
  organization: 0,
  foundations: 0,
  walls: 0,
  architecture: 0,
  transport: 0,
  resource: 0,
  player: 0,
  crates: 0,
  other: 0,
};

export const CATEGORY_LABELS: Record<EntityCategory, string> = {
  special: "Special",
  production: "Production",
  power: "Power",
  logistics: "Logistics",
  organization: "Organization",
  foundations: "Foundations",
  walls: "Walls",
  architecture: "Architecture",
  transport: "Vehicles",
  resource: "Resource nodes",
  player: "Pioneers",
  crates: "Crates",
  other: "Other",
};

export const DEFAULT_LAYERS: Record<EntityCategory, boolean> = {
  special: true,
  production: true,
  power: true,
  logistics: true,
  organization: true,
  foundations: false,
  walls: false,
  architecture: false,
  transport: true,
  resource: true,
  player: true,
  crates: true,
  other: false,
};
