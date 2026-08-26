"use client";

import { useMemo, useRef, useState } from "react";
import { FolderOpen, Globe2, Layers, Radio, RefreshCw, Timer, UnfoldVertical, Upload } from "lucide-react";
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
  zExtent: { min: number; max: number };
  zLower: number;
  zUpper: number;
  onZLower: (value: number) => void;
  onZUpper: (value: number) => void;
  onZReset: () => void;
  useTerrain: boolean;
  terrainReady: boolean;
  onTerrain: (on: boolean) => void;
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
  zExtent,
  zLower,
  zUpper,
  onZLower,
  onZUpper,
  onZReset,
  useTerrain,
  terrainReady,
  onTerrain,
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="terrain" className="inline-flex items-center gap-1.5">
              <Globe2 className="size-3.5" />
              Terrain map
            </Label>
            <Switch id="terrain" checked={useTerrain} onCheckedChange={onTerrain} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {terrainReady
              ? "Official wiki Map.jpg (Coffee Stain in-game map), cached as data/world-map.jpg. Not SCIM tiles."
              : "Downloading the 1.0 wiki map (~2 MB). Schematic grid stays until it arrives."}
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
            {status?.folderWatch
              ? "Folder watch picks up a new .sav within about a second. This slider is only a backup poll."
              : "Backup poll while folder watch is off."}{" "}
            The dedicated server still only writes on autosave (default 5 minutes). Closer to live means
            shortening that, not this slider: Server Manager console{" "}
            <span className="font-mono">FG.AutosaveInterval 60</span> (seconds). Below ~30s the DS hitches
            more often; each write still takes a few seconds to parse here.
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
            placeholder="%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Windows dedicated server:{" "}
            <span className="font-mono">%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server</span>.
            Newest complete <span className="font-mono">.sav</span> wins. The watcher copies the file
            first so a locked autosave does not stall Unreal.
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <UnfoldVertical className="size-3.5" />
              Height slice
            </p>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onZReset}>
              Full
            </Button>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>Lower</span>
            <span className="text-foreground">{zLower.toFixed(0)} m</span>
          </div>
          <Slider
            min={zExtent.min}
            max={zExtent.max}
            step={1}
            value={[zLower]}
            onValueChange={(value) => onZLower(value[0] ?? zLower)}
          />
          <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>Upper</span>
            <span className="text-foreground">{zUpper.toFixed(0)} m</span>
          </div>
          <Slider
            min={zExtent.min}
            max={zExtent.max}
            step={1}
            value={[zUpper]}
            onValueChange={(value) => onZUpper(value[0] ?? zUpper)}
          />
          <p className="text-[11px] text-muted-foreground">
            Hide buildings outside this Z range (sea level is 0). Same idea as SCIM&apos;s height bounds,
            implemented here on your save data.
          </p>
        </div>

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
          Satisfactory is © Coffee Stain Studios. This tool only reads saves you provide. Terrain is the
          official wiki Map.jpg (in-game map), cached locally — not Satisfactory Calculator tiles.
        </p>
      </div>
    </ScrollArea>
  );
}
