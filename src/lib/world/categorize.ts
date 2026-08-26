import type { EntityCategory } from "./types";

export const CATEGORY_COLORS: Record<EntityCategory, string> = {
  production: "#ff9f43",
  extraction: "#e67e22",
  logistics: "#f6c90e",
  power: "#3ecfcf",
  organization: "#64748b",
  transport: "#a78bfa",
  special: "#f472b6",
  player: "#4ade80",
  vehicle: "#fb7185",
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
  [/Splitter|Merger|PipelineJunction/i, { w: 4, h: 4 }],
  [/HubTerminal|Hub|WorkBench|Mam/i, { w: 16, h: 16 }],
  [/SpaceElevator/i, { w: 30, h: 30 }],
  [/TrainStation|FreightPlatform/i, { w: 16, h: 32 }],
  [/Char_Player|Player/i, { w: 2, h: 2 }],
  [/Tractor|Truck|Explorer|CyberWagon|FactoryCart/i, { w: 8, h: 12 }],
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
  if (/CyberWagon|FactoryCart|Wheeled|Explorer|Tractor|Truck|Golfcart/i.test(p) && !/TrainStation|Railroad/i.test(p)) {
    return "vehicle";
  }
  if (/Miner|OilPump|WaterPump|ResourceWell|FrackingExtractor|Geothermal/i.test(p)) {
    return "extraction";
  }
  if (/Conveyor|Pipeline(?!Pump)|Storage|Splitter|Merger|Lift|PipePump|PipelinePump|Valve|Junction|HyperTube|PipeHyper/i.test(p)) {
    return "logistics";
  }
  if (/TrainStation|Railroad|Train|Drone|JumpPad|LandingPad|Freight/i.test(p)) {
    return "transport";
  }
  if (/Generator|PowerPole|PowerLine|WallOutlet|PowerStorage|PowerSwitch|PriorityPower/i.test(p)) {
    return "power";
  }
  if (/Foundation|Ramp|Wall|Walkway|Stair|Roof|Pillar|Beam|Lookout|Ceiling|Door|Window|Catwalk|Fence/i.test(p)) {
    return "organization";
  }
  if (/HubTerminal|Hub|SpaceElevator|Mam|WorkBench|Workshop|AwesomeSink|RadarTower|Beacon|TheHub/i.test(p)) {
    return "special";
  }
  if (
    /Constructor|Assembler|Manufacturer|Smelter|Foundry|Refinery|Blender|Packager|Particle|Converter|Encoder|Decoder|Nuclear|Accelerator|Mixer|Hadron|Quantum/i.test(
      p,
    )
  ) {
    return "production";
  }
  if (/Vehicle|Locomotive|FreightWagon/i.test(p)) return "vehicle";
  return "other";
}

export function footprintFor(typePath: string): Size {
  for (const [re, size] of SIZE_RULES) {
    if (re.test(typePath)) return size;
  }
  const category = categorize(typePath);
  if (category === "logistics") return { w: 2, h: 2 };
  if (category === "organization") return { w: 8, h: 8 };
  if (category === "power") return { w: 2, h: 2 };
  return { w: 6, h: 6 };
}

export function prettyType(type: string): string {
  return type
    .replace(/Mk(\d)/i, " Mk.$1")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}
