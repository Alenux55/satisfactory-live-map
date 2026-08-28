import { displayName, prettyType } from "./categorize";

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
  AlienPowerAugmenter: ["Alien_Power_Augmenter.png"],
  AlienPowerBuilding: ["Alien_Power_Augmenter.png"],
  Crate: ["Crate.png"],
  DeathCrate: ["Death_Crate.png", "Crate.png"],
  AwesomeSink: ["AWESOME_Sink.png"],
  AwesomeShop: ["AWESOME_Shop.png"],
  BlueprintDesigner: ["Blueprint_Designer.png"],
  Conveyor: ["Conveyor_Belt_Mk.1.png", "Conveyor_Belt.png"],
  ConveyorMonitor: ["Conveyor_Throughput_Monitor.png"],
  ThroughputMonitor: ["Conveyor_Throughput_Monitor.png"],
  Converter: ["Converter.png"],
  DroneStation: ["Drone_Port.png"],
  FrackingExtractor: ["Resource_Well_Extractor.png"],
  FrackingSmasher: ["Resource_Well_Pressurizer.png"],
  GeneratorBiomass: ["Biomass_Burner.png"],
  GeneratorCoal: ["Coal-Powered_Generator.png", "Coal_Generator.png"],
  GeneratorFuel: ["Fuel-Powered_Generator.png", "Fuel_Generator.png"],
  GeneratorGeoThermal: ["Geothermal_Generator.png"],
  GeneratorIntegratedBiomass: ["Biomass_Burner.png"],
  GeneratorNuclear: ["Nuclear_Power_Plant.png"],
  HubTerminal: ["The_HUB.png", "HUB.png"],
  JumpPad: ["Jump_Pad.png"],
  JumpPadAdjustable: ["Jump_Pad.png"],
  LandingPad: ["U-Jelly_Landing_Pad.png", "Landing_Pad.png"],
  Mam: ["MAM.png"],
  OilPump: ["Oil_Extractor.png"],
  OilRefinery: ["Oil_Refinery.png"],
  ParticleAccelerator: ["Particle_Accelerator.png"],
  PipeHyper: ["Hypertube.png"],
  PipeHyperStart: ["Hypertube_Entrance.png"],
  PipeHyperSupport: ["Hypertube_Support.png"],
  PipeHyperJunction: ["Hypertube_Junction.png"],
  PipelineSupport: ["Pipeline_Support.png"],
  PowerStorage: ["Power_Storage.png"],
  PowerSwitch: ["Power_Switch.png"],
  PowerTower: ["Power_Tower.png"],
  PowerTowerPlatform: ["Power_Tower_Platform.png"],
  PriorityPowerSwitch: ["Priority_Power_Switch.png"],
  QuantumEncoder: ["Quantum_Encoder.png"],
  RadarTower: ["Radar_Tower.png"],
  ResourceSinkShop: ["AWESOME_Shop.png"],
  ResourceWellExtractor: ["Resource_Well_Extractor.png"],
  ResourceWellPressurizer: ["Resource_Well_Pressurizer.png"],
  SpaceElevator: ["Space_Elevator.png"],
  TradingPost: ["The_HUB.png"],
  TruckStation: ["Truck_Station.png"],
  WaterPump: ["Water_Extractor.png"],
  WorkBench: ["Crafting_Bench.png", "Craft_Bench.png"],
  WorkBenchIntegrated: ["Crafting_Bench.png", "Craft_Bench.png"],
  Workshop: ["Equipment_Workshop.png"],
};

const FAMILY_ICON_FALLBACKS: [RegExp, string[]][] = [
  [/QuarterPipe/i, ["Quarter_Pipe_(FICSIT).png", "Quarter_Pipe.png"]],
  [/InvertedRamp|Inv.?Ramp/i, ["Inv._Ramp_4m_(FICSIT).png", "Inverted_Ramp.png"]],
  [/RampWall/i, ["Ramp_Wall_4m_(FICSIT).png"]],
  [/ConveyorWall/i, ["Conveyor_Wall_x2_(FICSIT).png", "Conveyor_Wall.png"]],
  [/Foundation/i, ["Foundation_4m_(FICSIT).png", "Foundation.png"]],
  [/Ramp/i, ["Ramp_4m_(FICSIT).png", "Ramp.png"]],
  [/Window/i, ["Frame_Window_(FICSIT).png", "Window.png"]],
  [/Door/i, ["Side_Door_Wall_(FICSIT).png", "Door.png"]],
  [/Wall/i, ["Basic_Wall_4m_(FICSIT).png", "Wall.png"]],
  [/Roof/i, ["FICSIT_Roof_4m.png", "Roof.png"]],
  [/Walkway|Catwalk/i, ["Walkway_Straight.png", "Walkway.png"]],
  [/Pillar/i, ["Big_Pillar_Support.png", "Pillar.png"]],
  [/Beam/i, ["Metal_Beam.png", "Beam.png"]],
  [/Railing|Fence/i, ["Modern_Railing.png", "Railing.png"]],
  [/Stair/i, ["Stairs_Left.png", "Stairs.png"]],
  [/PowerPole/i, ["Power_Pole_Mk.1.png", "Power_Pole.png"]],
  [/WallOutlet/i, ["Wall_Outlet_Mk.1.png", "Wall_Outlet.png"]],
  [/ConveyorBelt/i, ["Conveyor_Belt_Mk.1.png"]],
  [/ConveyorLift/i, ["Conveyor_Lift_Mk.1.png"]],
  [/ConveyorPole/i, ["Conveyor_Pole.png"]],
  [/Pipeline/i, ["Pipeline_Mk.1.png", "Pipeline.png"]],
  [/Sign/i, ["Display_Sign.png", "Sign.png"]],
  [/Floodlight|StreetLight|CeilingLight|Light/i, ["Wall_Mounted_Flood_Light.png", "Flood_Light.png"]],
];

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

  const baseType = type.replace(/Mk\d+$/i, "").replace(/_\d+$/, "");
  for (const key of [type, baseType]) {
    for (const alias of BUILDING_ICON_ALIASES[key] ?? []) push(alias);
  }

  push(pretty);
  const official = displayName(type);
  if (official !== pretty) push(official);
  const stripped = pretty.replace(/\s+\d+$/, "").replace(/\s+\d+x\d+\s*/i, " ").trim();
  if (stripped !== pretty) push(stripped);

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

  for (const [re, names] of FAMILY_ICON_FALLBACKS) {
    if (re.test(type) || re.test(pretty)) {
      for (const name of names) push(name);
      break;
    }
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
