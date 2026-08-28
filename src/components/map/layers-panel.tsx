"use client";

import { useMemo, useState } from "react";
import { Layers, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { WikiIcon } from "@/components/map/wiki-icon";
import {
  BOOST_HIGHLIGHT,
  BUILDER_MENU,
  boostPinIsActive,
  boostTypeHighlightKey,
  boostTypeIsPinned,
  categoryHighlightKey,
  entityMatchesBoostPin,
  layerIcons,
  layerKey,
  layerLabel,
  subcategoryHighlightKey,
  subcategoryId,
  toggleBoostKindAll,
  toggleBoostKindType,
  type BoostKind,
  type BoostKindPin,
  type BoostPin,
} from "@/lib/world/builder-menu";
import { CATEGORY_COLORS } from "@/lib/world/categorize";
import { RESOURCE_TYPE_LABELS, CLAIMED_RING_COLOR } from "@/lib/world/resource";
import { DEFAULT_LAYERS, type EntityCategory, type MapEntity } from "@/lib/world/types";
import { iconCandidatesForBuilding, iconCandidatesForResource } from "@/lib/world/icons";
import { pioneerColor } from "@/lib/world/pioneer-color";
import { cn } from "@/lib/utils";

type BoostTypeRow = {
  key: string;
  label: string;
  icons: string[];
  color?: string;
  buildings: number;
  items: number;
};

function addBoostTypeRow(index: Map<string, BoostTypeRow>, entity: MapEntity, items: number) {
  const key = layerKey(entity);
  let row = index.get(key);
  if (!row) {
    row = {
      key,
      label: layerLabel(entity),
      icons: layerIcons(entity),
      color: entity.category === "player" ? pioneerColor(entity.id) : undefined,
      buildings: 0,
      items: 0,
    };
    index.set(key, row);
  }
  row.buildings += 1;
  row.items += items;
}

function sortBoostTypeRows(rows: BoostTypeRow[]): BoostTypeRow[] {
  return rows.sort((a, b) => b.items - a.items || b.buildings - a.buildings || a.label.localeCompare(b.label));
}

type LayerFlags = Record<EntityCategory, boolean>;

type TypeRow = {
  key: string;
  label: string;
  count: number;
  icons: string[];
  sub: string;
  claimed?: number;
  unclaimed?: number;
  color?: string;
};

export function LayersPanel({
  entities,
  layers,
  hiddenTypes,
  hiddenSubs,
  onLayers,
  onHiddenTypes,
  onHiddenSubs,
  onHover,
  boostPin,
  onBoostPin,
  showBoosts,
  onShowBoosts,
}: {
  entities: Map<string, MapEntity>;
  layers: LayerFlags;
  hiddenTypes: string[];
  hiddenSubs: string[];
  onLayers: (layers: LayerFlags) => void;
  onHiddenTypes: (hidden: string[]) => void;
  onHiddenSubs: (hidden: string[]) => void;
  onHover: (key: string | null) => void;
  boostPin: BoostPin;
  onBoostPin: (pin: BoostPin) => void;
  showBoosts: boolean;
  onShowBoosts: (on: boolean) => void;
}) {
  const hidden = useMemo(() => new Set(hiddenTypes), [hiddenTypes]);
  const hiddenSubSet = useMemo(() => new Set(hiddenSubs), [hiddenSubs]);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const byCat = new Map<EntityCategory, TypeRow[]>();
    const index = new Map<string, TypeRow>();
    for (const entity of entities.values()) {
      const key = layerKey(entity);
      let row = index.get(key);
      if (!row) {
        row = {
          key,
          label: layerLabel(entity),
          count: 0,
          icons: layerIcons(entity),
          sub: subcategoryId(entity),
          claimed: 0,
          unclaimed: 0,
          color: entity.category === "player" ? pioneerColor(entity.id) : undefined,
        };
        index.set(key, row);
        const list = byCat.get(entity.category) ?? [];
        list.push(row);
        byCat.set(entity.category, list);
      }
      row.count += 1;
      if (entity.category === "resource") {
        if (entity.claimed) row.claimed = (row.claimed ?? 0) + 1;
        else row.unclaimed = (row.unclaimed ?? 0) + 1;
      }
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    }
    return byCat;
  }, [entities]);

  const boostStats = useMemo(() => {
    let sloopBuildings = 0;
    let sloopItems = 0;
    let shardBuildings = 0;
    let shardItems = 0;
    const sloopIndex = new Map<string, BoostTypeRow>();
    const shardIndex = new Map<string, BoostTypeRow>();
    for (const entity of entities.values()) {
      const sloops = entity.somersloops ?? 0;
      const shards = entity.powerShards ?? 0;
      if (sloops > 0) {
        sloopBuildings += 1;
        sloopItems += sloops;
        addBoostTypeRow(sloopIndex, entity, sloops);
      }
      if (shards > 0) {
        shardBuildings += 1;
        shardItems += shards;
        addBoostTypeRow(shardIndex, entity, shards);
      }
    }
    return {
      sloopBuildings,
      sloopItems,
      shardBuildings,
      shardItems,
      sloopRows: sortBoostTypeRows([...sloopIndex.values()]),
      shardRows: sortBoostTypeRows([...shardIndex.values()]),
    };
  }, [entities]);

  const setCategory = (id: EntityCategory, on: boolean) => {
    onLayers({ ...layers, [id]: on });
  };

  const setTypes = (keys: string[], on: boolean, category: EntityCategory) => {
    const next = new Set(hidden);
    for (const key of keys) {
      if (on) next.delete(key);
      else next.add(key);
    }
    onHiddenTypes([...next]);
    if (on && layers[category] === false) onLayers({ ...layers, [category]: true });
  };

  const toggleType = (key: string, on: boolean, category: EntityCategory) => {
    setTypes([key], on, category);
  };

  const setSub = (catId: string, subId: string, on: boolean) => {
    const key = `${catId}:${subId}`;
    const next = new Set(hiddenSubSet);
    if (on) next.delete(key);
    else next.add(key);
    onHiddenSubs([...next]);
  };

  const allOn = () => {
    onLayers({ ...DEFAULT_LAYERS, ...Object.fromEntries(BUILDER_MENU.map((cat) => [cat.id, true])) } as LayerFlags);
    onHiddenTypes([]);
    onHiddenSubs([]);
    onShowBoosts(true);
  };

  const allOff = () => {
    onLayers(Object.fromEntries(BUILDER_MENU.map((cat) => [cat.id, false])) as LayerFlags);
    onHiddenTypes([]);
    onHiddenSubs([]);
    onShowBoosts(false);
  };

  const groupOn = (rows: TypeRow[], category: EntityCategory) => {
    const keys = rows.map((row) => row.key);
    setTypes(keys, true, category);
  };

  const groupOff = (rows: TypeRow[], category: EntityCategory) => {
    setTypes(
      rows.map((row) => row.key),
      false,
      category,
    );
  };

  const hideSubs = (catId: string, subIds: string[]) => {
    const next = new Set(hiddenSubSet);
    for (const id of subIds) next.add(`${catId}:${id}`);
    onHiddenSubs([...next]);
  };

  const toggleSubOpen = (catId: string, subId: string) => {
    const key = `${catId}:${subId}`;
    setOpenSubs((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyBoostPin = (next: BoostPin) => {
    onBoostPin(next);
    if (!boostPinIsActive(next)) return;
    if (!showBoosts) onShowBoosts(true);
    const nextLayers = { ...layers };
    const types = new Set(hidden);
    const subs = new Set(hiddenSubSet);
    const opened = new Set<EntityCategory>();
    const openedSubKeys = new Set<string>();
    let layersChanged = false;
    for (const entity of entities.values()) {
      if (!entityMatchesBoostPin(entity, next)) continue;
      if (nextLayers[entity.category] === false) {
        nextLayers[entity.category] = true;
        layersChanged = true;
      }
      const subKey = `${entity.category}:${subcategoryId(entity)}`;
      subs.delete(subKey);
      types.delete(layerKey(entity));
      if (entity.category === "resource") {
        const key = layerKey(entity);
        types.delete(`${key}:claimed`);
        types.delete(`${key}:unclaimed`);
      }
      opened.add(entity.category);
      openedSubKeys.add(subKey);
    }
    if (layersChanged) onLayers(nextLayers);
    if (subs.size !== hiddenSubSet.size) onHiddenSubs([...subs]);
    if (types.size !== hidden.size) onHiddenTypes([...types]);
    if (opened.size > 0) {
      setOpenCats((current) => {
        const merged = new Set(current);
        for (const id of opened) merged.add(id);
        return merged;
      });
    }
    if (openedSubKeys.size > 0) {
      setOpenSubs((current) => {
        const merged = new Set(current);
        for (const key of openedSubKeys) merged.add(key);
        return merged;
      });
    }
  };

  return (
    <ScrollArea className="h-full min-h-0 w-full min-w-0 flex-1 overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-4 pb-10">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <Layers className="size-3.5 shrink-0" />
            Layers
          </p>
          <span className="flex shrink-0 gap-1">
            <Button size="xs" variant="outline" onClick={allOn}>
              All on
            </Button>
            <Button size="xs" variant="outline" onClick={allOff}>
              All off
            </Button>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Categories match the in-game Builder. Section and subsection switches hide a group without changing the
          switches inside it. All on / All off still set every row.
        </p>
        <BoostsSection
          stats={boostStats}
          pin={boostPin}
          onPin={applyBoostPin}
          onHover={onHover}
          enabled={showBoosts}
          onEnabled={onShowBoosts}
        />
        {BUILDER_MENU.map((cat) => {
          const rows = grouped.get(cat.id) ?? [];
          const count = rows.reduce((sum, row) => sum + row.count, 0);
          const expanded = openCats.has(cat.id);
          const subs = cat.subs.filter((sub) => rows.some((row) => row.sub === sub.id) || cat.id === "resource");
          return (
            <div
              key={cat.id}
              className="min-w-0 overflow-x-hidden rounded-lg border border-border/70 bg-card/40"
              onMouseEnter={() => onHover(categoryHighlightKey(cat.id))}
              onMouseLeave={() => onHover(null)}
            >
              <div className="flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-muted/40">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    onClick={() => {
                      setOpenCats((current) => {
                        const next = new Set(current);
                        if (next.has(cat.id)) next.delete(cat.id);
                        else next.add(cat.id);
                        return next;
                      });
                    }}
                  >
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[cat.id] }} />
                    <span className="truncate">{cat.label}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{count}</span>
                  </button>
                  <Switch
                    size="sm"
                    className="shrink-0"
                    checked={layers[cat.id] !== false}
                    onCheckedChange={(on) => setCategory(cat.id, on)}
                  />
                </div>
                {rows.length > 1 ? (
                <div className="flex min-w-0 items-center justify-end gap-1">
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setCategory(cat.id, true);
                      groupOn(rows, cat.id);
                      onHiddenSubs(hiddenSubs.filter((key) => !key.startsWith(`${cat.id}:`)));
                    }}
                  >
                    All on
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      groupOff(rows, cat.id);
                      hideSubs(
                        cat.id,
                        (subs.length ? subs : cat.subs).map((sub) => sub.id),
                      );
                      setCategory(cat.id, false);
                    }}
                  >
                    All off
                  </Button>
                </div>
                ) : null}
              </div>
              {expanded ? (
                <div className="flex min-w-0 flex-col gap-2 border-t border-border/60 px-2 py-2">
                  {cat.id === "resource"
                    ? mergeResourceRows(rows).map((row) => (
                        <ResourceToggle
                          key={row.key}
                          row={row}
                          hidden={hidden}
                          onHidden={(next) => onHiddenTypes(next)}
                          onChecked={(on) => toggleType(row.key, on, cat.id)}
                          onHover={onHover}
                          hoverLeaveKey={categoryHighlightKey(cat.id)}
                        />
                      ))
                    : (() => {
                        const source = cat.id === "crates" ? mergeCrateRows(rows) : rows;
                        const visibleSubs = (subs.length ? subs : cat.subs).filter((sub) =>
                          source.some((row) => row.sub === sub.id),
                        );
                        const leftovers = leftoverRows(rows, cat.subs);
                        const flattenSubs = visibleSubs.length <= 1;
                        const renderType = (row: TypeRow, leaveKey: string) => (
                          <TypeToggle
                            key={row.key}
                            row={row}
                            checked={!hidden.has(row.key)}
                            onChecked={(on) => toggleType(row.key, on, cat.id)}
                            onHover={onHover}
                            hoverLeaveKey={leaveKey}
                          />
                        );
                        if (flattenSubs) {
                          const sub = visibleSubs[0];
                          const subRows = sub ? source.filter((row) => row.sub === sub.id) : [];
                          return (
                            <>
                              {subRows.map((row) => renderType(row, categoryHighlightKey(cat.id)))}
                              {leftovers.map((row) => renderType(row, categoryHighlightKey(cat.id)))}
                            </>
                          );
                        }
                        return (
                          <>
                            {visibleSubs.map((sub) => {
                              const subRows = source.filter((row) => row.sub === sub.id);
                              if (!subRows.length) return null;
                              const subKey = `${cat.id}:${sub.id}`;
                              const subOpen = openSubs.has(subKey);
                              const subCount = subRows.reduce((sum, row) => sum + row.count, 0);
                              return (
                                <div
                                  key={sub.id}
                                  className="min-w-0"
                                  onMouseEnter={() => onHover(subcategoryHighlightKey(cat.id, sub.id))}
                                  onMouseLeave={() => onHover(categoryHighlightKey(cat.id))}
                                >
                                  <div className="mb-1 flex min-w-0 items-center gap-2 rounded-md hover:bg-muted/40">
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                                      aria-expanded={subOpen}
                                      onClick={() => toggleSubOpen(cat.id, sub.id)}
                                    >
                                      <ChevronDown
                                        className={cn(
                                          "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                          subOpen ? "" : "-rotate-90",
                                        )}
                                      />
                                      <span className="min-w-0 flex-1 truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                        {sub.label}
                                      </span>
                                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                        {subCount}
                                      </span>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-1">
                                      {subRows.length > 1 ? (
                                        <>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            onClick={() => {
                                              setSub(cat.id, sub.id, true);
                                              groupOn(subRows, cat.id);
                                            }}
                                          >
                                            All on
                                          </Button>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px]"
                                            onClick={() => {
                                              setSub(cat.id, sub.id, false);
                                              groupOff(subRows, cat.id);
                                            }}
                                          >
                                            All off
                                          </Button>
                                        </>
                                      ) : null}
                                      <Switch
                                        size="sm"
                                        className="shrink-0"
                                        checked={!hiddenSubSet.has(`${cat.id}:${sub.id}`)}
                                        onCheckedChange={(on) => setSub(cat.id, sub.id, on)}
                                      />
                                    </div>
                                  </div>
                                  {subOpen ? (
                                    <div className="flex min-w-0 flex-col gap-1">
                                      {subRows.map((row) =>
                                        renderType(row, subcategoryHighlightKey(cat.id, sub.id)),
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                            {leftovers.map((row) => renderType(row, categoryHighlightKey(cat.id)))}
                          </>
                        );
                      })()}
                  {!rows.length && cat.id !== "resource" ? (
                    <p className="text-[11px] text-muted-foreground">None on this map.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function BoostsSection({
  stats,
  pin,
  onPin,
  onHover,
  enabled,
  onEnabled,
}: {
  stats: {
    sloopBuildings: number;
    sloopItems: number;
    shardBuildings: number;
    shardItems: number;
    sloopRows: BoostTypeRow[];
    shardRows: BoostTypeRow[];
  };
  pin: BoostPin;
  onPin: (pin: BoostPin) => void;
  onHover: (key: string | null) => void;
  enabled: boolean;
  onEnabled: (on: boolean) => void;
}) {
  const hover = (key: string | null) => {
    if (!enabled) return;
    onHover(key);
  };
  const pinRow = (next: BoostPin) => {
    if (!enabled) onEnabled(true);
    onPin(next);
  };
  return (
    <div className="min-w-0 overflow-x-hidden rounded-lg border border-border/70 bg-card/40" onMouseLeave={() => onHover(null)}>
      <div className="flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-muted/40">
        <div className="flex min-w-0 items-center gap-2">
          <p className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-3.5 shrink-0" />
            Boosts
          </p>
          <Switch
            size="sm"
            className="shrink-0"
            checked={enabled}
            onCheckedChange={(on) => {
              onEnabled(on);
              if (!on) onHover(null);
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Switch hides the dots. Pin a type or the whole group. Pinning turns on involved layers.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1 border-t border-border/60 px-2 py-2">
        <BoostKindGroup
          kind="somersloops"
          label="Somersloops"
          icons={["Somersloop.png"]}
          buildings={stats.sloopBuildings}
          items={stats.sloopItems}
          rows={stats.sloopRows}
          pin={pin.somersloops}
          onToggleAll={() => pinRow(toggleBoostKindAll(pin, "somersloops"))}
          onToggleType={(key) => pinRow(toggleBoostKindType(pin, "somersloops", key))}
          onHover={hover}
        />
        <BoostKindGroup
          kind="shards"
          label="Power shards"
          icons={["Power_Shard.png", "Crystal_Shard.png"]}
          buildings={stats.shardBuildings}
          items={stats.shardItems}
          rows={stats.shardRows}
          pin={pin.shards}
          onToggleAll={() => pinRow(toggleBoostKindAll(pin, "shards"))}
          onToggleType={(key) => pinRow(toggleBoostKindType(pin, "shards", key))}
          onHover={hover}
        />
      </div>
    </div>
  );
}

function BoostKindGroup({
  kind,
  label,
  icons,
  buildings,
  items,
  rows,
  pin,
  onToggleAll,
  onToggleType,
  onHover,
}: {
  kind: BoostKind;
  label: string;
  icons: string[];
  buildings: number;
  items: number;
  rows: BoostTypeRow[];
  pin: BoostKindPin;
  onToggleAll: () => void;
  onToggleType: (key: string) => void;
  onHover: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const parentKey = BOOST_HIGHLIGHT[kind];
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-expanded={open}
          aria-label={open ? `Hide ${label} types` : `Show ${label} types`}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", open ? "" : "-rotate-90")} />
        </button>
        <BoostRow
          label={label}
          icons={icons}
          buildings={buildings}
          items={items}
          itemLabel={label.toLowerCase()}
          active={pin.all}
          highlightKey={parentKey}
          hoverLeaveKey={null}
          onHover={onHover}
          onToggle={onToggleAll}
        />
      </div>
      {open ? (
        <div className="mt-1 flex min-w-0 flex-col gap-0.5 pl-7">
          {rows.length ? (
            rows.map((row) => (
              <BoostRow
                key={row.key}
                label={row.label}
                icons={row.icons}
                color={row.color}
                buildings={row.buildings}
                items={row.items}
                itemLabel={label.toLowerCase()}
                active={boostTypeIsPinned(pin, row.key)}
                highlightKey={boostTypeHighlightKey(kind, row.key)}
                hoverLeaveKey={parentKey}
                onHover={onHover}
                onToggle={() => onToggleType(row.key)}
              />
            ))
          ) : (
            <p className="px-1 py-0.5 text-[11px] text-muted-foreground">None on this map.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BoostRow({
  label,
  icons,
  color,
  buildings,
  items,
  itemLabel,
  active,
  highlightKey,
  hoverLeaveKey,
  onHover,
  onToggle,
}: {
  label: string;
  icons: string[];
  color?: string;
  buildings: number;
  items: number;
  itemLabel: string;
  active: boolean;
  highlightKey: string;
  hoverLeaveKey: string | null;
  onHover: (key: string | null) => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted/60",
        active ? "bg-primary/20" : "",
      )}
      title={`${buildings} ${label}, ${items} ${itemLabel}. Hover to highlight, click to pin.`}
      onMouseEnter={() => onHover(highlightKey)}
      onMouseLeave={() => onHover(hoverLeaveKey)}
      onClick={onToggle}
    >
      {color ? (
        <span className="size-5 shrink-0 rounded-sm border border-border/70" style={{ background: color }} />
      ) : (
        <WikiIcon candidates={icons} label={label} className="size-5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px]">{label}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {buildings} · {items}
      </span>
    </button>
  );
}

function mergeResourceRows(rows: TypeRow[]): TypeRow[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const listed = fallbackResourceRows().map((row) => byKey.get(row.key) ?? row);
  const unknown = byKey.get("res:unknown");
  if (unknown && unknown.count > 0) listed.push(unknown);
  return listed;
}

function mergeCrateRows(rows: TypeRow[]): TypeRow[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return [
    {
      key: "typ:Crate",
      label: "Dismantle Crate",
      count: 0,
      icons: iconCandidatesForBuilding("Crate"),
      sub: "dismantle",
    },
    {
      key: "typ:DeathCrate",
      label: "Death Crate",
      count: 0,
      icons: iconCandidatesForBuilding("DeathCrate"),
      sub: "death",
    },
  ].map((row) => byKey.get(row.key) ?? row);
}

function leftoverRows(rows: TypeRow[], subs: { id: string }[]): TypeRow[] {
  const known = new Set(subs.map((sub) => sub.id));
  return rows.filter((row) => !known.has(row.sub));
}

function fallbackResourceRows(): TypeRow[] {
  return Object.entries(RESOURCE_TYPE_LABELS)
    .filter(([id]) => id !== "unknown")
    .map(([id, label]) => ({
      key: `res:${id}`,
      label,
      count: 0,
      icons: iconCandidatesForResource(id),
      sub: "nodes",
    }));
}

function TypeToggle({
  row,
  checked,
  onChecked,
  onHover,
  hoverLeaveKey,
}: {
  row: TypeRow;
  checked: boolean;
  onChecked: (on: boolean) => void;
  onHover: (key: string | null) => void;
  hoverLeaveKey: string | null;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60"
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(hoverLeaveKey)}
    >
      {row.color ? (
        <span className="size-5 shrink-0 rounded-sm border border-border/70" style={{ background: row.color }} />
      ) : (
        <WikiIcon candidates={row.icons} label={row.label} className="size-5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px]">{row.label}</span>
      <span className={cn("shrink-0 font-mono text-[10px] text-muted-foreground")}>{row.count}</span>
      <Switch size="sm" className="shrink-0" checked={checked} onCheckedChange={onChecked} />
    </div>
  );
}

function ResourceToggle({
  row,
  hidden,
  onHidden,
  onChecked,
  onHover,
  hoverLeaveKey,
}: {
  row: TypeRow;
  hidden: Set<string>;
  onHidden: (hidden: string[]) => void;
  onChecked: (on: boolean) => void;
  onHover: (key: string | null) => void;
  hoverLeaveKey: string | null;
}) {
  const claimedKey = `${row.key}:claimed`;
  const unclaimedKey = `${row.key}:unclaimed`;
  const claimedOnly = hidden.has(unclaimedKey) && !hidden.has(claimedKey);
  const unclaimedOnly = hidden.has(claimedKey) && !hidden.has(unclaimedKey);
  const mode = claimedOnly ? "claimed" : unclaimedOnly ? "unclaimed" : "all";

  const setMode = (next: "all" | "claimed" | "unclaimed") => {
    const values = new Set(hidden);
    values.delete(claimedKey);
    values.delete(unclaimedKey);
    if (next === "claimed") values.add(unclaimedKey);
    if (next === "unclaimed") values.add(claimedKey);
    if (next !== "all") values.delete(row.key);
    onHidden([...values]);
  };

  return (
    <div
      className="flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 hover:bg-muted/60"
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(hoverLeaveKey)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <WikiIcon candidates={row.icons} label={row.label} className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[12px]">{row.label}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{row.count}</span>
        <Switch size="sm" className="shrink-0" checked={!hidden.has(row.key)} onCheckedChange={onChecked} />
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-7">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px]",
            mode === "claimed" ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onMouseEnter={() => onHover(claimedKey)}
          onMouseLeave={() => onHover(row.key)}
          onClick={() => setMode(mode === "claimed" ? "all" : "claimed")}
        >
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: CLAIMED_RING_COLOR }} />
          claimed {row.claimed ?? 0}
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-1 py-0.5 font-mono text-[10px]",
            mode === "unclaimed" ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onMouseEnter={() => onHover(unclaimedKey)}
          onMouseLeave={() => onHover(row.key)}
          onClick={() => setMode(mode === "unclaimed" ? "all" : "unclaimed")}
        >
          open {row.unclaimed ?? 0}
        </button>
      </div>
    </div>
  );
}
