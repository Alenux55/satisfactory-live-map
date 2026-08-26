import {
  Parser,
  isSaveEntity,
  type SatisfactorySave,
  type SaveEntity,
} from "@etothepii/satisfactory-file-parser";
import { categorize, footprintFor, prettyType, shortType } from "./categorize";
import { cmToMeters, yawFromQuaternion } from "./coords";
import { parsePurity, resourceKind, RESOURCE_TYPE_LABELS } from "./resource";
import type { MapEntity, Point, SaveHeaderInfo } from "./types";

const NODE_CLAIM_RADIUS_M = 28;

const INCLUDE =
  /Buildable|Char_Player|Vehicle|Explorer|Tractor|Truck|CyberWagon|FactoryCart|ConveyorChain|LightweightBuildable|PipeHyper|JumpPad|Locomotive|FreightWagon|GolfCart|GolfCart/i;
const EXCLUDE = /Pickup_|Creature_|Enemy|Wildlife|Foliage|Audio|Lightmass|HUD|CheatManager|Camera/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readVec3(value: unknown): { x: number; y: number; z: number } | null {
  const rec = asRecord(value);
  if (!rec) return null;
  if ("x" in rec && "y" in rec) {
    return { x: num(rec.x), y: num(rec.y), z: num(rec.z) };
  }
  if (rec.value && rec.value !== value) return readVec3(rec.value);
  if (rec.translation) return readVec3(rec.translation);
  if (rec.location) return readVec3(rec.location);
  if (rec.Location) return readVec3(rec.Location);
  return null;
}

function readQuat(value: unknown): { x: number; y: number; z: number; w: number } | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  if ("x" in rec && "y" in rec && "z" in rec && "w" in rec) {
    return { x: num(rec.x), y: num(rec.y), z: num(rec.z), w: num(rec.w, 1) };
  }
  return undefined;
}

function propValue(entity: SaveEntity, name: string): unknown {
  const raw = entity.properties?.[name];
  const one = Array.isArray(raw) ? raw[0] : raw;
  const rec = asRecord(one);
  if (!rec) return undefined;
  if ("value" in rec) return rec.value;
  return rec;
}

function pathNameOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (typeof rec.pathName === "string") return rec.pathName;
  return pathNameOf(rec.value);
}

function recipeFrom(entity: SaveEntity): string | undefined {
  const path = pathNameOf(propValue(entity, "mCurrentRecipe"));
  if (!path) return undefined;
  return prettyType(shortType(path).replace(/^Recipe_/, ""));
}

function playerName(entity: SaveEntity): string | undefined {
  const cached = propValue(entity, "mCachedPlayerName") ?? propValue(entity, "mPlayerName");
  if (typeof cached === "string" && cached.length > 0) return cached;
  const rec = asRecord(cached);
  if (typeof rec?.value === "string") return rec.value;
  return undefined;
}

function downsample(points: Point[], max = 16): Point[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function splineFromProperties(entity: SaveEntity): Point[] | undefined {
  const raw = propValue(entity, "mSplineData") ?? entity.properties?.mSplineData;
  const rec = asRecord(raw);
  const values: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(rec?.values)
      ? (rec.values as unknown[])
      : Array.isArray(asRecord(rec?.value)?.values)
        ? (asRecord(rec?.value)?.values as unknown[])
        : [];
  const points: Point[] = [];
  for (const item of values) {
    const bag = asRecord(item);
    const loc =
      readVec3(bag?.Location) ??
      readVec3(bag?.location) ??
      readVec3(asRecord(bag?.properties)?.Location) ??
      readVec3(asRecord(asRecord(bag?.value)?.properties)?.Location);
    if (!loc) continue;
    points.push([cmToMeters(loc.x), cmToMeters(loc.y)]);
  }
  if (points.length < 2) return undefined;
  const origin = entity.transform?.translation;
  const maxAbs = Math.max(...points.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
  if (origin && maxAbs < 250 && Math.hypot(cmToMeters(origin.x), cmToMeters(origin.y)) > 400) {
    const ox = cmToMeters(origin.x);
    const oy = cmToMeters(origin.y);
    return downsample(points.map(([x, y]) => [x + ox, y + oy]));
  }
  return downsample(points);
}

function isResourceNodeActor(typePath: string): boolean {
  return (
    /ResourceNode|FrackingSatellite|FrackingCore|Geyser/i.test(typePath) &&
    !/Miner|Extractor|Pump|Generator/i.test(typePath)
  );
}

function boolish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (/^(true|1|yes)$/i.test(value)) return true;
    if (/^(false|0|no)$/i.test(value)) return false;
  }
  const rec = asRecord(value);
  if (rec && "value" in rec) return boolish(rec.value);
  return undefined;
}

function shouldKeep(typePath: string): boolean {
  if (EXCLUDE.test(typePath) && !/LightweightBuildable/i.test(typePath)) return false;
  if (isResourceNodeActor(typePath)) return true;
  return INCLUDE.test(typePath);
}

function fromTransform(
  id: string,
  typePath: string,
  translation: { x: number; y: number; z: number },
  rotation: { x: number; y: number; z: number; w: number } | undefined,
  extras?: Partial<MapEntity>,
): MapEntity {
  const size = footprintFor(typePath);
  return {
    type: shortType(typePath),
    category: categorize(typePath),
    x: cmToMeters(translation.x),
    y: cmToMeters(translation.y),
    z: cmToMeters(translation.z),
    yaw: rotation ? yawFromQuaternion(rotation) : 0,
    w: size.w,
    h: size.h,
    ...extras,
    id,
  };
}

function extractResourceNode(obj: SaveEntity): MapEntity | null {
  const translation = obj.transform?.translation;
  if (!translation) return null;
  const typePath = obj.typePath || "";
  const resourcePath =
    pathNameOf(propValue(obj, "mResourceClass")) ??
    pathNameOf(propValue(obj, "mWhatToExtract")) ??
    pathNameOf(propValue(obj, "mExtractResourceType")) ??
    pathNameOf(propValue(obj, "Resource")) ??
    typePath;
  const kind = resourceKind(resourcePath, typePath);
  const pretty = RESOURCE_TYPE_LABELS[kind] ?? kind;
  const purity = parsePurity(
    propValue(obj, "mPurity") ??
      propValue(obj, "Purity") ??
      propValue(obj, "mNodePurity") ??
      propValue(obj, "mSavedPurity"),
  );
  const occupied = boolish(propValue(obj, "mIsOccupied") ?? propValue(obj, "mOccupied"));
  const purityLabel = purity.charAt(0).toUpperCase() + purity.slice(1);
  return fromTransform(
    obj.instanceName || `${typePath}:${translation.x}:${translation.y}`,
    typePath,
    translation,
    obj.transform.rotation,
    {
      type: pretty,
      category: "resource",
      resource: kind,
      purity,
      claimed: occupied === true,
      label: `${pretty} · ${purityLabel}`,
      w: 10,
      h: 10,
    },
  );
}

function markNodesClaimed(entities: MapEntity[]): void {
  const extractors = entities.filter((entity) => entity.category === "extraction");
  for (const node of entities) {
    if (node.category !== "resource" || node.claimed) continue;
    for (const extractor of extractors) {
      if (Math.hypot(extractor.x - node.x, extractor.y - node.y) <= NODE_CLAIM_RADIUS_M) {
        node.claimed = true;
        break;
      }
    }
  }
}

function extractLightweight(obj: SaveEntity, into: MapEntity[]): void {
  const special = asRecord(obj.specialProperties);
  if (!special || special.type !== "BuildableSubsystemSpecialProperties") return;
  const groups = Array.isArray(special.buildables) ? special.buildables : [];
  let index = 0;
  for (const group of groups) {
    const g = asRecord(group);
    if (!g) continue;
    const typePath = pathNameOf(g.typeReference) ?? "Lightweight";
    const instances = Array.isArray(g.instances) ? g.instances : [];
    for (const instance of instances) {
      const inst = asRecord(instance);
      const transform = asRecord(inst?.transform);
      const translation = readVec3(transform?.translation);
      if (!translation) continue;
      const id = `lw:${shortType(typePath)}:${Math.round(translation.x)}:${Math.round(translation.y)}:${Math.round(translation.z)}:${index}`;
      into.push(fromTransform(id, typePath, translation, readQuat(transform?.rotation)));
      index += 1;
    }
  }
}

function extractConveyorChain(obj: SaveEntity, into: MapEntity[]): void {
  const special = asRecord(obj.specialProperties);
  if (!special || special.type !== "ConveyorChainActorSpecialProperties") return;
  const belts = Array.isArray(special.beltsInChain) ? special.beltsInChain : [];
  belts.forEach((belt, i) => {
    const rec = asRecord(belt);
    if (!rec) return;
    const spline = Array.isArray(rec.splinePoints) ? rec.splinePoints : [];
    const path: Point[] = [];
    for (const pt of spline) {
      const loc = readVec3(asRecord(pt)?.location);
      if (loc) path.push([cmToMeters(loc.x), cmToMeters(loc.y)]);
    }
    if (path.length < 2) return;
    const start = path[0];
    const beltRef = pathNameOf(rec.beltRef) ?? `${obj.instanceName}:${i}`;
    into.push({
      id: `belt:${beltRef}`,
      type: "Conveyor",
      category: "logistics",
      x: start[0],
      y: start[1],
      z: 0,
      yaw: 0,
      w: 2,
      h: 2,
      path: downsample(path),
    });
  });
}

function extractPowerLine(obj: SaveEntity, into: MapEntity[]): void {
  const special = asRecord(obj.specialProperties);
  if (!special || special.type !== "PowerLineSpecialProperties") return;
  const a = readVec3(special.sourceTranslation);
  const b = readVec3(special.targetTranslation);
  if (!a || !b) return;
  const path: Point[] = [
    [cmToMeters(a.x), cmToMeters(a.y)],
    [cmToMeters(b.x), cmToMeters(b.y)],
  ];
  into.push({
    id: obj.instanceName || `powerline:${path[0]}-${path[1]}`,
    type: shortType(obj.typePath || "PowerLine"),
    category: "power",
    x: path[0][0],
    y: path[0][1],
    z: cmToMeters(a.z),
    yaw: 0,
    w: 1,
    h: 1,
    path,
  });
}

export function headerFromSave(save: SatisfactorySave): SaveHeaderInfo {
  const header = save.header;
  return {
    sessionName: header.sessionName || save.name || "Unnamed session",
    mapName: header.mapName || "Persistent_Level",
    playDurationSeconds: header.playDurationSeconds ?? 0,
    saveDateTime: String(header.saveDateTime ?? ""),
    buildVersion: header.buildVersion ?? 0,
  };
}

export function extractEntities(save: SatisfactorySave): MapEntity[] {
  const entities: MapEntity[] = [];
  const seen = new Set<string>();

  for (const level of Object.values(save.levels ?? {})) {
    for (const obj of level.objects ?? []) {
      try {
        if (!isSaveEntity(obj)) continue;
        if (/LightweightBuildable/i.test(obj.typePath)) {
          extractLightweight(obj, entities);
          continue;
        }
        extractConveyorChain(obj, entities);
        extractPowerLine(obj, entities);
        if (isResourceNodeActor(obj.typePath)) {
          const node = extractResourceNode(obj);
          if (node) {
            if (seen.has(node.id)) continue;
            seen.add(node.id);
            entities.push(node);
          }
          continue;
        }
        if (!shouldKeep(obj.typePath)) continue;
        if (/ConveyorChainActor|LightweightBuildable/i.test(obj.typePath)) continue;
        const translation = obj.transform?.translation;
        if (!translation) continue;
        const extras: Partial<Pick<MapEntity, "recipe" | "label" | "path">> = {};
        const recipe = recipeFrom(obj);
        if (recipe) extras.recipe = recipe;
        const name = playerName(obj);
        if (name) extras.label = name;
        const path = splineFromProperties(obj);
        if (path) extras.path = path;
        if (/Char_Player/i.test(obj.typePath) && !extras.label) extras.label = "Pioneer";
        const id = obj.instanceName || `${obj.typePath}:${translation.x}:${translation.y}`;
        if (seen.has(id)) continue;
        seen.add(id);
        entities.push(fromTransform(id, obj.typePath, translation, obj.transform.rotation, extras));
      } catch {
        // Skip a single corrupt actor rather than failing the whole world.
      }
    }
  }

  markNodesClaimed(entities);
  return entities;
}

export function parseSaveBuffer(
  name: string,
  buffer: ArrayBuffer,
  onProgress?: (progress: number, message?: string) => void,
): { header: SaveHeaderInfo; entities: MapEntity[] } {
  const save = Parser.ParseSave(name, buffer, {
    throwErrors: false,
    onProgressCallback: (progress, msg) => onProgress?.(progress, msg),
  });
  return {
    header: headerFromSave(save),
    entities: extractEntities(save),
  };
}
