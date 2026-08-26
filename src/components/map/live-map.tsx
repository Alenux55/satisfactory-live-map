"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
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
  type EntityCategory,
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

export function LiveMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EntityCanvasHandle | null>(null);
  const entitiesRef = useRef(new Map<string, MapEntity>());
  const revRef = useRef(0);
  const layersRef = useRef(DEFAULT_LAYERS);

  const [status, setStatus] = useState<HubStatus | null>(null);
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [selected, setSelected] = useState<MapEntity | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [useTerrain, setUseTerrain] = useState(true);
  const [terrainReady, setTerrainReady] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const overlaysRef = useRef<{ schematic: ImageOverlay; terrain: ImageOverlay | null } | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("ficsit-terrain") === "0") setUseTerrain(false);
    } catch {
      // private mode
    }
  }, []);

  const setTerrainPref = useCallback((on: boolean) => {
    setUseTerrain(on);
    try {
      localStorage.setItem("ficsit-terrain", on ? "1" : "0");
    } catch {
      // private mode
    }
  }, []);

  const pushEntities = useCallback((next: Map<string, MapEntity>) => {
    entitiesRef.current = next;
    canvasRef.current?.setEntities(next);
  }, []);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch("/api/world", { cache: "no-store" });
    const snapshot = (await response.json()) as WorldSnapshot;
    revRef.current = snapshot.rev;
    pushEntities(new Map(snapshot.entities.map((entity) => [entity.id, entity])));
  }, [pushEntities]);

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/config", { cache: "no-store" });
    const body = (await response.json()) as { config: HubConfig; status: HubStatus };
    setConfig(body.config);
    setStatus(body.status);
  }, []);

  useEffect(() => {
    layersRef.current = layers;
    canvasRef.current?.setLayers(layers);
  }, [layers]);

  useEffect(() => {
    canvasRef.current?.setSelected(selected?.id ?? null);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;
    let onMove: (() => void) | undefined;

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
      canvas.setEntities(entitiesRef.current);
      canvasRef.current = canvas;

      onMove = () => {
        const center = map!.getCenter();
        setCursor(latLngToWorld(center.lat, center.lng));
      };
      map.on("move", onMove);
      onMove();
    })();

    return () => {
      cancelled = true;
      canvasRef.current?.remove();
      canvasRef.current = null;
      overlaysRef.current = null;
      mapRef.current = null;
      if (map && onMove) map.off("move", onMove);
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const overlays = overlaysRef.current;
    if (!map || !overlays) return;
    const wantTerrain = useTerrain && overlays.terrain;
    if (wantTerrain && overlays.terrain) {
      if (!map.hasLayer(overlays.terrain)) overlays.terrain.addTo(map);
      if (map.hasLayer(overlays.schematic)) map.removeLayer(overlays.schematic);
    } else {
      if (overlays.terrain && map.hasLayer(overlays.terrain)) map.removeLayer(overlays.terrain);
      if (!map.hasLayer(overlays.schematic)) overlays.schematic.addTo(map);
    }
  }, [useTerrain, terrainReady]);

  useEffect(() => {
    void loadSnapshot();
    void loadConfig();
    const source = new EventSource("/api/world/stream");
    source.addEventListener("status", (event) => {
      setStatus(JSON.parse((event as MessageEvent).data) as HubStatus);
    });
    source.addEventListener("delta", (event) => {
      const delta = JSON.parse((event as MessageEvent).data) as WorldDelta;
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
  }, [loadConfig, loadSnapshot, pushEntities]);

  const patchConfig = async (patch: Partial<HubConfig>) => {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await response.json()) as { config: HubConfig; status: HubStatus };
    setConfig(body.config);
    setStatus(body.status);
  };

  const uploadSave = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    await fetch("/api/saves", { method: "POST", body: form });
    await loadSnapshot();
    await loadConfig();
  };

  const refresh = async () => {
    await fetch("/api/world", { method: "POST" });
    await loadSnapshot();
    await loadConfig();
  };

  const panel = (
    <ControlPanel
      status={status}
      config={config}
      layers={layers}
      selected={selected}
      useTerrain={useTerrain}
      terrainReady={terrainReady}
      onTerrain={setTerrainPref}
      onLayers={setLayers}
      onConfig={patchConfig}
      onUpload={uploadSave}
      onRefresh={refresh}
    />
  );

  return (
    <div className="flex h-dvh min-h-0 bg-background">
      <aside className="hidden w-[360px] shrink-0 border-r border-border bg-sidebar md:block">{panel}</aside>
      <div className="relative min-w-0 flex-1">
        <div ref={containerRef} className="h-full w-full bg-[#0c1c2c]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
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
          <div className="ml-auto rounded-md border border-border/70 bg-background/80 px-2 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur">
            {cursor ? `X ${cursor.x.toFixed(0)}  Y ${cursor.y.toFixed(0)}` : "MASSAGE-2(A-B)b"}
          </div>
        </div>
      </div>
    </div>
  );
}
