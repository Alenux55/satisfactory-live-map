import { prettyType } from "./categorize";

export const RESOURCE_ICON_FILES: Record<string, string[]> = {
  iron: ["Iron_Ore.png"],
  copper: ["Copper_Ore.png"],
  limestone: ["Limestone.png"],
  coal: ["Coal.png"],
  caterium: ["Caterium_Ore.png"],
  quartz: ["Raw_Quartz.png"],
  sulfur: ["Sulfur.png"],
  uranium: ["Uranium.png"],
  bauxite: ["Bauxite.png"],
  sam: ["SAM.png"],
  oil: ["Crude_Oil.png"],
  water: ["Water.png"],
  nitrogen: ["Nitrogen_Gas.png"],
  geyser: ["Geyser.png", "Geothermal_Generator.png"],
  unknown: [],
};

/** Wiki.gg File: names that don't follow `{Pretty}_{Mk.N}` from the save type. */
const BUILDING_ICON_ALIASES: Record<string, string[]> = {
  AwesomeSink: ["AWESOME_Sink.png"],
  AwesomeShop: ["AWESOME_Shop.png"],
  Conveyor: ["Conveyor_Belt_Mk.1.png", "Conveyor_Belt.png"],
  Converter: ["Converter.png"],
  FrackingExtractor: ["Resource_Well_Extractor.png"],
  FrackingSmasher: ["Resource_Well_Pressurizer.png"],
  GeneratorBiomass: ["Biomass_Burner.png"],
  GeneratorCoal: ["Coal-Powered_Generator.png", "Coal_Generator.png"],
  GeneratorFuel: ["Fuel_Generator.png"],
  GeneratorGeoThermal: ["Geothermal_Generator.png"],
  GeneratorIntegratedBiomass: ["Biomass_Burner.png"],
  GeneratorNuclear: ["Nuclear_Power_Plant.png"],
  HubTerminal: ["The_HUB.png", "HUB.png"],
  JumpPad: ["Jump_Pad.png"],
  JumpPadAdjustable: ["Jump_Pad.png"],
  Mam: ["MAM.png"],
  OilPump: ["Oil_Extractor.png"],
  OilRefinery: ["Oil_Refinery.png"],
  ParticleAccelerator: ["Particle_Accelerator.png"],
  PipeHyper: ["Hypertube.png"],
  PipeHyperStart: ["Hypertube_Entrance.png"],
  PipelineSupport: ["Pipeline_Support.png"],
  PowerStorage: ["Power_Storage.png"],
  PowerSwitch: ["Power_Switch.png"],
  PriorityPowerSwitch: ["Priority_Power_Switch.png"],
  QuantumEncoder: ["Quantum_Encoder.png"],
  RadarTower: ["Radar_Tower.png"],
  ResourceWellExtractor: ["Resource_Well_Extractor.png"],
  ResourceWellPressurizer: ["Resource_Well_Pressurizer.png"],
  SpaceElevator: ["Space_Elevator.png"],
  TradingPost: ["The_HUB.png"],
  WaterPump: ["Water_Extractor.png"],
  WorkBench: ["Craft_Bench.png"],
  Workshop: ["Equipment_Workshop.png"],
};

export function iconCandidatesForResource(kind: string): string[] {
  return RESOURCE_ICON_FILES[kind] ?? [];
}

function fileName(name: string): string | null {
  const trimmed = name.replace(/\.png$/i, "").replace(/^_+|_+$/g, "").replace(/\s+/g, "_");
  if (!trimmed) return null;
  return `${trimmed}.png`;
}

export function iconCandidatesForBuilding(type: string): string[] {
  const pretty = prettyType(type);
  const files = new Set<string>();
  const push = (name: string) => {
    const file = fileName(name);
    if (file) files.add(file);
  };

  const baseType = type.replace(/Mk\d+$/i, "");
  for (const key of [type, baseType]) {
    for (const alias of BUILDING_ICON_ALIASES[key] ?? []) push(alias);
  }

  push(pretty);
  const mk = pretty.match(/^(.*?)\s*Mk\.?\s*(\d+)$/i);
  if (mk) {
    const base = mk[1].trim();
    const n = mk[2];
    push(`${base} Mk.${n}`);
    push(`${base}_Mk.${n}`);
    push(`${base} Mk${n}`);
    push(`${base}${n}`);
    if (n === "1") push(base);
  } else {
    push(pretty.replace(/\s+/g, "_"));
  }

  const gen = type.match(/^Generator(.+)$/i);
  if (gen) {
    const kind = prettyType(gen[1]);
    push(`${kind} Generator`);
    push(`${kind}-Powered Generator`);
    push(`${kind} Powered Generator`);
  }

  push(type.replace(/_/g, ""));
  return [...files];
}

export function iconQuery(candidates: string[]): string {
  return candidates.map((file) => encodeURIComponent(file)).join(",");
}

export function iconSrc(candidates: string[]): string | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return `/api/icon?file=${encodeURIComponent(candidates[0])}`;
  return `/api/icon?file=${encodeURIComponent(candidates[0])}&alt=${iconQuery(candidates.slice(1))}`;
}
