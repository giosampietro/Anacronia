import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

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

export function clampLatentMapZoom(zoom: number): number {
  return Math.min(
    LATENT_MAP_MAX_ZOOM,
    Math.max(LATENT_MAP_MIN_ZOOM, zoom),
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
  pointer,
  view,
  viewport,
}: {
  deltaMode: number;
  deltaY: number;
  pointer: LatentMapPointerPosition;
  view: LatentMapViewState;
  viewport: LatentMapViewportRect;
}): LatentMapViewState {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const currentZoom = clampLatentMapZoom(view.zoom);
  const wheelDelta = normalizeLatentMapWheelDelta({
    deltaMode,
    deltaY,
    viewportHeight,
  });
  const zoomFactor = Math.exp(-wheelDelta * WHEEL_ZOOM_SENSITIVITY);
  const nextZoom = clampLatentMapZoom(currentZoom * zoomFactor);

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
