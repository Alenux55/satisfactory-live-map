import type { MapEntity } from "./types";
import { RESOURCE_TYPE_LABELS, type NodePurity } from "./resource";
import catalog from "./vanilla-nodes.json";

/** Save files omit static level data (resource class / purity). Match the vanilla map. */
const MATCH_M = 22;

type VanillaNode = {
  id: string;
  x: number;
  y: number;
  resource: string;
  purity: NodePurity;
};

const nodes = catalog as VanillaNode[];
const byId = new Map(nodes.map((node) => [node.id, node]));

function actorName(id: string): string {
  return id.split(".").pop() ?? id;
}

function nearest(x: number, y: number): VanillaNode | undefined {
  let best: VanillaNode | undefined;
  let bestDist = MATCH_M;
  for (const node of nodes) {
    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist < bestDist) {
      best = node;
      bestDist = dist;
    }
  }
  return best;
}

export function applyVanillaNodeCatalog(entities: MapEntity[]): void {
  for (const entity of entities) {
    if (entity.category !== "resource") continue;
    const name = actorName(entity.id);
    const match = byId.get(name) ?? nearest(entity.x, entity.y);
    if (!match) continue;
    entity.resource = match.resource;
    entity.purity = match.purity;
    const pretty = RESOURCE_TYPE_LABELS[match.resource] ?? match.resource;
    const purityLabel = match.purity.charAt(0).toUpperCase() + match.purity.slice(1);
    entity.type = pretty;
    entity.label = `${pretty} · ${purityLabel}`;
  }
}
