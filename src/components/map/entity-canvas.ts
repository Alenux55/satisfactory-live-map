import type { LatLng, Map as LeafletMap, LeafletMouseEvent, Point, ZoomAnimEvent } from "leaflet";
import type { EntityCategory, MapEntity } from "@/lib/world/types";
import { CATEGORY_COLORS } from "@/lib/world/categorize";
import { worldToLatLng } from "@/lib/world/coords";
import { PURITY_COLORS } from "@/lib/world/resource";
import { layerIcons, layerKey, matchesLayerHighlight, subcategoryId } from "@/lib/world/builder-menu";
import { iconSrc } from "@/lib/world/icons";
import { pioneerColor } from "@/lib/world/pioneer-color";

type LayerFlags = Record<EntityCategory, boolean>;

export type EntityCanvasHandle = {
  setEntities: (entities: Map<string, MapEntity>) => void;
  setLayers: (layers: LayerFlags) => void;
  setHiddenTypes: (hidden: Iterable<string>) => void;
  setHiddenSubs: (hidden: Iterable<string>) => void;
  setHighlight: (key: string | null) => void;
  setZRange: (range: { min: number; max: number } | null) => void;
  setSelected: (id: string | null) => void;
  remove: () => void;
};

const iconCache = new Map<string, HTMLImageElement | "fail">();

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

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
  const canvas = L.DomUtil.create("canvas", "satisfactory-entity-canvas leaflet-zoom-animated") as HTMLCanvasElement;
  canvas.style.pointerEvents = "none";
  const ctx = canvas.getContext("2d")!;
  map.getPanes().overlayPane.appendChild(canvas);

  let entities = new Map<string, MapEntity>();
  let layers: LayerFlags | null = null;
  let hidden = new Set<string>();
  let hiddenSubs = new Set<string>();
  let highlight: string | null = null;
  let drawnZoom = map.getZoom();
  let drawnCenter = map.getCenter();
  let zooming = false;
  let zRange: { min: number; max: number } | null = null;
  let selectedId: string | null = null;
  let destroyed = false;

  const visible = (entity: MapEntity) => {
    if (layers && !layers[entity.category]) return false;
    if (hiddenSubs.has(`${entity.category}:${subcategoryId(entity)}`)) return false;
    const key = layerKey(entity);
    if (hidden.has(key)) return false;
    if (entity.category === "resource") {
      const claimKey = entity.claimed ? `${key}:claimed` : `${key}:unclaimed`;
      if (hidden.has(claimKey)) return false;
    }
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

    const rest: MapEntity[] = [];
    const resources: MapEntity[] = [];
    const players: MapEntity[] = [];
    for (const entity of entities.values()) {
      if (!visible(entity)) continue;
      if ((entity.category === "foundations" || entity.category === "walls" || entity.category === "architecture") && !showOrg) {
        continue;
      }
      if (entity.category === "player") players.push(entity);
      else if (entity.category === "resource") resources.push(entity);
      else rest.push(entity);
    }

    for (const entity of [...rest, ...resources, ...players]) {
      const isHi = highlight != null && matchesLayerHighlight(entity, highlight);
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
        const radius = Math.max(18, metersToPx(21));
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
      ctx.fillStyle = entity.category === "player" ? pioneerColor(entity.id) : CATEGORY_COLORS[entity.category];
      ctx.globalAlpha *=
        entity.category === "foundations" ? 0.78 : entity.category === "walls" || entity.category === "architecture" ? 0.42 : 0.94;
      if (entity.category === "player") {
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6, 7);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#0b1220";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
        if (entity.category === "foundations") {
          ctx.strokeStyle = "#f6e7c1";
          ctx.lineWidth = 1;
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        }
        if (entity.id === selectedId || isHi) {
          ctx.strokeStyle = "#fff7ed";
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
        }
      }
      ctx.restore();

      if (
        (showLabels &&
          (entity.category === "production" ||
            entity.category === "special" ||
            entity.category === "player" ||
            entity.label)) ||
        (entity.category === "player" && zoom >= -1)
      ) {
        ctx.fillStyle = "#fff7ed";
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.globalAlpha = 1;
        ctx.fillText(entity.label || entity.type, p.x, p.y - (entity.category === "player" ? 14 : h / 2 - 4));
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
    drawnZoom = map.getZoom();
    drawnCenter = map.getCenter();
    draw();
  };

  const updateTransform = (center: LatLng, zoom: number) => {
    const scale = map.getZoomScale(zoom, drawnZoom);
    const viewHalf = map.getSize().multiplyBy(0.5);
    const currentCenterPoint = map.project(drawnCenter, zoom);
    const origin = (
      map as LeafletMap & { _getNewPixelOrigin: (center: LatLng, zoom: number) => Point }
    )._getNewPixelOrigin(center, zoom);
    L.DomUtil.setTransform(canvas, viewHalf.multiplyBy(-scale).add(currentCenterPoint).subtract(origin), scale);
  };

  const isStructure = (entity: MapEntity) =>
    entity.category === "foundations" || entity.category === "walls" || entity.category === "architecture";

  const pickRank = (entity: MapEntity) => {
    if (entity.category === "player") return 3;
    if (entity.category === "resource") return 2;
    if (isStructure(entity)) return 0;
    return 1;
  };

  const pick = (event: LeafletMouseEvent): MapEntity | null => {
    const click = event.containerPoint;
    const zoom = map.getZoom();
    const scale = map.getZoomScale(zoom, 0);
    const metersToPx = (meters: number) => Math.max(2, meters * scale * 0.45);
    const pad = zoom < -1 ? 10 : 6;
    let best: { entity: MapEntity; dist: number; area: number } | null = null;

    for (const entity of entities.values()) {
      if (!visible(entity)) continue;
      if (isStructure(entity) && zoom < 0) continue;

      const p = map.latLngToContainerPoint(worldToLatLng(entity.x, entity.y));
      const dist = Math.hypot(p.x - click.x, p.y - click.y);
      let hit = false;
      let area = 64;

      if (entity.path && entity.path.length >= 2) {
        const threshold = zoom < -1 ? 14 : 10;
        hit = dist <= threshold;
        for (let i = 1; !hit && i < entity.path.length; i += 1) {
          const a = map.latLngToContainerPoint(worldToLatLng(entity.path[i - 1][0], entity.path[i - 1][1]));
          const b = map.latLngToContainerPoint(worldToLatLng(entity.path[i][0], entity.path[i][1]));
          hit = distToSegment(click.x, click.y, a.x, a.y, b.x, b.y) <= threshold;
        }
        area = 8;
      } else if (entity.category === "resource") {
        hit = dist <= Math.max(18, metersToPx(21) + pad);
        area = 80;
      } else if (entity.category === "player") {
        hit = dist <= 16;
        area = 20;
      } else {
        const w = Math.max(14, metersToPx(entity.w) + pad * 2);
        const h = Math.max(14, metersToPx(entity.h) + pad * 2);
        const yaw = (entity.yaw * Math.PI) / 180;
        const dx = click.x - p.x;
        const dy = click.y - p.y;
        const lx = dx * Math.cos(yaw) + dy * Math.sin(yaw);
        const ly = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
        hit = Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
        area = w * h;
      }
      if (!hit) continue;

      const rank = pickRank(entity);
      const bestRank = best ? pickRank(best.entity) : -1;
      if (
        !best ||
        rank > bestRank ||
        (rank === bestRank && (area < best.area * 0.85 || (area <= best.area && dist < best.dist)))
      ) {
        best = { entity, dist, area };
      }
    }
    return best?.entity ?? null;
  };

  const onClick = (event: LeafletMouseEvent) => {
    onSelect(pick(event));
  };

  const onAnimZoom = (event: ZoomAnimEvent) => {
    updateTransform(event.center, event.zoom);
  };
  const onMove = () => {
    if (!zooming) reset();
  };
  const onZoomStart = () => {
    zooming = true;
  };
  const onZoomEnd = () => {
    zooming = false;
    reset();
  };

  map.on("zoomanim", onAnimZoom);
  map.on("zoomstart", onZoomStart);
  map.on("zoomend viewreset resize", onZoomEnd);
  map.on("move", onMove);
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
    setHiddenSubs(next) {
      hiddenSubs = new Set(next);
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
      map.off("zoomanim", onAnimZoom);
      map.off("zoomstart", onZoomStart);
      map.off("zoomend viewreset resize", onZoomEnd);
      map.off("move", onMove);
      map.off("click", onClick);
      canvas.remove();
    },
  };
}
