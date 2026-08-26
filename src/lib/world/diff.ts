import { EMPTY_COUNTS, type CategoryCounts, type MapEntity } from "./types";

export function fingerprint(entity: MapEntity): string {
  const path = entity.path
    ? entity.path.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(";")
    : "";
  return [
    entity.type,
    entity.x.toFixed(2),
    entity.y.toFixed(2),
    entity.z.toFixed(1),
    entity.yaw.toFixed(1),
    entity.recipe ?? "",
    entity.label ?? "",
    path,
  ].join("|");
}

export function countCategories(entities: Iterable<MapEntity>): CategoryCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const entity of entities) {
    counts[entity.category] += 1;
  }
  return counts;
}

export function diffWorld(
  previous: Map<string, MapEntity>,
  next: Map<string, MapEntity>,
): { added: MapEntity[]; updated: MapEntity[]; removed: string[] } {
  const added: MapEntity[] = [];
  const updated: MapEntity[] = [];
  const removed: string[] = [];

  for (const [id, entity] of next) {
    const prior = previous.get(id);
    if (!prior) {
      added.push(entity);
    } else if (fingerprint(prior) !== fingerprint(entity)) {
      updated.push(entity);
    }
  }

  for (const id of previous.keys()) {
    if (!next.has(id)) removed.push(id);
  }

  return { added, updated, removed };
}

export function applyDelta(
  entities: Map<string, MapEntity>,
  delta: { added: MapEntity[]; updated: MapEntity[]; removed: string[] },
): Map<string, MapEntity> {
  const next = new Map(entities);
  for (const id of delta.removed) next.delete(id);
  for (const entity of delta.updated) next.set(entity.id, entity);
  for (const entity of delta.added) next.set(entity.id, entity);
  return next;
}
