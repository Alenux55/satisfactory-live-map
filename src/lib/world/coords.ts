/** Playable map bounds in centimeters (Unreal), from the Satisfactory wiki. */
export const WORLD_X_MIN_CM = -324_600;
export const WORLD_X_MAX_CM = 425_400;
export const WORLD_Y_MIN_CM = -375_000; // north
export const WORLD_Y_MAX_CM = 375_000; // south

export const WORLD_X_MIN = WORLD_X_MIN_CM / 100;
export const WORLD_X_MAX = WORLD_X_MAX_CM / 100;
export const WORLD_Y_NORTH = WORLD_Y_MIN_CM / 100;
export const WORLD_Y_SOUTH = WORLD_Y_MAX_CM / 100;

/** 128-foundation grid, numbered from the south-west corner. */
export const GRID_METERS = 1024;

export function cmToMeters(cm: number): number {
  return cm / 100;
}

/** Leaflet CRS.Simple uses [lat, lng] = [northing, easting]. North is -Y in the save. */
export function worldToLatLng(xMeters: number, yMeters: number): [number, number] {
  return [-yMeters, xMeters];
}

export function latLngToWorld(lat: number, lng: number): { x: number; y: number } {
  return { x: lng, y: -lat };
}

export const MAP_BOUNDS: [[number, number], [number, number]] = [
  worldToLatLng(WORLD_X_MIN, WORLD_Y_SOUTH),
  worldToLatLng(WORLD_X_MAX, WORLD_Y_NORTH),
];

export const MAP_CENTER = worldToLatLng(
  (WORLD_X_MIN + WORLD_X_MAX) / 2,
  (WORLD_Y_NORTH + WORLD_Y_SOUTH) / 2,
);

export function yawFromQuaternion(q: { x: number; y: number; z: number; w: number }): number {
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return (Math.atan2(siny, cosy) * 180) / Math.PI;
}

export function gridOriginWorld(gx: number, gy: number): { x: number; y: number } {
  return {
    x: WORLD_X_MIN + gx * GRID_METERS,
    y: WORLD_Y_SOUTH - gy * GRID_METERS,
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
