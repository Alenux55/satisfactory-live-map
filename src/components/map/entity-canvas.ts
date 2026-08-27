import type { Map as LeafletMap, LeafletMouseEvent } from "leaflet";
import type { EntityCategory, MapEntity } from "@/lib/world/types";
import { CATEGORY_COLORS } from "@/lib/world/categorize";
import { worldToLatLng } from "@/lib/world/coords";
import { PURITY_COLORS } from "@/lib/world/resource";
import { layerIcons, layerKey } from "@/lib/world/builder-menu";
import { iconSrc } from "@/lib/world/icons";

type LayerFlags = Record<EntityCategory, boolean>;

export type EntityCanvasHandle = {
  setEntities: (entities: Map<string, MapEntity>) => void;
  setLayers: (layers: LayerFlags) => void;
  setHiddenTypes: (hidden: Iterable<string>) => void;
  setHighlight: (key: string | null) => void;
  setZRange: (range: { min: number; max: number } | null) => void;
  setSelected: (id: string | null) => void;
  remove: () => void;
};

const iconCache = new Map<string, HTMLImageElement | "fail">();

function loadIcon(candidates: string[], onReady: () => void): HTMLImageElement | null {
  const src = iconSrc(candidates);
  if (!src) return null;
  const cached = iconCache.get(src);
  if (cached === "fail") return null;
  if (cached?.complete && cached.naturalWidth > 0) return cached;
  if (cached) return null;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => onReady();
  image.onerror = () => {
    iconCache.set(src, "fail");
    const rest = candidates.slice(1);
    if (rest.length) loadIcon(rest, onReady);
  };
  image.src = src;
  iconCache.set(src, image);
  return null;
}

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
  let hidden = new Set<string>();
  let highlight: string | null = null;
  let zRange: { min: number; max: number } | null = null;
  let selectedId: string | null = null;
  let destroyed = false;

  const visible = (entity: MapEntity) => {
    if (layers && !layers[entity.category]) return false;
    if (hidden.has(layerKey(entity))) return false;
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
      if ((entity.category === "foundations" || entity.category === "walls" || entity.category === "architecture") && !showOrg) {
        continue;
      }

      const key = layerKey(entity);
      const isHi = highlight != null && key === highlight;
      if (highlight && !isHi) ctx.globalAlpha = 0.18;
      else ctx.globalAlpha = 1;

      if (entity.path && entity.path.length >= 2) {
        ctx.beginPath();
        entity.path.forEach(([x, y], i) => {
          const p = map.latLngToContainerPoint(worldToLatLng(x, y));
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = isHi ? "#fff7ed" : CATEGORY_COLORS[entity.category];
        ctx.lineWidth = (entity.category === "power" ? lineWidth * 0.85 : lineWidth) * (isHi ? 1.8 : 1);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }

      const p = map.latLngToContainerPoint(worldToLatLng(entity.x, entity.y));
      if (entity.category === "resource") {
        const radius = Math.max(6, metersToPx(7));
        const fill = entity.purity ? PURITY_COLORS[entity.purity] : "#888888";
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        const icon = loadIcon(layerIcons(entity), draw);
        if (icon) {
          const inner = radius * 0.72;
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, inner, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(icon, p.x - inner, p.y - inner, inner * 2, inner * 2);
          ctx.restore();
        }
        if (entity.claimed) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }
        if (entity.id === selectedId || isHi) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
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
        ctx.globalAlpha = 1;
        continue;
      }
      const w = metersToPx(entity.w);
      const h = metersToPx(entity.h);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((entity.yaw * Math.PI) / 180);
      ctx.fillStyle = CATEGORY_COLORS[entity.category];
      ctx.globalAlpha *= entity.category === "foundations" || entity.category === "walls" || entity.category === "architecture" ? 0.28 : 0.94;
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
        if (entity.id === selectedId || isHi) {
          ctx.strokeStyle = "#fff7ed";
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
        }
      }
      ctx.restore();

      if (
        showLabels &&
        (entity.category === "production" ||
          entity.category === "special" ||
          entity.label)
      ) {
        ctx.fillStyle = "#fff7ed";
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.globalAlpha = 1;
        ctx.fillText(entity.label || entity.type, p.x, p.y - h / 2 - 4);
      }
      ctx.globalAlpha = 1;
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
      if ((entity.category === "foundations" || entity.category === "walls" || entity.category === "architecture") && zoom < 0) {
        continue;
      }
      const p = map.latLngToContainerPoint(worldToLatLng(entity.x, entity.y));
      const dist = Math.hypot(p.x - click.x, p.y - click.y);
      const maxDist = entity.category === "resource" ? threshold + 6 : threshold;
      if (dist > maxDist) continue;
      if (
        !best ||
        dist < best.dist ||
        ((best.entity.category === "foundations" || best.entity.category === "walls") &&
          entity.category !== "foundations" &&
          entity.category !== "walls")
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
    setHiddenTypes(next) {
      hidden = new Set(next);
      draw();
    },
    setHighlight(key) {
      highlight = key;
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
