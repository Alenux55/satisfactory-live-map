import type { EntityCategory, MapEntity } from "./types";
import { RESOURCE_TYPE_LABELS } from "./resource";
import { prettyType } from "./categorize";
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
        test: anyOf(/HubTerminal|Build_Hub|TheHub/i),
      },
      {
        id: "special",
        label: "Special",
        test: anyOf(/SpaceElevator|Mam|WorkBench|Workshop|AwesomeSink|RadarTower|Beacon|Customizer/i),
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
        test: anyOf(/Constructor|Assembler|Manufacturer/i),
      },
      {
        id: "refineries",
        label: "4. Refineries",
        test: anyOf(/Refinery|Blender|Packager|Converter|Particle|Accelerator|Quantum|Encoder|Hadron|Mixer/i),
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
        test: anyOf(/Generator|NuclearPower|Geothermal/i),
      },
      {
        id: "poles",
        label: "2. Power Poles",
        test: anyOf(/PowerPole|PowerLine/i),
      },
      {
        id: "outlets",
        label: "3. Wall Outlets",
        test: anyOf(/WallOutlet/i),
      },
      {
        id: "grid",
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
          /ConveyorBelt|ConveyorChain|^Conveyor$|ConveyorWallHole|ConveyorPassthrough/i.test(p + s) &&
          !/Lift|Pole|Ceiling/i.test(p + s),
      },
      {
        id: "lifts",
        label: "2. Conveyor Lifts",
        test: anyOf(/ConveyorLift|Lift/i),
      },
      {
        id: "poles",
        label: "3. Conveyor Poles",
        test: anyOf(/ConveyorPole|ConveyorCeiling/i),
      },
      {
        id: "pipes",
        label: "4. Pipelines",
        test: (p, s) => /Pipeline(?!Pump|Junction|Support)|PipeNetwork/i.test(p + s),
      },
      {
        id: "pipe-util",
        label: "5. Pipeline Supports",
        test: anyOf(/PipelinePump|PipePump|PipelineJunction|PipelineSupport|Valve/i),
      },
      {
        id: "splitters",
        label: "6. Sort / Merge",
        test: anyOf(/Splitter|Merger|ThroughputMonitor/i),
      },
      {
        id: "storage",
        label: "7. Storage",
        test: anyOf(/Storage|Container|IndustrialFluid/i),
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
        test: anyOf(/Lookout|Ladder|JumpPad|HypertubeAttachment|Blueprint/i),
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
        test: (p, s) => /Foundation/i.test(p + s) && !/Ramp|Wall/i.test(p + s),
      },
      {
        id: "ramps",
        label: "2. Ramps",
        test: anyOf(/Ramp/i),
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
        test: (p, s) => /Wall/i.test(p + s) && !/Outlet|Power/i.test(p + s),
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
        test: anyOf(/Pillar|Beam|Frame|Railing|Barrier|Fence/i),
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
        test: anyOf(/Train|Railroad|Locomotive|FreightWagon|FreightPlatform|TrainStation/i),
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
  return prettyType(entity.type);
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
