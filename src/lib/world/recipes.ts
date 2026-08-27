import data from "./recipes-data.json";

export type RecipeIO = { name: string; amount: number };

export type RecipeDef = {
  time: number;
  in: RecipeIO[];
  out: RecipeIO[];
};

const INDEX = new Map<string, RecipeDef>();

function keyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/^alternate:\s+/i, "alternate ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

for (const [name, def] of Object.entries(data as Record<string, RecipeDef>)) {
  INDEX.set(keyOf(name), def);
  INDEX.set(keyOf(name.replace(/^Alternate:\s+/i, "Alternate ")), def);
}

export function lookupRecipe(name: string | undefined): RecipeDef | null {
  if (!name) return null;
  return INDEX.get(keyOf(name)) ?? INDEX.get(keyOf(name.replace(/^Recipe\s+/i, ""))) ?? null;
}

export function perMinute(amount: number, time: number): number {
  if (time <= 0) return 0;
  return (amount / time) * 60;
}

export function clockFactor(clockPercent: number | undefined, somersloops: number | undefined): number {
  const clock = (clockPercent ?? 100) / 100;
  const sloops = somersloops ?? 0;
  return clock * (sloops > 0 ? 2 ** sloops : 1);
}

const PURITY_MULT = { impure: 0.5, normal: 1, pure: 2 } as const;

export function extractorOutputPerMin(type: string, purity?: string): number | null {
  const p = (purity === "impure" || purity === "pure" ? purity : "normal") as keyof typeof PURITY_MULT;
  const t = type.toLowerCase();
  if (/minermk3/.test(t)) return 240 * PURITY_MULT[p];
  if (/minermk2/.test(t)) return 120 * PURITY_MULT[p];
  if (/miner/.test(t)) return 60 * PURITY_MULT[p];
  if (/oilpump|oilextractor/.test(t)) return 120 * PURITY_MULT[p];
  if (/waterpump|waterextractor/.test(t)) return 120;
  return null;
}

export function formatRate(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
