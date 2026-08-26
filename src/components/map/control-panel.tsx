"use client";

import { useMemo, useRef, useState } from "react";
import { FolderOpen, Layers, Radio, RefreshCw, Timer, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_COLORS, prettyType } from "@/lib/world/categorize";
import { formatBytes, formatDuration, formatInterval } from "@/lib/world/coords";
import {
  CATEGORY_LABELS,
  POLL_INTERVALS_SEC,
  type EntityCategory,
  type HubConfig,
  type HubStatus,
  type MapEntity,
} from "@/lib/world/types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as EntityCategory[];

type Props = {
  status: HubStatus | null;
  config: HubConfig | null;
  layers: Record<EntityCategory, boolean>;
  selected: MapEntity | null;
  onLayers: (layers: Record<EntityCategory, boolean>) => void;
  onConfig: (patch: Partial<HubConfig>) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onRefresh: () => Promise<void>;
};

export function ControlPanel({
  status,
  config,
  layers,
  selected,
  onLayers,
  onConfig,
  onUpload,
  onRefresh,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dirDraft, setDirDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const intervalIndex = useMemo(() => {
    const seconds = config?.pollIntervalSeconds ?? 15;
    const idx = POLL_INTERVALS_SEC.findIndex((value) => value === seconds);
    return idx >= 0 ? idx : 2;
  }, [config?.pollIntervalSeconds]);

  const live = status?.status === "ready" || status?.status === "waiting";

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-[11px] tracking-[0.22em] text-primary uppercase">
              FICSIT Cartography
            </p>
            <Badge variant={live ? "default" : "secondary"} className="gap-1 font-mono text-[10px]">
              <Radio className={live ? "size-3 animate-pulse" : "size-3"} />
              {status?.status ?? "boot"}
            </Badge>
          </div>
          <h1 className="mt-1 font-heading text-lg leading-tight text-balance">Live factory map</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Original viewer. Satisfactory Calculator is proprietary — this watches your save folder and
            streams only what changed.
          </p>
        </div>

        <div className="rounded-lg border border-border/80 bg-card/70 p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Session</p>
          <p className="mt-1 font-heading text-sm">{status?.header?.sessionName ?? "Grass Fields demo"}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <dt>Entities</dt>
            <dd className="text-foreground">{status?.entityCount ?? 0}</dd>
            <dt>Play time</dt>
            <dd className="text-foreground">
              {status?.header ? formatDuration(status.header.playDurationSeconds) : "—"}
            </dd>
            <dt>Last parse</dt>
            <dd className="text-foreground">
              {status?.lastDelta ? `${status.lastDelta.parsedMs} ms` : "—"}
            </dd>
            <dt>Delta</dt>
            <dd className="text-foreground">
              {status?.lastDelta
                ? `+${status.lastDelta.added} ~${status.lastDelta.updated} −${status.lastDelta.removed}`
                : "—"}
            </dd>
            <dt>Save</dt>
            <dd className="truncate text-foreground">
              {status?.source ? formatBytes(status.source.sizeBytes) : "demo"}
            </dd>
          </dl>
          {status?.skippedUnchanged ? (
            <p className="mt-2 text-[11px] text-primary">Save unchanged — hash skip, map kept.</p>
          ) : null}
          {status?.error ? <p className="mt-2 text-[11px] text-destructive">{status.error}</p> : null}
          {status?.status === "parsing" || status?.status === "hashing" ? (
            <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }}
              />
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">{status?.progressMessage}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="mode">Demo factory</Label>
            <Switch
              id="mode"
              checked={config?.mode !== "watch"}
              onCheckedChange={(checked) => onConfig({ mode: checked ? "demo" : "watch" })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Demo grows a Grass Fields starter on the same interval so you can see deltas without a save.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="inline-flex items-center gap-1.5">
              <Timer className="size-3.5" />
              Update period
            </Label>
            <span className="font-mono text-xs text-primary">
              {formatInterval(config?.pollIntervalSeconds ?? 15)}
            </span>
          </div>
          <Slider
            min={0}
            max={POLL_INTERVALS_SEC.length - 1}
            step={1}
            value={[intervalIndex]}
            onValueChange={(value) => {
              const seconds = POLL_INTERVALS_SEC[value[0] ?? 2];
              void onConfig({ pollIntervalSeconds: seconds });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Unreal saves are one compressed blob, so a changed ~20&nbsp;MB file is still parsed on the
            server. Unchanged files are hashed and skipped. The browser only receives added, moved, or
            removed actors.
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label className="inline-flex items-center gap-1.5">
            <FolderOpen className="size-3.5" />
            Save folder
          </Label>
          <Input
            value={dirDraft ?? config?.savesDir ?? ""}
            onChange={(event) => setDirDraft(event.target.value)}
            onBlur={() => {
              if (dirDraft != null && dirDraft !== config?.savesDir) {
                void onConfig({ savesDir: dirDraft, saveFile: null, mode: "watch" });
              }
            }}
            placeholder="/path/to/SaveGames"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Dedicated servers typically write under{" "}
            <span className="font-mono">FactoryGame/Saved/SaveGames</span>. Point this at a synced copy.
            Newest <span className="font-mono">.sav</span> wins unless you upload one.
          </p>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".sav"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  await onUpload(file);
                } finally {
                  setBusy(false);
                  event.target.value = "";
                }
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload />
              Upload .sav
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw />
              Scan now
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium">
            <Layers className="size-3.5" />
            Layers
          </p>
          <div className="flex flex-col gap-2">
            {CATEGORIES.map((category) => (
              <label key={category} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[category] }} />
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {status?.counts[category] ?? 0}
                  </span>
                  <Switch
                    checked={layers[category]}
                    onCheckedChange={(checked) => onLayers({ ...layers, [category]: checked })}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>

        {selected ? (
          <>
            <Separator />
            <div>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Selected
              </p>
              <p className="font-heading text-sm">{selected.label || prettyType(selected.type)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <dt>Type</dt>
                <dd className="text-foreground">{prettyType(selected.type)}</dd>
                <dt>Class</dt>
                <dd className="truncate text-foreground">{selected.category}</dd>
                <dt>X / Y</dt>
                <dd className="text-foreground">
                  {selected.x.toFixed(1)}, {selected.y.toFixed(1)}
                </dd>
                <dt>Z</dt>
                <dd className="text-foreground">{selected.z.toFixed(1)} m</dd>
                {selected.recipe ? (
                  <>
                    <dt>Recipe</dt>
                    <dd className="text-foreground">{selected.recipe}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          </>
        ) : null}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Satisfactory is © Coffee Stain Studios. This tool only reads saves you provide. Biome regions
          are a schematic grid from public wiki coordinates, not Satisfactory Calculator tiles.
        </p>
      </div>
    </ScrollArea>
  );
}
