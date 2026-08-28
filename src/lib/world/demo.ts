import { GRID_METERS, WORLD_X_MIN, WORLD_Y_SOUTH } from "./coords";
import type { MapEntity } from "./types";

const OX = WORLD_X_MIN + 2 * GRID_METERS + 420; // Grass Fields (X2 Y0)
const OY = WORLD_Y_SOUTH - 380;

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `demo:${prefix}:${seq}`;
}

function machine(
  type: string,
  category: MapEntity["category"],
  x: number,
  y: number,
  yaw: number,
  w: number,
  h: number,
  extra?: Partial<MapEntity>,
): MapEntity {
  return {
    id: extra?.id ?? id(type),
    type,
    category,
    x,
    y,
    z: extra?.z ?? 0,
    yaw,
    w,
    h,
    recipe: extra?.recipe,
    label: extra?.label,
    path: extra?.path,
    purity: extra?.purity,
    claimed: extra?.claimed,
    resource: extra?.resource,
    clock: extra?.clock,
    powerShards: extra?.powerShards,
    somersloops: extra?.somersloops,
    production: extra?.production,
    throughput: extra?.throughput,
    throughputConfidence: extra?.throughputConfidence,
  };
}

function belt(x0: number, y0: number, x1: number, y1: number, mk = 1): MapEntity {
  return machine(`ConveyorBeltMk${mk}`, "logistics", x0, y0, 0, 2, 2, {
    path: [
      [x0, y0],
      [x1, y1],
    ],
  });
}

function foundationGrid(count: number): MapEntity[] {
  const out: MapEntity[] = [];
  const cols = 12;
  const rows = Math.ceil(count / cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out.length >= count) return out;
      out.push(
        machine("Foundation_8x4_01", "foundations", OX + c * 8, OY + r * 8, 0, 8, 8, {
          id: `demo:foundation:${r}:${c}`,
        }),
      );
    }
  }
  return out;
}

/**
 * A growing Grass Fields starter factory. Each tick adds machines so the live
 * delta pipeline is visible without a real save file.
 */
export function buildDemoWorld(tick: number): MapEntity[] {
  seq = 1000;
  const t = Math.max(0, tick);
  const entities: MapEntity[] = [];

  entities.push(
    machine("Hub", "special", OX + 8, OY - 24, 0, 20, 16, {
      id: "demo:hub",
      label: "The HUB",
    }),
    machine("SpaceElevator", "special", OX + 90, OY - 80, 15, 28, 28, {
      id: "demo:elevator",
      label: "Space Elevator",
    }),
    machine("Char_Player", "player", OX + 12 + Math.sin(t / 2) * 18, OY - 10 + Math.cos(t / 3) * 8, t * 25, 2, 2, {
      id: "demo:player",
      label: "Pioneer",
      somersloops: 1,
    }),
    machine("Crate", "crates", OX + 28, OY - 18, 0, 3, 3, {
      id: "demo:crate:dismantle",
      label: "Dismantle Crate",
    }),
    machine("DeathCrate", "crates", OX - 16, OY - 32, 40, 3, 3, {
      id: "demo:crate:death",
      label: "Death Crate",
    }),
  );

  const foundationCount = Math.min(96, 24 + t * 4);
  entities.push(...foundationGrid(foundationCount));

  const minerCount = Math.min(3, 1 + Math.floor(t / 2));
  entities.push(
    machine("Iron", "resource", OX - 40, OY + 8, 0, 10, 10, {
      id: "demo:node:iron-0",
      resource: "iron",
      purity: "pure",
      claimed: minerCount >= 1,
      label: "Iron · Pure",
    }),
    machine("Iron", "resource", OX - 40, OY + 30, 0, 10, 10, {
      id: "demo:node:iron-1",
      resource: "iron",
      purity: "normal",
      claimed: minerCount >= 2,
      label: "Iron · Normal",
    }),
    machine("Copper", "resource", OX - 70, OY - 20, 0, 10, 10, {
      id: "demo:node:copper",
      resource: "copper",
      purity: "impure",
      claimed: false,
      label: "Copper · Impure",
    }),
    machine("Limestone", "resource", OX + 40, OY - 50, 0, 10, 10, {
      id: "demo:node:limestone",
      resource: "limestone",
      purity: "pure",
      claimed: false,
      label: "Limestone · Pure",
    }),
    machine("Coal", "resource", OX + 24, OY + 90, 0, 10, 10, {
      id: "demo:node:coal",
      resource: "coal",
      purity: "normal",
      claimed: false,
      label: "Coal · Normal",
    }),
    machine("Water", "resource", OX - 70, OY + 40, 0, 10, 10, {
      id: "demo:node:water",
      resource: "water",
      purity: "normal",
      claimed: t >= 8,
      label: "Water · Normal",
    }),
    machine("Geyser", "resource", OX + 110, OY - 40, 0, 10, 10, {
      id: "demo:node:geyser",
      resource: "geyser",
      purity: "pure",
      claimed: false,
      label: "Geyser · Pure",
    }),
  );
  for (let i = 0; i < minerCount; i++) {
    const mx = OX - 40;
    const my = OY + 8 + i * 22;
    entities.push(
      machine("MinerMk1", "production", mx, my, 90, 16, 16, {
        id: `demo:miner:${i}`,
        recipe: "Iron Ore",
      }),
    );
    entities.push(belt(mx + 10, my, OX - 4, my, 1));
  }

  const smelterCount = Math.min(8, 2 + t);
  for (let i = 0; i < smelterCount; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const sx = OX + 4 + col * 12;
    const sy = OY + 8 + row * 18;
    entities.push(
      machine("SmelterMk1", "production", sx, sy, 0, 6, 9, {
        id: `demo:smelter:${i}`,
        recipe: "Iron Ingot",
      }),
    );
    if (i < minerCount) {
      entities.push(belt(OX - 4, OY + 8 + i * 22, sx - 4, sy, 1));
    }
    entities.push(belt(sx + 4, sy, sx + 16, sy, 1));
  }

  const constructorCount = Math.min(10, Math.max(0, t - 1));
  for (let i = 0; i < constructorCount; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const cx = OX + 28 + col * 14;
    const cy = OY + 8 + row * 20;
    entities.push(
      machine("ConstructorMk1", "production", cx, cy, 0, 8, 10, {
        id: `demo:constructor:${i}`,
        recipe: i % 2 === 0 ? "Iron Plate" : "Iron Rod",
        clock: i === 0 ? 150 : i === 1 ? 150 : 100,
        powerShards: i === 0 || i === 1 ? 1 : undefined,
        somersloops: i === 0 || i === 2 ? 1 : undefined,
        production: i === 0 ? 300 : i === 1 ? 150 : i === 2 ? 200 : 100,
      }),
    );
    entities.push(belt(cx + 6, cy, cx + 18, cy, 2));
  }

  if (t >= 3) {
    entities.push(
      machine("StorageContainerMk1", "logistics", OX + 96, OY + 16, 0, 5, 5, {
        id: "demo:storage:0",
      }),
      machine("StorageContainerMk1", "logistics", OX + 96, OY + 28, 0, 5, 5, {
        id: "demo:storage:1",
      }),
    );
    entities.push(belt(OX + 90, OY + 16, OX + 93, OY + 16, 2));
    entities.push(belt(OX + 90, OY + 28, OX + 93, OY + 28, 2));
    entities.push(
      machine("ConveyorMonitor", "logistics", OX + 91.5, OY + 16, 0, 3, 3, {
        id: "demo:monitor:0",
        throughput: 120,
        throughputConfidence: 100,
      }),
      machine("ConveyorMonitor", "logistics", OX + 91.5, OY + 28, 0, 3, 3, {
        id: "demo:monitor:1",
        throughput: 12,
        throughputConfidence: 70,
      }),
    );
  }

  const poleCount = Math.min(12, 4 + t);
  for (let i = 0; i < poleCount; i++) {
    const px = OX + (i % 6) * 16;
    const py = OY + 48 + Math.floor(i / 6) * 16;
    entities.push(
      machine("PowerPoleMk1", "power", px, py, 0, 1.5, 1.5, {
        id: `demo:pole:${i}`,
      }),
    );
    if (i > 0) {
      const prevX = OX + ((i - 1) % 6) * 16;
      const prevY = OY + 48 + Math.floor((i - 1) / 6) * 16;
      entities.push(
        machine("PowerLine", "power", prevX, prevY, 0, 1, 1, {
          id: `demo:line:${i}`,
          path: [
            [prevX, prevY],
            [px, py],
          ],
        }),
      );
    }
  }

  if (t >= 4) {
    entities.push(
      machine("GeneratorBiomass_C", "power", OX + 8, OY + 64, 180, 8, 8, {
        id: "demo:biomass",
        recipe: "Leaves",
      }),
      machine("GeneratorCoal_C", "power", OX + 24, OY + 64, 180, 16, 16, {
        id: "demo:coal",
        recipe: "Coal",
        clock: 150,
        powerShards: 1,
        production: 150,
      }),
    );
  }

  if (t >= 6) {
    entities.push(
      machine("AssemblerMk1", "production", OX + 40, OY + 72, 0, 10, 15, {
        id: "demo:assembler:0",
        recipe: "Reinforced Iron Plate",
      }),
      machine("Tractor", "transport", OX - 12, OY - 8, 40 + t * 8, 6, 10, {
        id: "demo:tractor",
        label: "Tractor",
      }),
    );
  }

  if (t >= 8) {
    entities.push(
      machine("WaterPump", "production", OX - 70, OY + 40, 0, 12, 12, {
        id: "demo:water",
      }),
      machine("PipelineMk1", "logistics", OX - 70, OY + 40, 0, 1, 1, {
        id: "demo:pipe",
        path: [
          [OX - 70, OY + 40],
          [OX - 20, OY + 40],
          [OX - 20, OY + 64],
          [OX + 8, OY + 64],
        ],
      }),
    );
  }

  return entities;
}

export const DEMO_HEADER = {
  sessionName: "Grass Fields — live demo",
  mapName: "Persistent_Level",
  playDurationSeconds: 60 * 47,
  saveDateTime: new Date().toISOString(),
  buildVersion: 0,
};
