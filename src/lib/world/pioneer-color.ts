export const PIONEER_COLORS = [
  "#4ade80",
  "#38bdf8",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#22d3ee",
  "#fb7185",
  "#a3e635",
  "#fb923c",
  "#818cf8",
  "#2dd4bf",
  "#e879f9",
];

export function pioneerColor(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return PIONEER_COLORS[Math.abs(hash) % PIONEER_COLORS.length];
}
