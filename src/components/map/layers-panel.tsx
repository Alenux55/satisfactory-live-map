"use client";

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { WikiIcon } from "@/components/map/wiki-icon";
import {
  BUILDER_MENU,
  layerIcons,
  layerKey,
  layerLabel,
  subcategoryId,
} from "@/lib/world/builder-menu";
import { CATEGORY_COLORS } from "@/lib/world/categorize";
import { RESOURCE_TYPE_LABELS } from "@/lib/world/resource";
import { DEFAULT_LAYERS, type EntityCategory, type MapEntity } from "@/lib/world/types";
import { iconCandidatesForResource } from "@/lib/world/icons";
import { pioneerColor } from "@/lib/world/pioneer-color";
import { cn } from "@/lib/utils";

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
  onLayers,
  onHiddenTypes,
  onHover,
}: {
  entities: Map<string, MapEntity>;
  layers: LayerFlags;
  hiddenTypes: string[];
  onLayers: (layers: LayerFlags) => void;
  onHiddenTypes: (hidden: string[]) => void;
  onHover: (key: string | null) => void;
}) {
  const hidden = useMemo(() => new Set(hiddenTypes), [hiddenTypes]);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

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

  const allOn = () => {
    onLayers({ ...DEFAULT_LAYERS, ...Object.fromEntries(BUILDER_MENU.map((cat) => [cat.id, true])) } as LayerFlags);
    onHiddenTypes([]);
  };

  const allOff = () => {
    onLayers(Object.fromEntries(BUILDER_MENU.map((cat) => [cat.id, false])) as LayerFlags);
    onHiddenTypes([]);
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

  const groupChecked = (rows: TypeRow[]) => rows.length > 0 && rows.every((row) => !hidden.has(row.key));

  return (
    <ScrollArea className="h-full min-h-0 w-full min-w-0 flex-1 overflow-x-hidden">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-4 pb-10">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <Layers className="size-3.5 shrink-0" />
            Layers
          </p>
          <span className="flex shrink-0 gap-1">
            <Button size="xs" variant="ghost" onClick={allOn}>
              All on
            </Button>
            <Button size="xs" variant="ghost" onClick={allOff}>
              All off
            </Button>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Categories match the in-game Builder. Expand one to toggle types; hover a row to highlight it on the map.
        </p>
        {BUILDER_MENU.map((cat) => {
          const rows = grouped.get(cat.id) ?? [];
          const count = rows.reduce((sum, row) => sum + row.count, 0);
          const expanded = openCats.has(cat.id);
          const subs = cat.subs.filter((sub) => rows.some((row) => row.sub === sub.id) || cat.id === "resource");
          return (
            <div key={cat.id} className="min-w-0 overflow-x-hidden rounded-lg border border-border/70 bg-card/40">
              <div className="flex min-w-0 flex-col gap-1 px-2 py-1.5">
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
                <div className="flex min-w-0 items-center justify-end gap-0.5">
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => {
                      setCategory(cat.id, true);
                      groupOn(rows, cat.id);
                    }}
                  >
                    All on
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => groupOff(rows, cat.id)}
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
                        />
                      ))
                    : (subs.length ? subs : cat.subs).map((sub) => {
                        const subRows = rows.filter((row) => row.sub === sub.id);
                        if (!subRows.length) return null;
                        return (
                          <div key={sub.id} className="min-w-0">
                              <div className="mb-1 min-w-0">
                              <p className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                {sub.label}
                              </p>
                              {subRows.length > 1 ? (
                              <div className="flex min-w-0 justify-end">
                                <GroupActions
                                  checked={groupChecked(subRows)}
                                  onChecked={(on) => (on ? groupOn(subRows, cat.id) : groupOff(subRows, cat.id))}
                                  onAllOn={() => groupOn(subRows, cat.id)}
                                  onAllOff={() => groupOff(subRows, cat.id)}
                                />
                              </div>
                              ) : null}
                            </div>
                            <div className="flex min-w-0 flex-col gap-1">
                              {subRows.map((row) => (
                                <TypeToggle
                                  key={row.key}
                                  row={row}
                                  checked={!hidden.has(row.key)}
                                  onChecked={(on) => toggleType(row.key, on, cat.id)}
                                  onHover={onHover}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  {cat.id !== "resource"
                    ? leftoverRows(rows, cat.subs).map((row) => (
                        <TypeToggle
                          key={row.key}
                          row={row}
                          checked={!hidden.has(row.key)}
                          onChecked={(on) => toggleType(row.key, on, cat.id)}
                          onHover={onHover}
                        />
                      ))
                    : null}
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

function GroupActions({
  checked,
  onChecked,
  onAllOn,
  onAllOff,
}: {
  checked: boolean;
  onChecked: (on: boolean) => void;
  onAllOn: () => void;
  onAllOff: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button size="xs" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={onAllOn}>
        All on
      </Button>
      <Button size="xs" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={onAllOff}>
        All off
      </Button>
      <Switch size="sm" className="shrink-0" checked={checked} onCheckedChange={onChecked} />
    </div>
  );
}

function mergeResourceRows(rows: TypeRow[]): TypeRow[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const listed = fallbackResourceRows().map((row) => byKey.get(row.key) ?? row);
  const unknown = byKey.get("res:unknown");
  if (unknown && unknown.count > 0) listed.push(unknown);
  return listed;
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
}: {
  row: TypeRow;
  checked: boolean;
  onChecked: (on: boolean) => void;
  onHover: (key: string | null) => void;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60"
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(null)}
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
}: {
  row: TypeRow;
  hidden: Set<string>;
  onHidden: (hidden: string[]) => void;
  onChecked: (on: boolean) => void;
  onHover: (key: string | null) => void;
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
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 hover:bg-muted/60">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="flex min-w-0 flex-1 items-center gap-2"
          onMouseEnter={() => onHover(row.key)}
          onMouseLeave={() => onHover(null)}
        >
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
            "rounded px-1 py-0.5 font-mono text-[10px]",
            mode === "claimed" ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onMouseEnter={() => onHover(claimedKey)}
          onMouseLeave={() => onHover(null)}
          onClick={() => setMode(mode === "claimed" ? "all" : "claimed")}
        >
          claimed {row.claimed ?? 0}
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-1 py-0.5 font-mono text-[10px]",
            mode === "unclaimed" ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onMouseEnter={() => onHover(unclaimedKey)}
          onMouseLeave={() => onHover(null)}
          onClick={() => setMode(mode === "unclaimed" ? "all" : "unclaimed")}
        >
          open {row.unclaimed ?? 0}
        </button>
      </div>
    </div>
  );
}
