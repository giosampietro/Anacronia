import type {
  LatentMapPointScreenBounds,
  LatentMapViewState,
} from "@/lib/latent-map-webgl-runtime";
import type { LatentMapRenderablePoint } from "@/lib/latent-map-viewer";

export const LATENT_MAP_MIN_ZOOM = 0.45;
export const LATENT_MAP_MAX_ZOOM = 48;

const WHEEL_LINE_HEIGHT = 16;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

type LatentMapViewportRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type LatentMapPointerPosition = {
  clientX: number;
  clientY: number;
};

type LatentMapZoomLimits = {
  maxZoom?: number | null;
  minZoom?: number | null;
};

export function clampLatentMapZoom(
  zoom: number,
  limits: LatentMapZoomLimits = {},
): number {
  const minZoom =
    typeof limits.minZoom === "number" && Number.isFinite(limits.minZoom)
      ? limits.minZoom
      : LATENT_MAP_MIN_ZOOM;
  const maxZoom =
    typeof limits.maxZoom === "number" && Number.isFinite(limits.maxZoom)
      ? limits.maxZoom
      : LATENT_MAP_MAX_ZOOM;

  return Math.min(
    Math.max(minZoom, maxZoom),
    Math.max(minZoom, zoom),
  );
}

export function normalizeLatentMapWheelDelta({
  deltaMode,
  deltaY,
  viewportHeight,
}: {
  deltaMode: number;
  deltaY: number;
  viewportHeight: number;
}): number {
  if (deltaMode === 1) {
    return deltaY * WHEEL_LINE_HEIGHT;
  }

  if (deltaMode === 2) {
    return deltaY * Math.max(viewportHeight, 1);
  }

  return deltaY;
}

export function createLatentMapWheelZoomView({
  deltaMode,
  deltaY,
  maxZoom,
  minZoom,
  pointer,
  view,
  viewport,
}: {
  deltaMode: number;
  deltaY: number;
  maxZoom?: number | null;
  minZoom?: number | null;
  pointer: LatentMapPointerPosition;
  view: LatentMapViewState;
  viewport: LatentMapViewportRect;
}): LatentMapViewState {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const zoomLimits = { maxZoom, minZoom };
  const currentZoom = clampLatentMapZoom(view.zoom, zoomLimits);
  const wheelDelta = normalizeLatentMapWheelDelta({
    deltaMode,
    deltaY,
    viewportHeight,
  });
  const zoomFactor = Math.exp(-wheelDelta * WHEEL_ZOOM_SENSITIVITY);
  const nextZoom = clampLatentMapZoom(currentZoom * zoomFactor, zoomLimits);

  if (nextZoom === currentZoom) {
    return {
      ...view,
      zoom: currentZoom,
    };
  }

  const aspect = viewportWidth / viewportHeight;
  const ndcX = ((pointer.clientX - viewport.left) / viewportWidth) * 2 - 1;
  const ndcY = -(((pointer.clientY - viewport.top) / viewportHeight) * 2 - 1);
  const worldX = view.offsetX + (ndcX * aspect) / currentZoom;
  const worldY = view.offsetY + ndcY / currentZoom;

  return {
    offsetX: worldX - (ndcX * aspect) / nextZoom,
    offsetY: worldY - ndcY / nextZoom,
    zoom: nextZoom,
  };
}

export function createLatentMapScreenSurfaceWheelZoomView({
  baseView,
  deltaMode,
  deltaY,
  maxZoom,
  minZoom,
  pointer,
  view,
  viewport,
}: {
  baseView: LatentMapViewState;
  deltaMode: number;
  deltaY: number;
  maxZoom?: number | null;
  minZoom?: number | null;
  pointer: LatentMapPointerPosition;
  view: LatentMapViewState;
  viewport: LatentMapViewportRect;
}): LatentMapViewState {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const zoomLimits = { maxZoom, minZoom };
  const currentZoom = clampLatentMapZoom(view.zoom, zoomLimits);
  const wheelDelta = normalizeLatentMapWheelDelta({
    deltaMode,
    deltaY,
    viewportHeight,
  });
  const zoomFactor = Math.exp(-wheelDelta * WHEEL_ZOOM_SENSITIVITY);
  const nextZoom = clampLatentMapZoom(currentZoom * zoomFactor, zoomLimits);

  if (nextZoom === currentZoom) {
    return {
      ...view,
      zoom: currentZoom,
    };
  }

  const pointerX = pointer.clientX - viewport.left;
  const pointerY = pointer.clientY - viewport.top;
  const baseZoom = Math.max(baseView.zoom, 0.001);
  const currentZoomRatio = currentZoom / baseZoom;
  const currentPixelsPerWorldUnit =
    (viewportHeight * Math.max(currentZoom, 0.001)) / 2;
  const currentPanX =
    -(view.offsetX - baseView.offsetX) * currentPixelsPerWorldUnit;
  const currentPanY =
    (view.offsetY - baseView.offsetY) * currentPixelsPerWorldUnit;
  const baseSurfaceX =
    viewportWidth / 2 +
    (pointerX - viewportWidth / 2 - currentPanX) / currentZoomRatio;
  const baseSurfaceY =
    viewportHeight / 2 +
    (pointerY - viewportHeight / 2 - currentPanY) / currentZoomRatio;
  const nextZoomRatio = nextZoom / baseZoom;
  const nextPanX =
    pointerX -
    viewportWidth / 2 -
    (baseSurfaceX - viewportWidth / 2) * nextZoomRatio;
  const nextPanY =
    pointerY -
    viewportHeight / 2 -
    (baseSurfaceY - viewportHeight / 2) * nextZoomRatio;
  const nextPixelsPerWorldUnit =
    (viewportHeight * Math.max(nextZoom, 0.001)) / 2;

  return {
    offsetX: baseView.offsetX - nextPanX / nextPixelsPerWorldUnit,
    offsetY: baseView.offsetY + nextPanY / nextPixelsPerWorldUnit,
    zoom: nextZoom,
  };
}

export function createLatentMapScreenTargetWheelZoomView({
  bounds,
  deltaMode,
  deltaY,
  maxZoom,
  minZoom,
  pointer,
  target,
  view,
  viewport,
}: {
  bounds: LatentMapPointScreenBounds | null | undefined;
  deltaMode: number;
  deltaY: number;
  maxZoom?: number | null;
  minZoom?: number | null;
  pointer: LatentMapPointerPosition;
  target: LatentMapRenderablePoint | null | undefined;
  view: LatentMapViewState;
  viewport: LatentMapViewportRect;
}): LatentMapViewState | null {
  if (!bounds || !target || target.tween_screen_kind !== "grid") {
    return null;
  }

  if (
    typeof target.tween_screen_base_offset_x !== "number" ||
    typeof target.tween_screen_base_offset_y !== "number" ||
    typeof target.tween_screen_base_zoom !== "number" ||
    typeof target.tween_screen_cell_gap !== "number" ||
    typeof target.tween_screen_column !== "number" ||
    typeof target.tween_screen_height !== "number" ||
    typeof target.tween_screen_row !== "number" ||
    typeof target.tween_screen_width !== "number" ||
    typeof target.tween_screen_x !== "number" ||
    typeof target.tween_screen_y !== "number"
  ) {
    return null;
  }

  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const zoomLimits = { maxZoom, minZoom };
  const currentZoom = clampLatentMapZoom(view.zoom, zoomLimits);
  const wheelDelta = normalizeLatentMapWheelDelta({
    deltaMode,
    deltaY,
    viewportHeight,
  });
  const zoomFactor = Math.exp(-wheelDelta * WHEEL_ZOOM_SENSITIVITY);
  const nextZoom = clampLatentMapZoom(currentZoom * zoomFactor, zoomLimits);

  if (nextZoom === currentZoom) {
    return {
      ...view,
      zoom: currentZoom,
    };
  }

  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const pointerX = pointer.clientX - viewport.left;
  const pointerY = pointer.clientY - viewport.top;
  const localX = (pointerX - bounds.x) / bounds.width;
  const localY = (pointerY - bounds.y) / bounds.height;

  if (
    !Number.isFinite(localX) ||
    !Number.isFinite(localY) ||
    localX < 0 ||
    localX > 1 ||
    localY < 0 ||
    localY > 1
  ) {
    return null;
  }

  const baseLongSide = Math.max(
    target.tween_screen_width,
    target.tween_screen_height,
    1,
  );
  const maxLongSide =
    typeof target.tween_screen_max_long_side === "number" &&
    Number.isFinite(target.tween_screen_max_long_side)
      ? target.tween_screen_max_long_side
      : 1024;
  const nextZoomRatio = Math.max(
    0.1,
    Math.min(
      nextZoom / Math.max(target.tween_screen_base_zoom, 0.001),
      Math.max(maxLongSide / baseLongSide, 1),
    ),
  );
  const nextWidth = target.tween_screen_width * nextZoomRatio;
  const nextHeight = target.tween_screen_height * nextZoomRatio;
  const nextLeft = pointerX - localX * nextWidth;
  const nextTop = pointerY - localY * nextHeight;
  const baseLeft = target.tween_screen_x - target.tween_screen_width / 2;
  const baseTop = target.tween_screen_y - target.tween_screen_height / 2;
  const packedBaseLeft =
    baseLeft - target.tween_screen_column * target.tween_screen_cell_gap;
  const packedBaseTop =
    baseTop - target.tween_screen_row * target.tween_screen_cell_gap;
  const noPanLeft =
    viewportWidth / 2 +
    (packedBaseLeft - viewportWidth / 2) * nextZoomRatio +
    target.tween_screen_column * target.tween_screen_cell_gap;
  const noPanTop =
    viewportHeight / 2 +
    (packedBaseTop - viewportHeight / 2) * nextZoomRatio +
    target.tween_screen_row * target.tween_screen_cell_gap;
  const nextPanX = nextLeft - noPanLeft;
  const nextPanY = nextTop - noPanTop;
  const pixelsPerWorldUnit =
    (viewportHeight * Math.max(nextZoom, 0.001)) / 2;

  return {
    offsetX:
      target.tween_screen_base_offset_x - nextPanX / pixelsPerWorldUnit,
    offsetY:
      target.tween_screen_base_offset_y + nextPanY / pixelsPerWorldUnit,
    zoom: nextZoom,
  };
}
