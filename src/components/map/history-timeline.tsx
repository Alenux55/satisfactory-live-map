"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, SkipForward } from "lucide-react";
import { applyDelta } from "@/lib/world/diff";
import type { HistoryEvent, HistoryMark, HistoryMeta, MapEntity } from "@/lib/world/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_SPAN = 15 * 60 * 1000;
const MAX_SPAN = 14 * 24 * 60 * 60 * 1000;
const MIN_TRACK_H = 48;
const MAX_TRACK_H = 240;
const DEFAULT_TRACK_H = 88;
const SPEEDS = [
  { id: "event", label: "Change", event: true, msPerSec: 0 },
  { id: "5m", label: "5m/s", event: false, msPerSec: 5 * 60 * 1000 },
  { id: "30m", label: "30m/s", event: false, msPerSec: 30 * 60 * 1000 },
  { id: "1h", label: "1h/s", event: false, msPerSec: 60 * 60 * 1000 },
  { id: "6h", label: "6h/s", event: false, msPerSec: 6 * 60 * 60 * 1000 },
] as const;

type Props = {
  serverId: string;
  live: boolean;
  liveRev: number;
  onLiveChange: (live: boolean) => void;
  onSeek: (entities: Map<string, MapEntity>, at: number) => void;
  onHeight?: (height: number) => void;
};

export function HistoryTimeline({ serverId, live, liveRev, onLiveChange, onSeek, onHeight }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; startHead: number; moved: boolean } | null>(null);
  const playRef = useRef({ playing: false, speed: 0, event: false, head: 0 });
  const headRef = useRef(Date.now());
  const [meta, setMeta] = useState<HistoryMeta | null>(null);
  const [marks, setMarks] = useState<HistoryMark[]>([]);
  const [span, setSpan] = useState(24 * 60 * 60 * 1000);
  const [head, setHead] = useState(Date.now());
  const [trackH, setTrackH] = useState(DEFAULT_TRACK_H);
  const [playing, setPlaying] = useState(false);
  const [speedId, setSpeedId] = useState<(typeof SPEEDS)[number]["id"]>("30m");
  const [busy, setBusy] = useState(false);

  const viewStart = head - span / 2;
  const viewEnd = head + span / 2;
  const speed = SPEEDS.find((item) => item.id === speedId) ?? SPEEDS[2];
  headRef.current = head;

  const loadMeta = useCallback(async () => {
    const response = await fetch(`/api/history?server=${encodeURIComponent(serverId)}&view=meta`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as HistoryMeta;
    setMeta(body);
    if (body.lastT && live) setHead(body.lastT);
  }, [live, liveRev, serverId]);

  const loadMarks = useCallback(async () => {
    const from = viewEnd - span;
    const response = await fetch(
      `/api/history?server=${encodeURIComponent(serverId)}&view=marks&from=${from}&to=${viewEnd}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as { marks: HistoryMark[] };
    setMarks(body.marks);
  }, [liveRev, serverId, span, viewEnd]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadMarks();
    }, 120);
    return () => window.clearTimeout(id);
  }, [loadMarks]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeight) return;
    const report = () => onHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight, trackH]);

  const seekTo = useCallback(
    async (at: number, stayLive = false) => {
      if (!meta?.firstT || !meta.lastT) return;
      const t = Math.min(Math.max(at, meta.firstT), meta.lastT);
      setHead(t);
      const isLive = stayLive || t >= meta.lastT;
      if (isLive) {
        onLiveChange(true);
        return;
      }
      onLiveChange(false);
      setBusy(true);
      try {
        const response = await fetch(
          `/api/history?server=${encodeURIComponent(serverId)}&view=at&t=${t}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const body = (await response.json()) as { t: number | null; entities: MapEntity[] };
        if (body.t == null) return;
        onSeek(new Map(body.entities.map((entity) => [entity.id, entity])), body.t);
      } finally {
        setBusy(false);
      }
    },
    [meta, onLiveChange, onSeek, serverId],
  );

  const playStartRef = useRef(head);

  useEffect(() => {
    playRef.current = { playing, speed: speed.msPerSec, event: speed.event, head };
  }, [head, playing, speed.event, speed.msPerSec]);

  useEffect(() => {
    if (!playing || !meta?.lastT || !meta.firstT) return;
    let cancelled = false;
    let raf = 0;
    let lastPerf = performance.now();
    let waitUntil = 0;
    let world = new Map<string, MapEntity>();
    let events: HistoryEvent[] = [];
    let cursor = playStartRef.current;
    let ready = false;

    void (async () => {
      const startAt = playStartRef.current;
      const snapRes = await fetch(
        `/api/history?server=${encodeURIComponent(serverId)}&view=at&t=${startAt}`,
        { cache: "no-store" },
      );
      if (!snapRes.ok || cancelled) return;
      const snap = (await snapRes.json()) as { t: number | null; entities: MapEntity[] };
      if (snap.t == null || cancelled) return;
      world = new Map(snap.entities.map((entity) => [entity.id, entity]));
      onSeek(world, snap.t);
      const evRes = await fetch(
        `/api/history?server=${encodeURIComponent(serverId)}&view=events&from=${startAt}&to=${meta.lastT}`,
        { cache: "no-store" },
      );
      if (!evRes.ok || cancelled) return;
      events = ((await evRes.json()) as { events: HistoryEvent[] }).events;
      cursor = snap.t;
      ready = true;
    })();

    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - lastPerf) / 1000);
      lastPerf = now;
      const state = playRef.current;
      if (!state.playing) return;
      if (!ready || now < waitUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (state.event) {
        const next = events.find((event) => event.t > cursor + 20);
        if (!next) {
          setPlaying(false);
          onLiveChange(true);
          return;
        }
        world = applyDelta(world, next);
        cursor = next.t;
        setHead(next.t);
        onSeek(new Map(world), next.t);
        waitUntil = now + 220;
      } else {
        const nextHead = Math.min(meta.lastT!, cursor + dt * state.speed);
        let changed = false;
        for (const event of events) {
          if (event.t > cursor && event.t <= nextHead) {
            world = applyDelta(world, event);
            changed = true;
          }
        }
        cursor = nextHead;
        setHead(nextHead);
        if (changed) onSeek(new Map(world), nextHead);
        if (nextHead >= meta.lastT!) {
          setPlaying(false);
          onLiveChange(true);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [meta, onLiveChange, onSeek, playing, serverId]);

  const timeForX = useCallback(
    (x: number, width: number) => viewStart + (x / Math.max(1, width)) * span,
    [span, viewStart],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(12, 18, 28, 0.92)";
    ctx.fillRect(0, 0, width, height);
    const step = niceStep(span);
    ctx.strokeStyle = "rgba(244, 195, 125, 0.18)";
    ctx.fillStyle = "rgba(244, 195, 125, 0.55)";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let t = Math.ceil(viewStart / step) * step; t < viewEnd; t += step) {
      const x = ((t - viewStart) / span) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(formatTick(t, span), x + 4, 12);
    }
    const maxN = Math.max(1, ...marks.map((mark) => mark.added + mark.updated + mark.removed));
    for (const mark of marks) {
      const x = ((mark.t - viewStart) / span) * width;
      if (x < -2 || x > width + 2) continue;
      const n = mark.added + mark.updated + mark.removed;
      const h = Math.max(4, (Math.log2(n + 1) / Math.log2(maxN + 1)) * (height - 18));
      ctx.fillStyle = "rgba(244, 195, 125, 0.85)";
      ctx.fillRect(x - 1.5, height - h - 2, 3, h);
    }
    const hx = width / 2;
    ctx.fillStyle = "#fb7185";
    ctx.fillRect(hx - 1, 0, 2, height);
  }, [head, marks, span, trackH, viewEnd, viewStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheelNative = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const nextSpan = clamp(span * (event.deltaY > 0 ? 1.2 : 0.8), MIN_SPAN, MAX_SPAN);
      setSpan(nextSpan);
    };
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheelNative);
  }, [span]);

  const clampHead = useCallback(
    (at: number) => {
      if (!meta?.firstT || !meta.lastT) return at;
      return Math.min(Math.max(at, meta.firstT), meta.lastT);
    },
    [meta],
  );

  const dateValue = useMemo(() => new Date(head).toISOString().slice(0, 10), [head]);
  const empty = !meta?.firstT;

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto w-full rounded-t-lg border border-border/70 bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur"
    >
      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
        <Button
          size="xs"
          variant={live ? "default" : "outline"}
          onClick={() => {
            setPlaying(false);
            if (meta?.lastT) void seekTo(meta.lastT, true);
            else onLiveChange(true);
          }}
        >
          Live
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground">
          {busy ? "Loading…" : formatClock(head)}
        </span>
        <label className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="size-3.5" />
          <input
            type="date"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            value={dateValue}
            onChange={(event) => {
              const next = Date.parse(`${event.target.value}T12:00:00`);
              if (!Number.isFinite(next)) return;
              setSpan(24 * 60 * 60 * 1000);
              void seekTo(next);
            }}
          />
        </label>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            void seekTo(clampHead(head - span * 0.6));
          }}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            void seekTo(clampHead(head + span * 0.6));
          }}
        >
          <ChevronRight />
        </Button>
        <Button
          size="icon-xs"
          variant={playing ? "default" : "secondary"}
          disabled={empty}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            playStartRef.current = live && meta?.firstT ? meta.firstT : head;
            if (live && meta?.firstT) {
              setHead(meta.firstT);
              onLiveChange(false);
            }
            setPlaying(true);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <select
          className="h-6 rounded-md border border-border bg-background px-1 font-mono text-[11px] text-foreground"
          value={speedId}
          onChange={(event) => setSpeedId(event.target.value as (typeof SPEEDS)[number]["id"])}
        >
          {SPEEDS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <Button
          size="xs"
          variant="ghost"
          disabled={!meta?.lastT}
          onClick={() => {
            setPlaying(false);
            if (meta?.lastT) void seekTo(meta.lastT, true);
          }}
        >
          <SkipForward className="size-3" />
          Now
        </Button>
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        tabIndex={0}
        className="mb-1 flex h-2 cursor-ns-resize touch-none items-center justify-center"
        onPointerDown={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          let lastY = event.clientY;
          target.setPointerCapture(event.pointerId);
          const move = (next: PointerEvent) => {
            const delta = next.clientY - lastY;
            lastY = next.clientY;
            setTrackH((height) => clamp(height - delta, MIN_TRACK_H, MAX_TRACK_H));
          };
          const up = () => {
            target.releasePointerCapture(event.pointerId);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <span className="h-0.5 w-10 rounded-full bg-border" />
      </div>
      <canvas
        ref={canvasRef}
        style={{ height: trackH }}
        className={cn("w-full cursor-ew-resize rounded-md border border-border/60", empty && "opacity-50")}
        onPointerDown={(event) => {
          setPlaying(false);
          dragRef.current = { x: event.clientX, startHead: head, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (Math.abs(event.clientX - dragRef.current.x) >= 4) {
            dragRef.current.moved = true;
            const dt = -((event.clientX - dragRef.current.x) / Math.max(1, rect.width)) * span;
            setHead(clampHead(dragRef.current.startHead + dt));
          }
        }}
        onPointerUp={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (dragRef.current && !dragRef.current.moved) {
            void seekTo(timeForX(event.clientX - rect.left, rect.width));
          } else if (dragRef.current?.moved) {
            void seekTo(headRef.current);
          }
          dragRef.current = null;
        }}
      />
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {empty
          ? "History starts on the next save change for this server. Demo worlds are not recorded."
          : `Scroll to zoom · drag to pan (playhead stays centered) · drag the bar to resize · ${meta.eventCount} changes · ${formatBytes(meta.bytes)}`}
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function niceStep(span: number): number {
  const steps = [
    60 * 1000,
    5 * 60 * 1000,
    15 * 60 * 1000,
    60 * 60 * 1000,
    3 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
  ];
  const target = span / 8;
  return steps.find((step) => step >= target) ?? 24 * 60 * 60 * 1000;
}

function formatTick(t: number, span: number): string {
  const date = new Date(t);
  if (span > 3 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (span > 3 * 60 * 60 * 1000) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatClock(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
