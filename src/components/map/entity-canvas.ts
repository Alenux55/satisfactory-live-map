import type { Map as LeafletMap, LeafletMouseEvent } from "leaflet";
import type { EntityCategory, MapEntity } from "@/lib/world/types";
import { CATEGORY_COLORS } from "@/lib/world/categorize";
import { worldToLatLng } from "@/lib/world/coords";
import { PURITY_COLORS, RESOURCE_TYPE_COLORS } from "@/lib/world/resource";

type LayerFlags = Record<EntityCategory, boolean>;

export type EntityCanvasHandle = {
  setEntities: (entities: Map<string, MapEntity>) => void;
  setLayers: (layers: LayerFlags) => void;
  setZRange: (range: { min: number; max: number } | null) => void;
  setSelected: (id: string | null) => void;
  remove: () => void;
};

export function attachEntityCanvas(
  L: typeof import("leaflet"),
  map: LeafletMap,
  onSelect: (entity: MapEntity | null) => void,
): EntityCanvasHandle {
  const canvas = L.DomUtil.create("canvas", "satisfactory-entity-canvas") as HTMLCanvasElement;
  canvas.style.pointerEvents = "none";
  const ctx = canvas.getContext("2d")!;
  map.getPanes().overlayPane.appendChild(canvas);

  let entities = new Map<string, MapEntity>();
  let layers: LayerFlags | null = null;
  let zRange: { min: number; max: number } | null = null;
  let selectedId: string | null = null;
  let destroyed = false;

  const visible = (entity: MapEntity) => {
    if (layers && !layers[entity.category]) return false;
    if (zRange && (entity.z < zRange.min || entity.z > zRange.max)) return false;
    return true;
  };

  const draw = () => {
    const size = map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
    const zoom = map.getZoom();
    const showOrg = zoom >= -1;
    const showLabels = zoom >= 1;
    const lineWidth = zoom < -2 ? 1 : zoom < 0 ? 1.5 : 2.2;
    const scale = map.getZoomScale(zoom, 0);
    const metersToPx = (meters: number) => Math.max(2, meters * scale * 0.45);

    for (const entity of entities.values()) {
      if (!visible(entity)) continue;
      if (entity.category === "organization" && !showOrg) continue;

      if (entity.path && entity.path.length >= 2) {
        ctx.beginPath();
        entity.path.forEach(([x, y], i) => {
          const p = map.latLngToContainerPoint(worldToLatLng(x, y));
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = CATEGORY_COLORS[entity.category];
        ctx.lineWidth = entity.category === "power" ? lineWidth * 0.85 : lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = entity.category === "logistics" ? 0.92 : 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }

      const p = map.latLngToContainerPoint(worldToLatLng(entity.x, entity.y));
      if (entity.category === "resource") {
        const radius = Math.max(4, metersToPx(entity.claimed ? 4 : 7));
        const fill = entity.purity ? PURITY_COLORS[entity.purity] : "#888888";
        const stroke = RESOURCE_TYPE_COLORS[entity.resource ?? "unknown"] ?? RESOURCE_TYPE_COLORS.unknown;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 1;
        ctx.stroke();
        if (entity.id === selectedId) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = "#fff7ed";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (showLabels) {
          ctx.fillStyle = "#fff7ed";
          ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(entity.label || entity.type, p.x, p.y - radius - 4);
        }
        continue;
      }
      const w = metersToPx(entity.w);
      const h = metersToPx(entity.h);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((entity.yaw * Math.PI) / 180);
      ctx.fillStyle = CATEGORY_COLORS[entity.category];
      ctx.globalAlpha = entity.category === "organization" ? 0.28 : 0.94;
      if (entity.category === "player") {
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5, 6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#052e16";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
        if (entity.id === selectedId) {
          ctx.strokeStyle = "#fff7ed";
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
        }
      }
      ctx.restore();

      if (
        showLabels &&
        (entity.category === "production" ||
          entity.category === "extraction" ||
          entity.category === "special" ||
          entity.label)
      ) {
        ctx.fillStyle = "#fff7ed";
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(entity.label || entity.type, p.x, p.y - h / 2 - 4);
      }
    }
  };

  const reset = () => {
    if (destroyed) return;
    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    canvas.width = Math.round(size.x * dpr);
    canvas.height = Math.round(size.y * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };

  const pick = (event: LeafletMouseEvent): MapEntity | null => {
    const click = event.containerPoint;
    const zoom = map.getZoom();
    const threshold = zoom < -1 ? 18 : 12;
    let best: { entity: MapEntity; dist: number } | null = null;
    for (const entity of entities.values()) {
      if (!visible(entity)) continue;
      if (entity.category === "organization" && zoom < 0) continue;
      const p = map.latLngToContainerPoint(worldToLatLng(entity.x, entity.y));
      const dist = Math.hypot(p.x - click.x, p.y - click.y);
      const maxDist = entity.category === "resource" ? threshold + 6 : threshold;
      if (dist > maxDist) continue;
      if (
        !best ||
        dist < best.dist ||
        (best.entity.category === "organization" && entity.category !== "organization")
      ) {
        best = { entity, dist };
      }
    }
    return best?.entity ?? null;
  };

  const onClick = (event: LeafletMouseEvent) => {
    onSelect(pick(event));
  };

  map.on("move zoom viewreset resize", reset);
  map.on("click", onClick);
  reset();

  return {
    setEntities(next) {
      entities = next;
      draw();
    },
    setLayers(next) {
      layers = next;
      draw();
    },
    setZRange(next) {
      zRange = next;
      draw();
    },
    setSelected(id) {
      selectedId = id;
      draw();
    },
    remove() {
      destroyed = true;
      map.off("move zoom viewreset resize", reset);
      map.off("click", onClick);
      canvas.remove();
    },
  };
}
