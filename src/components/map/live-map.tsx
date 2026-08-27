"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Layers } from "lucide-react";
import type { ImageOverlay, Map as LeafletMap } from "leaflet";
import { applyDelta } from "@/lib/world/diff";
import {
  GRID_METERS,
  latLngToWorld,
  MAP_BOUNDS,
  WORLD_X_MIN,
  WORLD_Y_SOUTH,
  worldToLatLng,
} from "@/lib/world/coords";
import {
  DEFAULT_LAYERS,
  DEMO_SERVER_ID,
  type ConfigPatch,
  type HubConfig,
  type HubStatus,
  type MapEntity,
  type WorldDelta,
  type WorldSnapshot,
} from "@/lib/world/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { attachEntityCanvas, type EntityCanvasHandle } from "@/components/map/entity-canvas";
import { ControlPanel } from "@/components/map/control-panel";
import { LayersPanel } from "@/components/map/layers-panel";
import { HistoryTimeline } from "@/components/map/history-timeline";
import { SidebarResizeHandle } from "@/components/map/sidebar-resize";
import {
  clampSidebarWidth,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  type PublicUser,
} from "@/lib/auth/types";

export function LiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EntityCanvasHandle | null>(null);
  const entitiesRef = useRef(new Map<string, MapEntity>());
  const revRef = useRef(0);
  const layersRef = useRef(DEFAULT_LAYERS);

  const [status, setStatus] = useState<HubStatus | null>(null);
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [serverId, setServerId] = useState(DEMO_SERVER_ID);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [hiddenSubs, setHiddenSubs] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [account, setAccount] = useState<PublicUser | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [selected, setSelected] = useState<MapEntity | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [terrainReady, setTerrainReady] = useState(false);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [timelineOffset, setTimelineOffset] = useState(116);
  const mapRef = useRef<LeafletMap | null>(null);
  const overlaysRef = useRef<{ schematic: ImageOverlay; terrain: ImageOverlay | null } | null>(null);
  const zTouchedRef = useRef(false);
  const [historyLive, setHistoryLive] = useState(true);
  const historyLiveRef = useRef(true);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/auth", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = (await response.json()) as { user?: PublicUser | null };
      if (!body.user) {
        window.location.href = "/login";
        return;
      }
      setAccount(body.user);
      setServerId(body.user.prefs.serverId || DEMO_SERVER_ID);
      setLayers(body.user.prefs.layers ?? DEFAULT_LAYERS);
      setHiddenTypes(body.user.prefs.hiddenTypes ?? []);
      setHiddenSubs(body.user.prefs.hiddenSubs ?? []);
      setLeftWidth(clampSidebarWidth(body.user.prefs.leftWidth, DEFAULT_LEFT_WIDTH));
      setRightWidth(clampSidebarWidth(body.user.prefs.rightWidth, DEFAULT_RIGHT_WIDTH));
      setPrefsReady(true);
    })();
  }, []);

  const selectServer = useCallback((id: string) => {
    setServerId(id);
    setSelected(null);
    zTouchedRef.current = false;
    historyLiveRef.current = true;
    setHistoryLive(true);
  }, []);

  const [entityMap, setEntityMap] = useState(new Map<string, MapEntity>());
  const [zExtent, setZExtent] = useState({ min: -50, max: 800 });
  const [zLower, setZLower] = useState(-50);
  const [zUpper, setZUpper] = useState(800);

  const pushEntities = useCallback((next: Map<string, MapEntity>) => {
    entitiesRef.current = next;
    setEntityMap(next);
    canvasRef.current?.setEntities(next);
    let min = Infinity;
    let max = -Infinity;
    for (const entity of next.values()) {
      min = Math.min(min, entity.z);
      max = Math.max(max, entity.z);
    }
    if (!Number.isFinite(min)) {
      min = -50;
      max = 800;
    }
    min = Math.floor(min) - 2;
    max = Math.ceil(max) + 2;
    if (max <= min) max = min + 1;
    setZExtent({ min, max });
    if (!zTouchedRef.current) {
      setZLower(min);
      setZUpper(max);
    } else {
      setZLower((lo) => Math.min(Math.max(lo, min), max));
      setZUpper((hi) => Math.min(Math.max(hi, min), max));
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch(`/api/world?server=${encodeURIComponent(serverId)}`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) return;
    const snapshot = (await response.json()) as WorldSnapshot;
    revRef.current = snapshot.rev;
    pushEntities(new Map(snapshot.entities.map((entity) => [entity.id, entity])));
  }, [pushEntities, serverId]);

  const loadConfig = useCallback(async () => {
    const response = await fetch(`/api/config?server=${encodeURIComponent(serverId)}`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) return;
    const body = (await response.json()) as { config: HubConfig; status: HubStatus };
    setConfig(body.config);
    setStatus(body.status);
    if (!body.config.servers.some((server) => server.id === serverId)) {
      const fallback = body.config.servers.find((server) => server.kind === "watch")?.id ?? DEMO_SERVER_ID;
      selectServer(fallback);
    }
  }, [selectServer, serverId]);

  useEffect(() => {
    layersRef.current = layers;
    canvasRef.current?.setLayers(layers);
  }, [layers]);

  useEffect(() => {
    canvasRef.current?.setHiddenTypes(hiddenTypes);
  }, [hiddenTypes]);

  useEffect(() => {
    canvasRef.current?.setHiddenSubs(hiddenSubs);
  }, [hiddenSubs]);

  useEffect(() => {
    canvasRef.current?.setHighlight(highlight);
  }, [highlight]);

  useEffect(() => {
    canvasRef.current?.setZRange({ min: zLower, max: zUpper });
  }, [zLower, zUpper]);

  useEffect(() => {
    canvasRef.current?.setSelected(selected?.id ?? null);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    let onMouse: ((event: import("leaflet").LeafletMouseEvent) => void) | undefined;

    void (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        crs: L.CRS.Simple,
        minZoom: -4,
        maxZoom: 4,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: false,
        zoomControl: false,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.createPane("worldMap");
      const worldPane = map.getPane("worldMap");
      if (worldPane) worldPane.style.zIndex = "350";

      map.fitBounds(MAP_BOUNDS, { animate: false });
      map.setView(worldToLatLng(WORLD_X_MIN + 2 * GRID_METERS + 480, WORLD_Y_SOUTH - 420), -0.5);
      const schematic = L.imageOverlay("/api/map.svg", MAP_BOUNDS, {
        pane: "worldMap",
        opacity: 0.95,
        interactive: false,
      }).addTo(map);
      overlaysRef.current = { schematic, terrain: null };
      mapRef.current = map;

      void fetch("/api/terrain")
        .then((response) => {
          if (!response.ok || cancelled) return null;
          const terrain = L.imageOverlay("/api/terrain", MAP_BOUNDS, {
            pane: "worldMap",
            opacity: 1,
            interactive: false,
          });
          overlaysRef.current = { schematic, terrain };
          setTerrainReady(true);
          return terrain;
        })
        .catch(() => null);

      L.rectangle(MAP_BOUNDS, {
        color: "#f4c37d",
        weight: 1,
        opacity: 0.25,
        fill: false,
        interactive: false,
      }).addTo(map);

      const canvas = attachEntityCanvas(L, map, (entity) => setSelected(entity));
      canvas.setLayers(layersRef.current);
      canvas.setHiddenTypes(hiddenTypes);
      canvas.setHiddenSubs(hiddenSubs);
      canvas.setEntities(entitiesRef.current);
      canvasRef.current = canvas;

      onMouse = (event) => {
        setCursor(latLngToWorld(event.latlng.lat, event.latlng.lng));
      };
      map.on("mousemove", onMouse);
    })();

    return () => {
      cancelled = true;
      canvasRef.current?.remove();
      canvasRef.current = null;
      overlaysRef.current = null;
      mapRef.current = null;
      if (map && onMouse) map.off("mousemove", onMouse);
      map?.remove();
    };
  }, []);

  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [leftWidth, rightWidth]);

  const resizeLeft = useCallback((delta: number) => {
    setLeftWidth((width) => {
      const mapMin = 280;
      const max = typeof window === "undefined" ? 560 : Math.min(560, window.innerWidth - rightWidth - mapMin);
      return clampSidebarWidth(width + delta, DEFAULT_LEFT_WIDTH) <= max
        ? Math.min(max, Math.max(240, width + delta))
        : width;
    });
  }, [rightWidth]);

  const resizeRight = useCallback((delta: number) => {
    setRightWidth((width) => {
      const mapMin = 280;
      const max = typeof window === "undefined" ? 560 : Math.min(560, window.innerWidth - leftWidth - mapMin);
      return Math.min(max, Math.max(240, width + delta));
    });
  }, [leftWidth]);

  useEffect(() => {
    const map = mapRef.current;
    const overlays = overlaysRef.current;
    if (!map || !overlays) return;
    const wantTerrain = overlays.terrain;
    if (wantTerrain && overlays.terrain) {
      if (!map.hasLayer(overlays.terrain)) overlays.terrain.addTo(map);
      if (map.hasLayer(overlays.schematic)) map.removeLayer(overlays.schematic);
    } else {
      if (overlays.terrain && map.hasLayer(overlays.terrain)) map.removeLayer(overlays.terrain);
      if (!map.hasLayer(overlays.schematic)) overlays.schematic.addTo(map);
    }
  }, [terrainReady]);

  useEffect(() => {
    if (!prefsReady || !account) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prefs",
          prefs: { serverId, layers, hiddenTypes, hiddenSubs, leftWidth, rightWidth },
        }),
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [account, hiddenSubs, hiddenTypes, layers, leftWidth, prefsReady, rightWidth, serverId]);

  useEffect(() => {
    if (!prefsReady) return;
    void loadSnapshot();
    void loadConfig();
    const source = new EventSource(`/api/world/stream?server=${encodeURIComponent(serverId)}`);
    source.addEventListener("status", (event) => {
      setStatus(JSON.parse((event as MessageEvent).data) as HubStatus);
    });
    source.addEventListener("delta", (event) => {
      const delta = JSON.parse((event as MessageEvent).data) as WorldDelta;
      if (!historyLiveRef.current) return;
      if (delta.fromRev !== revRef.current) {
        void loadSnapshot();
        return;
      }
      revRef.current = delta.rev;
      pushEntities(applyDelta(entitiesRef.current, delta));
      setSelected((current) => {
        if (!current) return current;
        if (delta.removed.includes(current.id)) return null;
        return delta.updated.find((entity) => entity.id === current.id) ?? current;
      });
    });
    return () => source.close();
  }, [loadConfig, loadSnapshot, prefsReady, pushEntities, serverId]);

  const patchConfig = async (patch: ConfigPatch) => {
    if (patch.removeServerId && patch.removeServerId === serverId) {
      selectServer(DEMO_SERVER_ID);
    }
    const response = await fetch(`/api/config?server=${encodeURIComponent(serverId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await response.json()) as {
      config: HubConfig;
      status: HubStatus;
      added?: { id: string };
      alreadyExists?: boolean;
      reclaimed?: boolean;
    };
    setConfig(body.config);
    setStatus(body.status);
    if (body.added?.id) selectServer(body.added.id);
    return { alreadyExists: body.alreadyExists, reclaimed: body.reclaimed };
  };

  const uploadSave = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/saves?server=${encodeURIComponent(serverId)}`, { method: "POST", body: form });
    const body = (await response.json()) as { serverId?: string };
    if (body.serverId && body.serverId !== serverId) selectServer(body.serverId);
    await loadSnapshot();
    await loadConfig();
  };

  const refresh = async () => {
    await fetch(`/api/world?server=${encodeURIComponent(serverId)}`, { method: "POST" });
    await loadSnapshot();
    await loadConfig();
  };

  const onHistorySeek = useCallback(
    (entities: Map<string, MapEntity>) => {
      historyLiveRef.current = false;
      setHistoryLive(false);
      pushEntities(entities);
    },
    [pushEntities],
  );

  const onHistoryLiveChange = useCallback(
    (nextLive: boolean) => {
      historyLiveRef.current = nextLive;
      setHistoryLive(nextLive);
      if (nextLive) void loadSnapshot();
    },
    [loadSnapshot],
  );

  const logout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = "/login";
  };

  const panel = (
    <ControlPanel
      status={status}
      config={config}
      serverId={serverId}
      selected={selected}
      zExtent={zExtent}
      zLower={zLower}
      zUpper={zUpper}
      onZRange={(lo, hi) => {
        zTouchedRef.current = true;
        setZLower(lo);
        setZUpper(hi);
      }}
      onZReset={() => {
        zTouchedRef.current = false;
        setZLower(zExtent.min);
        setZUpper(zExtent.max);
      }}
      onServerId={selectServer}
      onConfig={patchConfig}
      onUpload={uploadSave}
      onRefresh={refresh}
      account={account}
      canEditCatalog={account?.role === "admin"}
      onLogout={logout}
    />
  );

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <aside
        className="relative hidden h-full min-h-0 shrink-0 overflow-hidden border-r border-border bg-sidebar md:flex md:flex-col"
        style={{ width: leftWidth }}
      >
        {panel}
        <SidebarResizeHandle edge="left" onDelta={resizeLeft} />
      </aside>
      <div
        className="relative h-full min-h-0 min-w-0 flex-1"
        style={{ ["--leaflet-bottom-offset" as string]: `${timelineOffset + 8}px` }}
      >
        <div ref={containerRef} className="relative z-0 h-full w-full isolate bg-[#0c1c2c]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
          <div className="pointer-events-auto md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="secondary">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100%,24rem)] p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Map controls</SheetTitle>
                </SheetHeader>
                {panel}
              </SheetContent>
            </Sheet>
          </div>
          <div className="ml-auto flex items-start gap-2">
            <div className="pointer-events-auto md:hidden">
              <Sheet open={layersOpen} onOpenChange={setLayersOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" variant="secondary">
                    <Layers />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[min(100%,22rem)] p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Layers</SheetTitle>
                  </SheetHeader>
                  <LayersPanel
                    entities={entityMap}
                    layers={layers}
                    hiddenTypes={hiddenTypes}
                    hiddenSubs={hiddenSubs}
                    onLayers={setLayers}
                    onHiddenTypes={setHiddenTypes}
                    onHiddenSubs={setHiddenSubs}
                    onHover={setHighlight}
                  />
                </SheetContent>
              </Sheet>
            </div>
            <div className="rounded-md border border-border/70 bg-background/80 px-2 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur">
              {historyLive ? "" : "Replay · "}
              {cursor ? `X ${cursor.x.toFixed(0)}  Y ${cursor.y.toFixed(0)}` : "MASSAGE-2(A-B)b"}
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 p-2">
          <HistoryTimeline
            serverId={serverId}
            live={historyLive}
            liveRev={status?.rev ?? 0}
            onLiveChange={onHistoryLiveChange}
            onSeek={onHistorySeek}
            onHeight={setTimelineOffset}
          />
        </div>
      </div>
      <aside
        className="relative hidden h-full min-h-0 min-w-0 shrink-0 overflow-hidden border-l border-border bg-sidebar md:flex md:flex-col"
        style={{ width: rightWidth }}
      >
        <SidebarResizeHandle edge="right" onDelta={resizeRight} />
        <LayersPanel
          entities={entityMap}
          layers={layers}
          hiddenTypes={hiddenTypes}
          hiddenSubs={hiddenSubs}
          onLayers={setLayers}
          onHiddenTypes={setHiddenTypes}
          onHiddenSubs={setHiddenSubs}
          onHover={setHighlight}
        />
      </aside>
    </div>
  );
}
