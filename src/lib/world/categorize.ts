import type { EntityCategory } from "./types";
import docsNames from "./docs-names.json";

const DOCS_NAMES = docsNames as Record<string, string>;

export const CATEGORY_COLORS: Record<EntityCategory, string> = {
  special: "#f472b6",
  production: "#ff9f43",
  power: "#3ecfcf",
  logistics: "#f6c90e",
  organization: "#94a3b8",
  foundations: "#e4c37a",
  walls: "#7c8b9a",
  architecture: "#8b7c6e",
  transport: "#a78bfa",
  resource: "#6f505d",
  player: "#4ade80",
  crates: "#f59e0b",
  other: "#94a3b8",
};

type Size = { w: number; h: number };

const SIZE_RULES: [RegExp, Size][] = [
  [/Miner/i, { w: 18, h: 18 }],
  [/OilPump|WaterPump|ResourceWell/i, { w: 14, h: 14 }],
  [/Constructor/i, { w: 8, h: 10 }],
  [/Assembler/i, { w: 10, h: 15 }],
  [/Manufacturer/i, { w: 18, h: 20 }],
  [/Smelter/i, { w: 6, h: 9 }],
  [/Foundry/i, { w: 10, h: 9 }],
  [/OilRefinery|Refinery/i, { w: 20, h: 20 }],
  [/Blender/i, { w: 18, h: 16 }],
  [/Packager/i, { w: 8, h: 8 }],
  [/Converter|ParticleAccelerator|QuantumEncoder/i, { w: 24, h: 24 }],
  [/Nuclear/i, { w: 22, h: 22 }],
  [/Generator/i, { w: 20, h: 16 }],
  [/Storage/i, { w: 5, h: 5 }],
  [/Foundation|Ramp/i, { w: 8, h: 8 }],
  [/Wall/i, { w: 8, h: 1.5 }],
  [/PowerPole|PowerLine|WallOutlet/i, { w: 1.5, h: 1.5 }],
  [/ConveyorMonitor|ThroughputMonitor/i, { w: 3, h: 3 }],
  [/Splitter|Merger|PipelineJunction/i, { w: 4, h: 4 }],
  [/HubTerminal|Hub|WorkBench|Mam/i, { w: 16, h: 16 }],
  [/SpaceElevator/i, { w: 30, h: 30 }],
  [/TrainStation|FreightPlatform/i, { w: 16, h: 32 }],
  [/ResourceNode|FrackingSatellite|FrackingCore|Geyser/i, { w: 10, h: 10 }],
  [/Char_Player|Player/i, { w: 2, h: 2 }],
  [/Tractor|Truck|Explorer|CyberWagon|FactoryCart/i, { w: 8, h: 12 }],
  [/Crate/i, { w: 3, h: 3 }],
];

export function shortType(typePath: string): string {
  const dotted = typePath.match(/\.([^./]+)_C$/);
  const raw = dotted?.[1] ?? typePath.split("/").pop() ?? typePath;
  return raw
    .replace(/_C$/, "")
    .replace(/^Build_/, "")
    .replace(/^Char_/, "")
    .replace(/^Desc_/, "")
    .replace(/^BP_/, "")
    .replace(/^Recipe_/, "");
}

export function categorize(typePath: string): EntityCategory {
  const p = typePath;
  if (/Char_Player|PlayerState/i.test(p)) return "player";
  if (/BP_Crate|DeathCrate|\/Crate\/|\bCrate\b/i.test(p) && !/Storage/i.test(p)) return "crates";
  if (/ResourceNode|FrackingSatellite|FrackingCore|Geyser/i.test(p) && !/Miner|Extractor|Pump|Generator/i.test(p)) {
    return "resource";
  }
  if (
    /HubTerminal|TradingPost|TheHub|Build_Hub|SpaceElevator|Mam|WorkBench|Workshop|AwesomeSink|AwesomeShop|ResourceSinkShop|RadarTower|Beacon|BlueprintDesigner|\bSPWN\b/i.test(
      p,
    )
  ) {
    return "special";
  }
  if (
    /AlienPower|PowerTower|Generator|PowerPole|PowerLine|WallOutlet|PowerStorage|PowerSwitch|PriorityPower|NuclearPower|Geothermal/i.test(
      p,
    )
  ) {
    return "power";
  }
  if (
    /Miner|OilPump|WaterPump|ResourceWell|FrackingExtractor|Constructor|Assembler|Manufacturer|Smelter|Foundry|Refinery|Blender|Packager|Particle|Converter|Encoder|Decoder|Accelerator|Mixer|Hadron|Quantum/i.test(
      p,
    )
  ) {
    return "production";
  }
  if (
    /TrainStation|Railroad|Train|Drone|HyperTube|PipeHyper|LandingPad|Freight|Locomotive|FreightWagon|BufferStop|BlockSignal|PathSignal|EmptyPlatform|Portal|PersonnelElevator|JumpPad/i.test(
      p,
    )
  ) {
    return "transport";
  }
  if (/CyberWagon|FactoryCart|Wheeled|Explorer|Tractor|Truck|GolfCart|Vehicle/i.test(p) && !/TrainStation|Railroad/i.test(p)) {
    return "transport";
  }
  if (/ConveyorWall/i.test(p)) return "walls";
  if (/Conveyor|Pipeline|Storage|Splitter|Merger|Lift|PipePump|PipelinePump|Valve|Junction/i.test(p)) {
    return "logistics";
  }
  if (/QuarterPipe|HalfFoundation|Foundation|Ramp|DownCorner|InvertedCorner/i.test(p) && !/Wall|Frame/i.test(p)) {
    return "foundations";
  }
  if (/Wall|Door|Window|Gate/i.test(p) && !/Outlet|Power/i.test(p)) return "walls";
  if (/Roof|Walkway|Stair|Pillar|Beam|Frame|Catwalk|Fence|Railing|Barrier|Ladder|Fan|Vent/i.test(p)) return "architecture";
  if (
    /Lookout|Sign|Billboard|Label|Floodlight|StreetLight|CeilingLight|Light|Shelf|DimensionalDepot|CentralStorage/i.test(
      p,
    )
  ) {
    return "organization";
  }
  return "other";
}

export function footprintFor(typePath: string): Size {
  for (const [re, size] of SIZE_RULES) {
    if (re.test(typePath)) return size;
  }
  const category = categorize(typePath);
  if (category === "logistics") return { w: 2, h: 2 };
  if (category === "foundations" || category === "walls" || category === "architecture") return { w: 8, h: 8 };
  if (category === "power") return { w: 2, h: 2 };
  return { w: 6, h: 6 };
}

export function isConveyorMonitor(type: string): boolean {
  return /ConveyorMonitor|ThroughputMonitor/i.test(type) && !/ResourceSink/i.test(type);
}

export function prettyType(type: string): string {
  return type
    .replace(/Mk(\d)/i, " Mk.$1")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

export function displayName(type: string): string {
  const tidy = (value: string) => value.replace(/[\u00A0\u202F\u2007\u2009]/g, " ").replace(/\s+/g, " ").trim();
  if (DOCS_NAMES[type]) return tidy(DOCS_NAMES[type]);
  const mk1 = type.replace(/Mk\d+$/i, "Mk1");
  if (mk1 !== type && DOCS_NAMES[mk1]) return tidy(DOCS_NAMES[mk1]);
  return prettyType(type);
}
