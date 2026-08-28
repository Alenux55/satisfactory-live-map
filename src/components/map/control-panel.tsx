"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, LogOut, Plus, Radio, RefreshCw, Server, Settings, Timer, Trash2, UnfoldVertical, Upload, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BoundedRangeSlider, Slider } from "@/components/ui/slider";
import { displayName, isConveyorMonitor, isPipeline } from "@/lib/world/categorize";
import { formatBytes, formatDuration, formatInterval } from "@/lib/world/coords";
import { RESOURCE_TYPE_LABELS } from "@/lib/world/resource";
import { iconCandidatesForBuilding } from "@/lib/world/icons";
import { layerIcons, layerLabel } from "@/lib/world/builder-menu";
import {
  CATEGORY_LABELS,
  DEMO_SERVER_ID,
  POLL_INTERVALS_SEC,
  type ConfigPatch,
  type HubConfig,
  type HubStatus,
  type MapEntity,
} from "@/lib/world/types";
import type { PublicUser } from "@/lib/auth/types";
import { BrandMark } from "@/components/brand-mark";
import { Section } from "@/components/map/section";
import { WikiIcon } from "@/components/map/wiki-icon";
import { FolderPicker, nameFromSaveDir } from "@/components/map/folder-picker";
import {
  clockFactor,
  extractorOutputPerMin,
  formatRate,
  lookupRecipe,
  perMinute,
} from "@/lib/world/recipes";

const STATUS_LABEL: Record<string, string> = {
  idle: "Starting",
  waiting: "Waiting",
  hashing: "Hashing",
  parsing: "Parsing",
  ready: "Ready",
  error: "Error",
};

function parseHeight(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function HeightMetersInput({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = () => {
    const next = Math.min(max, Math.max(min, parseHeight(draft, value)));
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-[10px] font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          inputMode="numeric"
          className="h-7 w-[5.75rem] font-mono text-[11px]"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span className="font-mono text-[11px] text-muted-foreground">m</span>
      </div>
    </div>
  );
}

type Props = {
  status: HubStatus | null;
  config: HubConfig | null;
  serverId: string;
  selected: MapEntity | null;
  zExtent: { min: number; max: number };
  zLower: number;
  zUpper: number;
  onZRange: (lower: number, upper: number) => void;
  onZReset: () => void;
  onServerId: (id: string) => void;
  onConfig: (patch: ConfigPatch) => Promise<{ alreadyExists?: boolean; reclaimed?: boolean } | void>;
  onUpload: (file: File) => Promise<void>;
  onRefresh: () => Promise<void>;
  account: PublicUser | null;
  canEditCatalog: boolean;
  onLogout: () => Promise<void>;
};

export function ControlPanel({
  status,
  config,
  serverId,
  selected,
  zExtent,
  zLower,
  zUpper,
  onZRange,
  onZReset,
  onServerId,
  onConfig,
  onUpload,
  onRefresh,
  account,
  canEditCatalog,
  onLogout,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dirDraft, setDirDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addDir, setAddDir] = useState("");
  const [addNote, setAddNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const servers = config?.servers ?? [];
  const current = servers.find((server) => server.id === serverId) ?? servers[0];
  const isDemo = (current?.id ?? serverId) === DEMO_SERVER_ID;

  useEffect(() => {
    setDirDraft(null);
    setNameDraft(null);
  }, [serverId]);

  const intervalIndex = useMemo(() => {
    const seconds = config?.pollIntervalSeconds ?? 15;
    const idx = POLL_INTERVALS_SEC.findIndex((value) => value === seconds);
    return idx >= 0 ? idx : 2;
  }, [config?.pollIntervalSeconds]);

  const live = status?.status === "ready" || status?.status === "waiting";

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="flex flex-col gap-5 px-5 py-4 pb-10">
        <div>
          <div className="flex items-center justify-between gap-2">
            <BrandMark />
            <Badge variant={live ? "default" : "secondary"} className="gap-1 font-mono text-[10px]">
              <Radio className={live ? "size-3 animate-pulse" : "size-3"} />
              {status
                ? STATUS_LABEL[status.status] ?? status.status
                : "Starting"}
            </Badge>
          </div>
          <h1 className="mt-1 font-heading text-lg leading-tight text-balance">Live factory map</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Original viewer. Satisfactory Calculator is proprietary — this watches your save folder and
            streams only what changed.
          </p>
          {account ? (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-border/70 bg-card/50 px-2 py-1.5">
              <p className="truncate text-[11px]">
                <span className="text-foreground">{account.username}</span>{" "}
                <span className="font-mono text-muted-foreground">{account.role}</span>
              </p>
              <span className="flex flex-wrap gap-1">
                {account.role === "admin" ? (
                  <>
                    <Button size="xs" variant="ghost" onClick={() => router.push("/admin/settings")}>
                      <Settings />
                      Settings
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => router.push("/admin/users")}>
                      <Users />
                      Accounts
                    </Button>
                  </>
                ) : null}
                <Button size="xs" variant="ghost" onClick={() => void onLogout()}>
                  <LogOut />
                  Sign out
                </Button>
              </span>
            </div>
          ) : null}
        </div>

        <Section title="Session">
        <div className="rounded-lg border border-border/80 bg-card/70 p-3">
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
        </Section>

        <Section title="Server" icon={<Server className="size-3.5" />}>
        <div className="flex flex-col gap-3">
          <select
            id="server"
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={current?.id ?? serverId}
            onChange={(event) => onServerId(event.target.value)}
          >
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
                {server.kind === "demo" ? " (demo)" : ""}
              </option>
            ))}
          </select>
          <Input
            value={nameDraft ?? current?.name ?? ""}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => {
              if (!canEditCatalog) return;
              if (nameDraft != null && current && nameDraft.trim() && nameDraft !== current.name) {
                void onConfig({ updateServer: { id: current.id, name: nameDraft.trim() } });
              }
            }}
            placeholder="Display name"
            readOnly={!canEditCatalog}
          />
          {isDemo ? (
            <p className="text-[11px] text-muted-foreground">
              Built-in Grass Fields factory that grows on the update interval so you can try the map
              without a dedicated server. Pick another server to watch a real save folder.
            </p>
          ) : (
            <>
              <Label className="inline-flex items-center gap-1.5">
                <FolderOpen className="size-3.5" />
                Save folder
              </Label>
              <div className="flex gap-2">
                <Input
                  value={dirDraft ?? current?.savesDir ?? ""}
                  onChange={(event) => setDirDraft(event.target.value)}
                  onBlur={() => {
                    if (!canEditCatalog) return;
                    if (dirDraft != null && current && dirDraft !== current.savesDir) {
                      void onConfig({
                        updateServer: { id: current.id, savesDir: dirDraft, saveFile: null },
                      });
                    }
                  }}
                  placeholder="%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server"
                  className="min-w-0 flex-1 font-mono text-xs"
                  readOnly={!canEditCatalog}
                />
                {canEditCatalog ? (
                  <FolderPicker
                    onPick={(dir) => {
                      if (!current) return;
                      setDirDraft(dir);
                      void onConfig({ updateServer: { id: current.id, savesDir: dir, saveFile: null } });
                    }}
                  />
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Windows dedicated server:{" "}
                <span className="font-mono">%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server</span>.
                Newest complete <span className="font-mono">.sav</span> wins. Each server in this list
                is watched on its own, so two browsers can look at two worlds at once.
              </p>
            </>
          )}
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
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy || !canEditCatalog}>
              <Upload />
              Upload .sav
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || isDemo}
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
            {canEditCatalog ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={busy || isDemo}
                onClick={() => {
                  if (!current || isDemo) return;
                  void onConfig({ removeServerId: current.id });
                }}
              >
                <Trash2 />
                Remove
              </Button>
            ) : null}
          </div>
          {isDemo && canEditCatalog ? (
            <p className="text-[11px] text-muted-foreground">
              Upload while Demo is selected creates a new server from that snapshot.
            </p>
          ) : null}
        </div>

        {canEditCatalog ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card/50 p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Add server</p>
          <Input
            value={addName}
            onChange={(event) => setAddName(event.target.value)}
            placeholder="Name (e.g. Cluster A)"
          />
          <div className="flex gap-2">
            <Input
              value={addDir}
              onChange={(event) => setAddDir(event.target.value)}
              placeholder="%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\server"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <FolderPicker
              onPick={(dir) => {
                setAddDir(dir);
                setAddName((current) => current.trim() || nameFromSaveDir(dir));
              }}
            />
          </div>
          <Button
            size="sm"
            disabled={busy || !addDir.trim()}
            onClick={async () => {
              setBusy(true);
              setAddNote(null);
              try {
                const result = await onConfig({
                  addServer: {
                    name: addName.trim() || "Dedicated server",
                    savesDir: addDir.trim(),
                  },
                });
                setAddName("");
                setAddDir("");
                if (result?.alreadyExists) {
                  setAddNote("Already in the list — switched to that server.");
                } else if (result?.reclaimed) {
                  setAddNote("Found existing history for this world — reusing it instead of creating a new folder.");
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus />
            Add save location
          </Button>
          {addNote ? <p className="text-[11px] text-primary">{addNote}</p> : null}
        </div>
        ) : null}
        </Section>

        <Section
          title="Update period"
          icon={<Timer className="size-3.5" />}
          actions={
            <span className="font-mono text-xs text-primary">
              {formatInterval(config?.pollIntervalSeconds ?? 15)}
            </span>
          }
        >
        <div className="flex flex-col gap-2">
          <Slider
            min={0}
            max={POLL_INTERVALS_SEC.length - 1}
            step={1}
            value={[intervalIndex]}
            disabled={!canEditCatalog}
            onValueChange={(value) => {
              if (!canEditCatalog) return;
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
        </Section>

        <Section
          title="Height slice"
          icon={<UnfoldVertical className="size-3.5" />}
          actions={
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onZReset}>
              Full
            </Button>
          }
        >
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <HeightMetersInput
              id="slice-lower"
              label="Lower"
              value={zLower}
              min={zExtent.min}
              max={Math.max(zExtent.min, zUpper - 1)}
              onCommit={(lo) => onZRange(lo, zUpper)}
            />
            <HeightMetersInput
              id="slice-upper"
              label="Upper"
              value={zUpper}
              min={Math.min(zExtent.max, zLower + 1)}
              max={zExtent.max}
              onCommit={(hi) => onZRange(zLower, hi)}
            />
          </div>
          <BoundedRangeSlider
            min={zExtent.min}
            max={zExtent.max}
            step={1}
            lower={Math.min(zLower, zUpper)}
            upper={Math.max(zLower, zUpper)}
            onValueChange={onZRange}
          />
          <p className="text-[11px] text-muted-foreground">
            Hide buildings outside this Z range (sea level is 0). Type a height or drag the handles; they
            cannot cross. Same idea as SCIM&apos;s height bounds, implemented here on your save data.
          </p>
        </div>
        </Section>

        {selected ? (
          <Section title="Selected" defaultOpen>
            <div className="flex gap-3">
              <WikiIcon
                candidates={layerIcons(selected)}
                label={layerLabel(selected)}
                className="size-14 rounded-md border border-border bg-card p-1"
              />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm">{selected.label || displayName(selected.type)}</p>
                <p className="text-[11px] text-muted-foreground">{CATEGORY_LABELS[selected.category]}</p>
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <dt>Type</dt>
              <dd className="text-foreground">{displayName(selected.type)}</dd>
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
              {selected.clock != null ? (
                <>
                  <dt>Clock speed</dt>
                  <dd className="text-foreground">{selected.clock}%</dd>
                </>
              ) : null}
              {selected.powerShards != null ? (
                <>
                  <dt>Power shards</dt>
                  <dd className="text-foreground">{selected.powerShards}</dd>
                </>
              ) : null}
              {selected.somersloops != null ? (
                <>
                  <dt>Somersloops</dt>
                  <dd className="text-foreground">{selected.somersloops}</dd>
                </>
              ) : null}
              {selected.production != null ? (
                <>
                  <dt>Production rate</dt>
                  <dd className="text-foreground">{selected.production}%</dd>
                </>
              ) : null}
              {selected.throughput != null ? (
                <>
                  <dt>Throughput</dt>
                  <dd className="text-foreground">
                    {selected.throughputEstimated ? "est. " : ""}
                    {Math.round(selected.throughput)} /min
                    {selected.throughputEstimated && isConveyorMonitor(selected.type) ? (
                      <span className="text-muted-foreground"> from belt</span>
                    ) : null}
                  </dd>
                </>
              ) : isConveyorMonitor(selected.type) ? (
                <>
                  <dt>Throughput</dt>
                  <dd className="text-muted-foreground">game does not save this rate</dd>
                </>
              ) : null}
              {selected.capacity != null ? (
                <>
                  <dt>{isPipeline(selected.type) ? "Pipe max" : "Belt max"}</dt>
                  <dd className="text-foreground">
                    {selected.capacity} {isPipeline(selected.type) ? "m³/min" : "/min"}
                  </dd>
                </>
              ) : null}
              {selected.cargo?.length ? (
                <>
                  <dt>{isPipeline(selected.type) ? "Fluid" : "Cargo"}</dt>
                  <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
                    {selected.cargo.map((name) => (
                      <span key={name} className="inline-flex min-w-0 items-center gap-1">
                        <WikiIcon
                          candidates={iconCandidatesForBuilding(name)}
                          label={name}
                          className="size-4 shrink-0"
                        />
                        <span className="truncate">{name}</span>
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
              {selected.throughputConfidence != null ? (
                <>
                  <dt>Confidence</dt>
                  <dd className="text-foreground">{selected.throughputConfidence}%</dd>
                </>
              ) : null}
              {selected.resource ? (
                <>
                  <dt>Resource</dt>
                  <dd className="text-foreground">
                    {RESOURCE_TYPE_LABELS[selected.resource] ?? selected.resource}
                  </dd>
                </>
              ) : null}
              {selected.purity ? (
                <>
                  <dt>Purity</dt>
                  <dd className="capitalize text-foreground">{selected.purity}</dd>
                </>
              ) : null}
              {selected.category === "resource" ? (
                <>
                  <dt>Claimed</dt>
                  <dd className="text-foreground">{selected.claimed ? "yes" : "no"}</dd>
                </>
              ) : null}
            </dl>
            <RecipeRates entity={selected} />
          </Section>
        ) : null}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Satisfactory is © Coffee Stain Studios. This tool only reads saves you provide. Terrain is the
          official wiki Map.jpg (in-game map), cached locally — not Satisfactory Calculator tiles. Building
          icons are the same wiki files.
        </p>
      </div>
    </ScrollArea>
  );
}

function RecipeRates({ entity }: { entity: MapEntity }) {
  const recipe = lookupRecipe(entity.recipe);
  const extract = extractorOutputPerMin(entity.type, entity.purity);
  const factor = clockFactor(entity.clock, entity.somersloops);
  if (!recipe && extract == null) return null;
  const rows =
    recipe != null
      ? [
          ...recipe.in.map((item) => ({
            side: "In",
            name: item.name,
            base: perMinute(item.amount, recipe.time),
          })),
          ...recipe.out.map((item) => ({
            side: "Out",
            name: item.name,
            base: perMinute(item.amount, recipe.time),
          })),
        ]
      : [
          {
            side: "Out",
            name: entity.resource ? (RESOURCE_TYPE_LABELS[entity.resource] ?? entity.resource) : "Resource",
            base: extract ?? 0,
          },
        ];
  return (
    <div className="mt-2 rounded-md border border-border/60 px-2 py-1.5">
      <p className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        Material rates <span className="normal-case">/min at 100% → current</span>
      </p>
      <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
        {rows.map((row) => (
          <li key={`${row.side}:${row.name}`} className="flex min-w-0 items-baseline gap-2">
            <span className="w-7 shrink-0 text-muted-foreground">{row.side}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{row.name}</span>
            <span className="shrink-0 text-muted-foreground">{formatRate(row.base)}</span>
            <span className="shrink-0 text-foreground">→ {formatRate(row.base * factor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
