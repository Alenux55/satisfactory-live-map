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

export function iconCandidatesForResource(kind: string): string[] {
  return RESOURCE_ICON_FILES[kind] ?? [];
}

export function iconCandidatesForBuilding(type: string): string[] {
  const pretty = prettyType(type);
  const files = new Set<string>();
  const push = (name: string) => {
    const trimmed = name.replace(/^_+|_+$/g, "");
    if (trimmed) files.add(`${trimmed}.png`);
  };
  push(pretty.replace(/\s+/g, "_"));
  push(pretty.replace(/\s*Mk\.1$/i, "").replace(/\s+/g, "_"));
  push(type.replace(/_/g, ""));
  const mk = pretty.match(/Mk\.(\d)/i);
  if (mk) {
    push(pretty.replace(/\s*Mk\.\d/i, "").replace(/\s+/g, "_") + `_Mk.${mk[1]}`);
  }
  return [...files];
}

export function iconQuery(candidates: string[]): string {
  return candidates.map((file) => encodeURIComponent(file)).join(",");
}

export function iconSrc(candidates: string[]): string | null {
  if (!candidates.length) return null;
  return `/api/icon?file=${encodeURIComponent(candidates[0])}&alt=${iconQuery(candidates.slice(1))}`;
}
