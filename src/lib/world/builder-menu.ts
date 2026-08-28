import type { EntityCategory, MapEntity } from "./types";
import { RESOURCE_TYPE_LABELS } from "./resource";
import { displayName } from "./categorize";
import { iconCandidatesForBuilding, iconCandidatesForResource } from "./icons";

export type BuilderSubcategory = {
  id: string;
  label: string;
  test: (typePath: string, short: string) => boolean;
};

export type BuilderCategoryDef = {
  id: EntityCategory;
  label: string;
  extra?: boolean;
  subs: BuilderSubcategory[];
};

const anyOf =
  (...res: RegExp[]) =>
  (typePath: string, short: string) =>
    res.some((re) => re.test(typePath) || re.test(short));

/** In-game Builder tab order, then map-only extras. Sub labels follow the 1.0/1.1 build gun. */
export const BUILDER_MENU: BuilderCategoryDef[] = [
  {
    id: "special",
    label: "Special",
    subs: [
      {
        id: "hub",
        label: "The HUB",
        test: anyOf(/HubTerminal|TradingPost|Build_Hub(?!Parts)|TheHub|^Hub$/i),
      },
      {
        id: "special",
        label: "Special",
        test: anyOf(
          /SpaceElevator|Mam|WorkBench|Workshop|AwesomeSink|AwesomeShop|ResourceSinkShop|RadarTower|Beacon|Customizer|BlueprintDesigner|\bSPWN\b/i,
        ),
      },
    ],
  },
  {
    id: "production",
    label: "Production",
    subs: [
      {
        id: "extractors",
        label: "1. Extractors",
        test: anyOf(/Miner|OilPump|WaterPump|ResourceWell|FrackingExtractor/i),
      },
      {
        id: "smelters",
        label: "2. Smelters",
        test: anyOf(/Smelter|Foundry/i),
      },
      {
        id: "manufacturers",
        label: "3. Manufacturers",
        test: anyOf(/Constructor|Assembler|Manufacturer|Packager/i),
      },
      {
        id: "refineries",
        label: "4. Refineries",
        test: anyOf(/Refinery|Blender|Particle|Accelerator|Quantum|Encoder|Hadron|Converter|Mixer/i),
      },
    ],
  },
  {
    id: "power",
    label: "Power",
    subs: [
      {
        id: "generators",
        label: "1. Generators",
        test: anyOf(/Generator|NuclearPower|Geothermal|AlienPower/i),
      },
      {
        id: "grid",
        label: "2. Power Distribution",
        test: anyOf(/PowerPole|PowerLine|PowerTower/i),
      },
      {
        id: "outlets",
        label: "3. Wall Outlets",
        test: anyOf(/WallOutlet/i),
      },
      {
        id: "storage",
        label: "4. Power Storage",
        test: anyOf(/PowerStorage|PowerSwitch|PriorityPower/i),
      },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    subs: [
      {
        id: "belts",
        label: "1. Conveyor Belts",
        test: (p, s) =>
          /ConveyorBelt|ConveyorChain|^Conveyor$|ConveyorPassthrough/i.test(p + s) &&
          !/Lift|Pole|Ceiling|Wall|FloorHole|WallHole|Monitor/i.test(p + s),
      },
      {
        id: "lifts",
        label: "2. Conveyor Lifts",
        test: anyOf(/ConveyorLift/i),
      },
      {
        id: "poles",
        label: "3. Conveyor Poles",
        test: anyOf(/ConveyorPole|ConveyorCeiling|ConveyorWallHole|ConveyorFloorHole|FloorHole.*Conveyor|CeilingAttachment/i),
      },
      {
        id: "pipes",
        label: "4. Pipelines",
        test: (p, s) => /Pipeline(?!Pump|Junction|Support|Wall|Floor)|PipeNetwork/i.test(p + s),
      },
      {
        id: "pipe-util",
        label: "5. Pipeline Supports",
        test: anyOf(/PipelinePump|PipePump|PipelineJunction|PipelineSupport|PipelineWall|PipelineFloor|Valve/i),
      },
      {
        id: "splitters",
        label: "6. Sort / Merge",
        test: anyOf(/Splitter|Merger/i),
      },
      {
        id: "storage",
        label: "7. Storage",
        test: anyOf(/Storage|Container|IndustrialFluid/i),
      },
      {
        id: "monitors",
        label: "8. Throughput monitors",
        test: anyOf(/ConveyorMonitor|ThroughputMonitor/i),
      },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    subs: [
      {
        id: "signs",
        label: "1. Signs",
        test: anyOf(/Sign|Billboard|Label/i),
      },
      {
        id: "lighting",
        label: "2. Lighting",
        test: anyOf(/Floodlight|StreetLight|CeilingLight|Light/i),
      },
      {
        id: "utility",
        label: "3. Access & utility",
        test: anyOf(/Lookout|Shelf|DimensionalDepot|CentralStorage/i),
      },
    ],
  },
  {
    id: "foundations",
    label: "Foundations",
    subs: [
      {
        id: "foundations",
        label: "1. Foundations",
        test: (p, s) =>
          /Foundation|HalfFoundation/i.test(p + s) && !/Ramp|Wall|Frame|QuarterPipe/i.test(p + s),
      },
      {
        id: "ramps",
        label: "2. Ramps",
        test: (p, s) => /Ramp/i.test(p + s) && !/Wall/i.test(p + s),
      },
      {
        id: "quarter-pipes",
        label: "3. Quarter-pipes",
        test: anyOf(/QuarterPipe|DownCorner|InvertedCorner/i),
      },
    ],
  },
  {
    id: "walls",
    label: "Walls",
    subs: [
      {
        id: "walls",
        label: "1. Walls",
        test: (p, s) => /Wall/i.test(p + s) && !/Outlet|Power|Window|Door|Gate/i.test(p + s),
      },
      {
        id: "doors",
        label: "2. Doors & windows",
        test: anyOf(/Door|Window|Gate/i),
      },
    ],
  },
  {
    id: "architecture",
    label: "Architecture",
    subs: [
      {
        id: "roofs",
        label: "1. Roofs",
        test: anyOf(/Roof/i),
      },
      {
        id: "walkways",
        label: "2. Walkways",
        test: anyOf(/Walkway|Catwalk|Stair/i),
      },
      {
        id: "frames",
        label: "3. Frames & pillars",
        test: anyOf(/Pillar|Beam|Frame|Railing|Barrier|Fence|Ladder|Fan|Vent/i),
      },
    ],
  },
  {
    id: "transport",
    label: "Vehicles",
    subs: [
      {
        id: "vehicles",
        label: "1. Vehicles",
        test: anyOf(/Tractor|Truck|Explorer|CyberWagon|FactoryCart|GolfCart|Wheeled/i),
      },
      {
        id: "trains",
        label: "2. Trains",
        test: anyOf(/Train|Railroad|Locomotive|FreightWagon|FreightPlatform|TrainStation|BufferStop|BlockSignal|PathSignal|EmptyPlatform|SwitchControl/i),
      },
      {
        id: "drones",
        label: "3. Drones",
        test: anyOf(/Drone/i),
      },
      {
        id: "hypertubes",
        label: "4. Hypertubes",
        test: anyOf(/HyperTube|PipeHyper/i),
      },
      {
        id: "pioneer",
        label: "5. Pioneer transport",
        test: anyOf(/JumpPad|LandingPad|PersonnelElevator|Portal/i),
      },
    ],
  },
  {
    id: "resource",
    label: "Resource nodes",
    extra: true,
    subs: [{ id: "nodes", label: "Nodes", test: () => true }],
  },
  {
    id: "player",
    label: "Pioneers",
    extra: true,
    subs: [{ id: "pioneers", label: "Pioneers", test: () => true }],
  },
  {
    id: "crates",
    label: "Crates",
    extra: true,
    subs: [
      { id: "dismantle", label: "Dismantle Crates", test: (p, s) => /Crate/i.test(p + s) && !/Death/i.test(p + s) },
      { id: "death", label: "Death Crates", test: anyOf(/DeathCrate|Death/i) },
    ],
  },
  {
    id: "other",
    label: "Other",
    extra: true,
    subs: [{ id: "other", label: "Other", test: () => true }],
  },
];

export function layerKey(entity: MapEntity): string {
  if (entity.category === "resource") return `res:${entity.resource ?? "unknown"}`;
  if (entity.category === "player") return `ply:${entity.id}`;
  return `typ:${entity.type}`;
}

export function layerLabel(entity: MapEntity): string {
  if (entity.category === "resource") {
    return RESOURCE_TYPE_LABELS[entity.resource ?? "unknown"] ?? entity.resource ?? "Unknown";
  }
  if (entity.category === "player") return entity.label || "Pioneer";
  if (entity.category === "crates") {
    return /death/i.test(entity.type) ? "Death Crate" : "Dismantle Crate";
  }
  return displayName(entity.type);
}

export function layerIcons(entity: MapEntity): string[] {
  if (entity.category === "resource") return iconCandidatesForResource(entity.resource ?? "unknown");
  return iconCandidatesForBuilding(entity.type);
}

export function subcategoryId(entity: MapEntity): string {
  const cat = BUILDER_MENU.find((entry) => entry.id === entity.category);
  const short = entity.type;
  const path = entity.type;
  const match = cat?.subs.find((sub) => sub.test(path, short));
  return match?.id ?? cat?.subs[0]?.id ?? "other";
}

export function categoryHighlightKey(category: EntityCategory): string {
  return `cat:${category}`;
}

export function subcategoryHighlightKey(category: EntityCategory, subId: string): string {
  return `sub:${category}:${subId}`;
}

export const BOOST_HIGHLIGHT = {
  somersloops: "prop:somersloops",
  shards: "prop:shards",
  boosted: "prop:boosted",
} as const;

export type BoostKind = "somersloops" | "shards";

export type BoostKindPin = {
  all: boolean;
  types: string[];
};

export type BoostPin = {
  somersloops: BoostKindPin;
  shards: BoostKindPin;
};

export function emptyBoostPin(): BoostPin {
  return {
    somersloops: { all: false, types: [] },
    shards: { all: false, types: [] },
  };
}

export function entityHasSomersloops(entity: MapEntity): boolean {
  return (entity.somersloops ?? 0) > 0;
}

export function entityHasShards(entity: MapEntity): boolean {
  return (entity.powerShards ?? 0) > 0;
}

export function boostKindIsPinned(kind: BoostKindPin): boolean {
  return kind.all || kind.types.length > 0;
}

export function boostPinIsActive(pin: BoostPin): boolean {
  return boostKindIsPinned(pin.somersloops) || boostKindIsPinned(pin.shards);
}

export function boostTypeIsPinned(kind: BoostKindPin, key: string): boolean {
  return kind.all || kind.types.includes(key);
}

export function boostTypeHighlightKey(kind: BoostKind, key: string): string {
  return `${BOOST_HIGHLIGHT[kind]}:${key}`;
}

export function toggleBoostKindAll(pin: BoostPin, kind: BoostKind): BoostPin {
  const current = pin[kind];
  return {
    ...pin,
    [kind]: current.all ? { all: false, types: [] } : { all: true, types: [] },
  };
}

export function toggleBoostKindType(pin: BoostPin, kind: BoostKind, key: string): BoostPin {
  const current = pin[kind];
  if (current.all) {
    return { ...pin, [kind]: { all: false, types: [key] } };
  }
  const types = current.types.includes(key)
    ? current.types.filter((item) => item !== key)
    : [...current.types, key];
  return { ...pin, [kind]: { all: false, types } };
}

export function entityMatchesBoostPin(entity: MapEntity, pin: BoostPin): boolean {
  const key = layerKey(entity);
  if (entityHasSomersloops(entity) && boostTypeIsPinned(pin.somersloops, key)) return true;
  if (entityHasShards(entity) && boostTypeIsPinned(pin.shards, key)) return true;
  return false;
}

export function isBoostHighlight(highlight: string | null): boolean {
  if (!highlight) return false;
  return (
    highlight === BOOST_HIGHLIGHT.boosted ||
    highlight === BOOST_HIGHLIGHT.somersloops ||
    highlight === BOOST_HIGHLIGHT.shards ||
    highlight.startsWith(`${BOOST_HIGHLIGHT.somersloops}:`) ||
    highlight.startsWith(`${BOOST_HIGHLIGHT.shards}:`)
  );
}

export function boostDotFocus(
  highlight: string | null,
  pin: BoostPin,
): "somersloops" | "shards" | "both" | null {
  if (highlight) {
    if (highlight === BOOST_HIGHLIGHT.boosted) return "both";
    if (highlight === BOOST_HIGHLIGHT.somersloops || highlight.startsWith(`${BOOST_HIGHLIGHT.somersloops}:`)) {
      return "somersloops";
    }
    if (highlight === BOOST_HIGHLIGHT.shards || highlight.startsWith(`${BOOST_HIGHLIGHT.shards}:`)) {
      return "shards";
    }
    return null;
  }
  const sloops = boostKindIsPinned(pin.somersloops);
  const shards = boostKindIsPinned(pin.shards);
  if (sloops && shards) return "both";
  if (sloops) return "somersloops";
  if (shards) return "shards";
  return null;
}

export function matchesLayerHighlight(entity: MapEntity, highlight: string): boolean {
  if (highlight.startsWith(`${BOOST_HIGHLIGHT.somersloops}:`)) {
    return entityHasSomersloops(entity) && layerKey(entity) === highlight.slice(BOOST_HIGHLIGHT.somersloops.length + 1);
  }
  if (highlight.startsWith(`${BOOST_HIGHLIGHT.shards}:`)) {
    return entityHasShards(entity) && layerKey(entity) === highlight.slice(BOOST_HIGHLIGHT.shards.length + 1);
  }
  if (highlight === BOOST_HIGHLIGHT.somersloops) return entityHasSomersloops(entity);
  if (highlight === BOOST_HIGHLIGHT.shards) return entityHasShards(entity);
  if (highlight === BOOST_HIGHLIGHT.boosted) return entityHasSomersloops(entity) || entityHasShards(entity);
  if (highlight.startsWith("cat:")) return entity.category === highlight.slice(4);
  if (highlight.startsWith("sub:")) {
    return `${entity.category}:${subcategoryId(entity)}` === highlight.slice(4);
  }
  const key = layerKey(entity);
  if (key === highlight) return true;
  if (entity.category === "resource") {
    const claimKey = entity.claimed ? `${key}:claimed` : `${key}:unclaimed`;
    return claimKey === highlight;
  }
  return false;
}
