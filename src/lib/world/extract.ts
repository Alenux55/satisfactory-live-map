import {
  Parser,
  isSaveComponent,
  isSaveEntity,
  type SatisfactorySave,
  type SaveComponent,
  type SaveEntity,
} from "@etothepii/satisfactory-file-parser";
import { categorize, displayName, footprintFor, shortType } from "./categorize";
import { cmToMeters, yawFromQuaternion } from "./coords";
import { parsePurity, resourceKind, RESOURCE_TYPE_LABELS } from "./resource";
import { applyVanillaNodeCatalog } from "./vanilla-nodes";
import type { MapEntity, Point, SaveHeaderInfo } from "./types";

function debugLog(message: string, extra: Record<string, unknown>): void {
  if ((process.env.FICSIT_LOG ?? "info").toLowerCase() !== "debug") return;
  console.log(`[parse] ${message} ${JSON.stringify(extra)}`);
}

type SaveObjectLike = SaveEntity | SaveComponent;

const NODE_CLAIM_RADIUS_M = 28;
let unknownNodeSamples = 0;

const INCLUDE =
  /Buildable|Char_Player|Vehicle|Explorer|Tractor|Truck|CyberWagon|FactoryCart|ConveyorChain|LightweightBuildable|PipeHyper|JumpPad|Locomotive|FreightWagon|GolfCart|BP_Crate|DeathCrate/i;
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

function propValue(entity: SaveObjectLike, name: string): unknown {
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
  if (rec.itemReference) return pathNameOf(rec.itemReference);
  return pathNameOf(rec.value);
}

function unwrapNum(value: unknown, depth = 0): number | undefined {
  if (depth > 6) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (typeof rec.value === "number" && Number.isFinite(rec.value)) return rec.value;
  return unwrapNum(rec.value, depth + 1);
}

function harvestStrings(value: unknown, into: string[], depth = 0): void {
  if (depth > 5 || into.length > 48 || value == null) return;
  if (typeof value === "string") {
    if (value.length > 0 && value.length < 400) into.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const item of value) harvestStrings(item, into, depth + 1);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  if (typeof rec.pathName === "string") into.push(rec.pathName);
  if (typeof rec.name === "string") into.push(rec.name);
  for (const nested of Object.values(rec)) harvestStrings(nested, into, depth + 1);
}

function resourceFromBlob(typePath: string, ...blobs: unknown[]): string {
  const strings: string[] = [];
  harvestStrings(blobs, strings);
  return resourceKind(strings.join(" "), typePath);
}

function arrayValues(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const rec = asRecord(raw);
  if (Array.isArray(rec?.values)) return rec.values as unknown[];
  const inner = asRecord(rec?.value);
  if (Array.isArray(inner?.values)) return inner.values as unknown[];
  if (Array.isArray(rec?.value)) return rec.value as unknown[];
  return [];
}

function recipeFrom(entity: SaveEntity): string | undefined {
  const path = pathNameOf(propValue(entity, "mCurrentRecipe"));
  if (!path) return undefined;
  return displayName(shortType(path).replace(/^Recipe_/, ""));
}

function playerName(entity: SaveEntity): string | undefined {
  const cached = propValue(entity, "mCachedPlayerName") ?? propValue(entity, "mPlayerName");
  if (typeof cached === "string" && cached.length > 0) return cached;
  const rec = asRecord(cached);
  if (typeof rec?.value === "string") return rec.value;
  return undefined;
}

function floatProp(entity: SaveObjectLike, name: string): number | undefined {
  return unwrapNum(propValue(entity, name)) ?? unwrapNum(entity.properties?.[name]);
}

function countMatchingItems(stacks: unknown, match: RegExp): number {
  let total = 0;
  for (const stack of arrayValues(stacks)) {
    const bag = asRecord(stack);
    const props = asRecord(bag?.properties) ?? asRecord(asRecord(bag?.value)?.properties) ?? bag;
    if (!props) continue;
    const item =
      pathNameOf(props.Item) ??
      pathNameOf(asRecord(props.Item)?.itemReference) ??
      pathNameOf(asRecord(asRecord(props.Item)?.value)?.itemReference) ??
      pathNameOf(props.item) ??
      "";
    const amount = unwrapNum(props.NumItems) ?? unwrapNum(props.numItems) ?? num(props.NumItems, 0);
    if (match.test(item)) total += amount;
  }
  return total;
}

function lookupByName(byName: Map<string, SaveObjectLike>, path: string): SaveObjectLike | undefined {
  const direct = byName.get(path);
  if (direct) return direct;
  if (path.length < 16) return undefined;
  for (const [name, obj] of byName) {
    if (name.endsWith(path) || name.endsWith(`.${path}`)) return obj;
  }
  return undefined;
}

function inventoryFromRef(byName: Map<string, SaveObjectLike>, ref: unknown): SaveComponent | null {
  const path = pathNameOf(ref);
  if (!path) return null;
  const obj = lookupByName(byName, path);
  if (!obj || !isSaveComponent(obj)) return null;
  return obj;
}

function allInventories(obj: SaveEntity, byName: Map<string, SaveObjectLike>): SaveComponent[] {
  const found: SaveComponent[] = [];
  const seen = new Set<string>();
  const add = (inv: SaveComponent | null | undefined) => {
    if (!inv) return;
    const id = inv.instanceName ?? `${found.length}`;
    if (seen.has(id)) return;
    seen.add(id);
    found.push(inv);
  };
  add(inventoryFromRef(byName, propValue(obj, "mInventoryPotential")));
  add(inventoryFromRef(byName, propValue(obj, "mInventoryProductionBoost")));
  add(inventoryFromComponents(obj, byName, /InventoryPotential|InventoryProductionBoost|ProductionBoost|PotentialInventory/i));
  for (const ref of obj.components ?? []) {
    const path = typeof ref === "string" ? ref : pathNameOf(ref);
    if (!path) continue;
    const child = lookupByName(byName, path);
    if (child && isSaveComponent(child)) add(child);
  }
  return found;
}

function inventoryFromComponents(obj: SaveEntity, byName: Map<string, SaveObjectLike>, match: RegExp): SaveComponent | null {
  for (const ref of obj.components ?? []) {
    const path = typeof ref === "string" ? ref : pathNameOf(ref);
    if (!path || !match.test(path)) continue;
    const found = lookupByName(byName, path);
    if (found && isSaveComponent(found)) return found;
  }
  return null;
}

function stacksOf(inv: SaveComponent): unknown {
  return inv.properties?.mInventoryStacks ?? propValue(inv, "mInventoryStacks");
}

function factoryExtras(obj: SaveEntity, byName: Map<string, SaveObjectLike>): Partial<MapEntity> {
  const extras: Partial<MapEntity> = {};
  const potential = floatProp(obj, "mCurrentPotential") ?? floatProp(obj, "mPendingPotential");
  const boost = floatProp(obj, "mCurrentProductionBoost") ?? floatProp(obj, "mPendingProductionBoost");
  const inventories = allInventories(obj, byName);
  let shards = 0;
  let sloops = 0;
  for (const inv of inventories) {
    const stacks = stacksOf(inv);
    shards += countMatchingItems(stacks, /CrystalShard|PowerShard|Desc_CrystalShard/i);
    sloops += countMatchingItems(stacks, /Somersloop|Desc_WAT1|Desc_Somersloop/i);
  }
  if (typeof potential === "number") {
    extras.clock = potential > 12 ? Math.round(potential * 10) / 10 : Math.round(potential * 1000) / 10;
  }
  if (typeof boost === "number" && boost > 1.01) {
    extras.somersloops = Math.max(1, Math.round(Math.log2(boost)));
  } else if (sloops > 0) {
    extras.somersloops = sloops;
  }
  const isFactory =
    /Constructor|Assembler|Manufacturer|Smelter|Foundry|Refinery|Blender|Packager|Converter|Encoder|Accelerator|Hadron|Mixer|Miner|OilPump|WaterPump|ResourceWell|Fracking|Generator|Nuclear|Particle|Quantum/i.test(
      obj.typePath,
    );
  if (isFactory) {
    extras.clock = extras.clock ?? 100;
    extras.powerShards = shards;
    extras.somersloops = extras.somersloops ?? sloops;
    const clockFactor = extras.clock / 100;
    const sloopFactor = extras.somersloops ? 2 ** extras.somersloops : typeof boost === "number" ? boost : 1;
    extras.production = Math.round(clockFactor * sloopFactor * 1000) / 10;
  }
  const extracted = resourceFromBlob(
    obj.typePath,
    propValue(obj, "mExtractResourceType"),
    propValue(obj, "mWhatToExtract"),
    propValue(obj, "mResourceClass"),
    obj.properties,
  );
  if (extracted !== "unknown") extras.resource = extracted;
  else {
    const recipe = recipeFrom(obj);
    if (recipe) {
      const fromRecipe = resourceKind(recipe);
      if (fromRecipe !== "unknown") extras.resource = fromRecipe;
    }
  }
  return extras;
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

function isDeathCrate(obj: SaveEntity): boolean {
  if (/DeathCrate/i.test(obj.typePath) || /DeathCrate/i.test(obj.instanceName || "")) return true;
  const typeVal = propValue(obj, "mCrateType") ?? propValue(obj, "CrateType");
  const numeric = unwrapNum(typeVal);
  if (numeric === 1) return true;
  const strings: string[] = [];
  harvestStrings(typeVal, strings);
  harvestStrings(obj.components, strings);
  harvestStrings(propValue(obj, "mActorRepresentation"), strings);
  harvestStrings(propValue(obj, "mCompassTexture"), strings);
  return /DeathCrate|CT_Death|CrateType_Death|Death_Crate/i.test(strings.join(" "));
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

function extractResourceNode(obj: SaveEntity, byName: Map<string, SaveObjectLike>): MapEntity | null {
  const translation = obj.transform?.translation;
  if (!translation) return null;
  const typePath = obj.typePath || "";
  const componentBlobs = (obj.components ?? []).map((ref) => byName.get(ref.pathName)?.properties);
  const kind = resourceFromBlob(
    typePath,
    obj.instanceName,
    obj.properties,
    propValue(obj, "mResourceClass"),
    propValue(obj, "mWhatToExtract"),
    propValue(obj, "mExtractResourceType"),
    propValue(obj, "Resource"),
    ...componentBlobs,
  );
  if (kind === "unknown") {
    unknownNodeSamples += 1;
    if (unknownNodeSamples <= 8) {
      debugLog("resource node unclassified", {
        typePath,
        instance: obj.instanceName,
        props: Object.keys(obj.properties ?? {}),
      });
    }
  }
  const pretty = RESOURCE_TYPE_LABELS[kind] ?? kind;
  const purity = parsePurity(
    propValue(obj, "mPurity") ??
      propValue(obj, "Purity") ??
      propValue(obj, "mNodePurity") ??
      propValue(obj, "mSavedPurity") ??
      obj.properties,
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
  const extractors = entities.filter((entity) => /Miner|OilPump|WaterPump|ResourceWell|Fracking|Geothermal/i.test(entity.type));
  for (const node of entities) {
    if (node.category !== "resource") continue;
    for (const extractor of extractors) {
      if (Math.hypot(extractor.x - node.x, extractor.y - node.y) > NODE_CLAIM_RADIUS_M) continue;
      node.claimed = true;
      if ((node.resource === "unknown" || !node.resource) && extractor.resource && extractor.resource !== "unknown") {
        node.resource = extractor.resource;
        const pretty = RESOURCE_TYPE_LABELS[extractor.resource] ?? extractor.resource;
        const purityLabel = (node.purity ?? "normal").replace(/^\w/, (ch) => ch.toUpperCase());
        node.type = pretty;
        node.label = `${pretty} · ${purityLabel}`;
      }
      break;
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

function typeFromInstance(path: string): string | undefined {
  const build = path.match(/Build_([A-Za-z0-9]+)/);
  if (build?.[1]) return build[1];
  const belt = path.match(/ConveyorBeltMk\d+/i);
  if (belt?.[0]) return belt[0];
  return undefined;
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
      type: typeFromInstance(beltRef) ?? "ConveyorBeltMk1",
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
  const byName = new Map<string, SaveObjectLike>();
  unknownNodeSamples = 0;

  for (const level of Object.values(save.levels ?? {})) {
    for (const obj of level.objects ?? []) {
      if (obj.instanceName) byName.set(obj.instanceName, obj as SaveObjectLike);
    }
  }

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
          const node = extractResourceNode(obj, byName);
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
        const extras: Partial<MapEntity> = { ...factoryExtras(obj, byName) };
        const recipe = recipeFrom(obj);
        if (recipe) extras.recipe = recipe;
        const name = playerName(obj);
        if (name) extras.label = name;
        const path = splineFromProperties(obj);
        if (path) extras.path = path;
        if (/Char_Player/i.test(obj.typePath) && !extras.label) extras.label = "Pioneer";
        if (categorize(obj.typePath) === "crates") {
          const death = isDeathCrate(obj);
          extras.type = death ? "DeathCrate" : "Crate";
          extras.label = death ? "Death Crate" : "Dismantle Crate";
        }
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
  applyVanillaNodeCatalog(entities);
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
