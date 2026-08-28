export type NodePurity = "impure" | "normal" | "pure";

/** Purity is the circle fill. Orange / yellow / green per the map legend. */
export const PURITY_COLORS: Record<NodePurity, string> = {
  impure: "#f97316",
  normal: "#eab308",
  pure: "#22c55e",
};

/** Claimed ring. Cyan so it is not confused with purity fill or the cream selection halo. */
export const CLAIMED_RING_COLOR = "#22d3ee";
/** Click / layer-highlight halo. Larger and cream, kept separate from claimed. */
export const SELECT_RING_COLOR = "#fff7ed";

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
  if (/uranium/.test(s)) return "uranium";
  if (/quartz/.test(s)) return "quartz";
  if (/\bsam\b|_sam|desc_sam|ore_sam/.test(s)) return "sam";
  if (/limestone|desc_stone|ore_stone|rawstone/.test(s)) return "limestone";
  if (/sulfur/.test(s)) return "sulfur";
  if (/water/.test(s)) return "water";
  if (/coal/.test(s)) return "coal";
  if (/iron/.test(s)) return "iron";
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
