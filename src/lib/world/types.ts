export const POLL_INTERVALS_SEC = [5, 10, 15, 30, 45, 60, 120, 180, 300, 600] as const;

export function nearestPollInterval(seconds: number): (typeof POLL_INTERVALS_SEC)[number] {
  return POLL_INTERVALS_SEC.reduce((best, value) =>
    Math.abs(value - seconds) < Math.abs(best - seconds) ? value : best,
  );
}

export type WorldMode = "demo" | "watch";

export type EntityCategory =
  | "production"
  | "extraction"
  | "logistics"
  | "power"
  | "organization"
  | "transport"
  | "special"
  | "player"
  | "vehicle"
  | "resource"
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
};

export type SaveHeaderInfo = {
  sessionName: string;
  mapName: string;
  playDurationSeconds: number;
  saveDateTime: string;
  buildVersion: number;
  creativeModeEnabled?: boolean;
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
};

export type HubConfig = {
  mode: WorldMode;
  pollIntervalSeconds: number;
  savesDir: string;
  saveFile: string | null;
};

export const EMPTY_COUNTS: CategoryCounts = {
  production: 0,
  extraction: 0,
  logistics: 0,
  power: 0,
  organization: 0,
  transport: 0,
  special: 0,
  player: 0,
  vehicle: 0,
  resource: 0,
  other: 0,
};

export const CATEGORY_LABELS: Record<EntityCategory, string> = {
  production: "Production",
  extraction: "Extraction",
  logistics: "Belts & pipes",
  power: "Power",
  organization: "Foundations",
  transport: "Vehicles & rails",
  special: "HUB & special",
  player: "Pioneers",
  vehicle: "Vehicles",
  resource: "Resource nodes",
  other: "Other",
};

export const DEFAULT_LAYERS: Record<EntityCategory, boolean> = {
  production: true,
  extraction: true,
  logistics: true,
  power: true,
  organization: false,
  transport: true,
  special: true,
  player: true,
  vehicle: true,
  resource: true,
  other: false,
};
