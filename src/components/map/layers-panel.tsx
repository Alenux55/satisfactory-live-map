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

type LayerFlags = Record<EntityCategory, boolean>;

type TypeRow = {
  key: string;
  label: string;
  count: number;
  icons: string[];
  sub: string;
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
        };
        index.set(key, row);
        const list = byCat.get(entity.category) ?? [];
        list.push(row);
        byCat.set(entity.category, list);
      }
      row.count += 1;
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    }
    return byCat;
  }, [entities]);

  const setCategory = (id: EntityCategory, on: boolean) => {
    onLayers({ ...layers, [id]: on });
  };

  const toggleType = (key: string, on: boolean, category: EntityCategory) => {
    const next = new Set(hidden);
    if (on) next.delete(key);
    else next.add(key);
    onHiddenTypes([...next]);
    if (on && layers[category] === false) onLayers({ ...layers, [category]: true });
  };

  const allOn = () => {
    onLayers({ ...DEFAULT_LAYERS, ...Object.fromEntries(BUILDER_MENU.map((cat) => [cat.id, true])) } as LayerFlags);
    onHiddenTypes([]);
  };

  const allOff = () => {
    onLayers(Object.fromEntries(BUILDER_MENU.map((cat) => [cat.id, false])) as LayerFlags);
    onHiddenTypes([]);
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Layers className="size-3.5" />
            Layers
          </p>
          <span className="flex gap-1">
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
            <div key={cat.id} className="rounded-lg border border-border/70 bg-card/40">
              <div className="flex items-center gap-2 px-2 py-1.5">
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
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{count}</span>
                </button>
                <Switch checked={layers[cat.id] !== false} onCheckedChange={(on) => setCategory(cat.id, on)} />
              </div>
              {expanded ? (
                <div className="flex flex-col gap-2 border-t border-border/60 px-2 py-2">
                  {cat.id === "resource"
                    ? mergeResourceRows(rows).map((row) => (
                        <TypeToggle
                          key={row.key}
                          row={row}
                          checked={!hidden.has(row.key)}
                          onChecked={(on) => toggleType(row.key, on, cat.id)}
                          onHover={onHover}
                        />
                      ))
                    : (subs.length ? subs : cat.subs).map((sub) => {
                        const subRows = rows.filter((row) => row.sub === sub.id);
                        if (!subRows.length) return null;
                        return (
                          <div key={sub.id}>
                            <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              {sub.label}
                            </p>
                            <div className="flex flex-col gap-1">
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
      className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60"
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(null)}
    >
      <WikiIcon candidates={row.icons} label={row.label} className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[12px]">{row.label}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{row.count}</span>
      <Switch checked={checked} onCheckedChange={onChecked} />
    </div>
  );
}
