export type NodePurity = "impure" | "normal" | "pure";

/** Purity fill and type outline used on SCIM's node legend (publicly documented; not SCIM source). */
export const PURITY_COLORS: Record<NodePurity, string> = {
  impure: "#d23430",
  normal: "#f26418",
  pure: "#80b139",
};

export const RESOURCE_TYPE_COLORS: Record<string, string> = {
  iron: "#6f505d",
  copper: "#955d57",
  limestone: "#bfb2a8",
  coal: "#505050",
  caterium: "#d2bc96",
  quartz: "#dd9ac9",
  sulfur: "#cdbf66",
  uranium: "#5e8d52",
  bauxite: "#c88c72",
  sam: "#6e2ea9",
  oil: "#141414",
  water: "#a5ccdf",
  nitrogen: "#e8e5c4",
  geyser: "#c0c0ff",
  unknown: "#888888",
};

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  iron: "Iron",
  copper: "Copper",
  limestone: "Limestone",
  coal: "Coal",
  caterium: "Caterium",
  quartz: "Quartz",
  sulfur: "Sulfur",
  uranium: "Uranium",
  bauxite: "Bauxite",
  sam: "SAM",
  oil: "Crude oil",
  water: "Water",
  nitrogen: "Nitrogen",
  geyser: "Geyser",
  unknown: "Unknown",
};

export const RESOURCE_LEGEND_ORDER = [
  "iron",
  "copper",
  "limestone",
  "coal",
  "caterium",
  "quartz",
  "sulfur",
  "uranium",
  "bauxite",
  "sam",
  "oil",
  "water",
  "nitrogen",
  "geyser",
] as const;

export function resourceKind(path: string, typePath = ""): string {
  const s = `${path} ${typePath}`.toLowerCase();
  if (/geyser|geothermal/.test(s)) return "geyser";
  if (/oil|crude/.test(s)) return "oil";
  if (/nitrogen/.test(s)) return "nitrogen";
  if (/bauxite/.test(s)) return "bauxite";
  if (/copper/.test(s)) return "copper";
  if (/caterium|gold/.test(s)) return "caterium";
  if (/iron/.test(s)) return "iron";
  if (/uranium/.test(s)) return "uranium";
  if (/quartz/.test(s)) return "quartz";
  if (/\bsam\b|_sam/i.test(s)) return "sam";
  if (/limestone|desc_stone|ore_stone/.test(s)) return "limestone";
  if (/sulfur/.test(s)) return "sulfur";
  if (/water/.test(s)) return "water";
  if (/coal/.test(s)) return "coal";
  return "unknown";
}

export function parsePurity(raw: unknown): NodePurity {
  if (raw !== null && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    return parsePurity(rec.value ?? rec.pathName ?? rec.name ?? rec.enumValue ?? rec.enumName);
  }
  const text = String(raw ?? "").toLowerCase();
  if (text.includes("pure") && !text.includes("impure") && !text.includes("inpure")) return "pure";
  if (text.includes("impure") || text.includes("inpure")) return "impure";
  if (text === "2" || text.endsWith("_2") || text.includes("rp_pure")) return "pure";
  if (text === "0" || text.endsWith("_0") || text.includes("rp_inpure") || text.includes("rp_impure")) {
    return "impure";
  }
  return "normal";
}
