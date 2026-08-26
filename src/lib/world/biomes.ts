import { GRID_METERS, WORLD_X_MIN, WORLD_Y_NORTH, WORLD_Y_SOUTH, WORLD_X_MAX } from "./coords";

type Biome = {
  name: string;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  fill: string;
};

const BIOMES: Biome[] = [
  { name: "Western Dune Forest", gx: 0, gy: 1, gw: 1.2, gh: 1.6, fill: "#6b8f4e" },
  { name: "Rocky Desert", gx: 0.1, gy: 3.1, gw: 2.0, gh: 1.8, fill: "#c9a56a" },
  { name: "Grass Fields", gx: 1.7, gy: 0.05, gw: 1.4, gh: 1.15, fill: "#7dae4c" },
  { name: "Snaketree Forest", gx: 1.9, gy: 1.05, gw: 1.1, gh: 0.9, fill: "#4f7d3a" },
  { name: "Jungle Spires", gx: 0.9, gy: 1.0, gw: 1.1, gh: 1.0, fill: "#3f6b32" },
  { name: "Red Jungle", gx: 1.05, gy: 2.05, gw: 1.15, gh: 1.0, fill: "#9a3b32" },
  { name: "Red Bamboo", gx: 2.05, gy: 2.05, gw: 1.2, gh: 0.95, fill: "#b44a3a" },
  { name: "Northern Forest", gx: 2.1, gy: 3.6, gw: 2.1, gh: 1.4, fill: "#3d6a3a" },
  { name: "Crater Lakes", gx: 1.95, gy: 3.05, gw: 1.1, gh: 0.7, fill: "#4d7c6a" },
  { name: "Lake Forest", gx: 3.0, gy: 3.05, gw: 1.05, gh: 0.85, fill: "#4a7a48" },
  { name: "Desert Canyons", gx: 2.3, gy: 3.9, gw: 1.8, gh: 0.8, fill: "#b08958" },
  { name: "Maze Canyons", gx: 3.9, gy: 3.05, gw: 1.05, gh: 0.9, fill: "#a9845c" },
  { name: "Titan Forest", gx: 3.15, gy: 2.1, gw: 2.0, gh: 1.15, fill: "#2f5a32" },
  { name: "Eastern Dune Forest", gx: 3.15, gy: 1.05, gw: 1.8, gh: 1.0, fill: "#6a8a4a" },
  { name: "Southern Forest", gx: 3.05, gy: 0.05, gw: 1.4, gh: 1.1, fill: "#356c5c" },
  { name: "Blue Crater", gx: 4.05, gy: 0.05, gw: 1.15, gh: 1.2, fill: "#3d6d7a" },
  { name: "Abyss Cliffs", gx: 5.05, gy: 0.95, gw: 1.0, gh: 1.05, fill: "#6a6e78" },
  { name: "Swamp", gx: 4.95, gy: 1.95, gw: 1.15, gh: 1.05, fill: "#3a5a40" },
  { name: "Spire Coast", gx: 3.4, gy: 4.2, gw: 2.3, gh: 1.4, fill: "#4e7d62" },
  { name: "Dune Desert", gx: 5.05, gy: 3.15, gw: 1.7, gh: 2.4, fill: "#d4b06a" },
];

function gridRect(b: Biome): { x: number; y: number; w: number; h: number } {
  const x = b.gx * GRID_METERS;
  const south = WORLD_Y_SOUTH - WORLD_Y_NORTH; // 7500
  const y = south - (b.gy + b.gh) * GRID_METERS;
  return { x: x, y, w: b.gw * GRID_METERS, h: b.gh * GRID_METERS };
}

/** Original schematic overlay — not game art, not SCIM tiles. */
export function biomeMapSvg(): string {
  const width = WORLD_X_MAX - WORLD_X_MIN;
  const height = WORLD_Y_SOUTH - WORLD_Y_NORTH;
  const regions = BIOMES.map((b) => {
    const r = gridRect(b);
    return `
      <g>
        <rect x="${r.x.toFixed(0)}" y="${r.y.toFixed(0)}" width="${r.w.toFixed(0)}" height="${r.h.toFixed(0)}"
          rx="180" ry="180" fill="${b.fill}" fill-opacity="0.88" stroke="#0b1220" stroke-width="18"/>
        <text x="${(r.x + r.w / 2).toFixed(0)}" y="${(r.y + r.h / 2).toFixed(0)}"
          text-anchor="middle" font-size="92" font-family="ui-sans-serif, system-ui, sans-serif"
          fill="#0b1220" fill-opacity="0.72" font-weight="700">${b.name}</text>
      </g>`;
  }).join("");

  const gridLines: string[] = [];
  for (let g = 0; g <= 8; g++) {
    const x = g * GRID_METERS;
    const yFromSouth = height - g * GRID_METERS;
    gridLines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#09101c" stroke-opacity="0.28" stroke-width="6"/>`,
    );
    gridLines.push(
      `<line x1="0" y1="${yFromSouth}" x2="${width}" y2="${yFromSouth}" stroke="#09101c" stroke-opacity="0.28" stroke-width="6"/>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="ocean" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#16324a"/>
      <stop offset="100%" stop-color="#0c1c2c"/>
    </linearGradient>
    <filter id="soft">
      <feGaussianBlur stdDeviation="40"/>
    </filter>
    <clipPath id="island">
      <path d="M 620 1180
        C 980 420, 1880 260, 2920 340
        C 4100 460, 5480 720, 6780 1260
        C 7420 1680, 7580 2480, 7360 3380
        C 7120 4480, 6680 5380, 5720 6020
        C 4780 6620, 3520 7040, 2280 6860
        C 1260 6700, 420 6020, 280 4920
        C 140 3840, 180 2460, 620 1180 Z"/>
    </clipPath>
  </defs>
  <rect width="100%" height="100%" fill="url(#ocean)"/>
  <ellipse cx="1400" cy="4200" rx="900" ry="520" fill="#1b3a52" opacity="0.55"/>
  <ellipse cx="6900" cy="2400" rx="700" ry="900" fill="#1b3a52" opacity="0.4"/>
  <g clip-path="url(#island)">
    <rect width="100%" height="100%" fill="#2d4a32"/>
    ${regions}
    ${gridLines.join("\n")}
  </g>
  <path d="M 620 1180
        C 980 420, 1880 260, 2920 340
        C 4100 460, 5480 720, 6780 1260
        C 7420 1680, 7580 2480, 7360 3380
        C 7120 4480, 6680 5380, 5720 6020
        C 4780 6620, 3520 7040, 2280 6860
        C 1260 6700, 420 6020, 280 4920
        C 140 3840, 180 2460, 620 1180 Z"
        fill="none" stroke="#f4c37d" stroke-opacity="0.35" stroke-width="14"/>
  <text x="${width / 2}" y="220" text-anchor="middle" fill="#e8d5a8" font-size="120"
    font-family="ui-sans-serif, system-ui, sans-serif" letter-spacing="8">MASSAGE-2(A-B)b</text>
  <text x="${width / 2}" y="360" text-anchor="middle" fill="#9bb0c4" font-size="64"
    font-family="ui-sans-serif, system-ui, sans-serif">Schematic biome grid · not SCIM tiles</text>
</svg>`;
}

export function biomeMapDataUrl(): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(biomeMapSvg())}`;
}
