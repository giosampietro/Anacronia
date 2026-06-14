import { describe, expect, it } from "vitest";

import {
  createLatentMapScreenSurfaceWheelZoomView,
  createLatentMapScreenTargetWheelZoomView,
  createLatentMapWheelZoomView,
  LATENT_MAP_MAX_ZOOM,
  LATENT_MAP_MIN_ZOOM,
  normalizeLatentMapWheelDelta,
} from "@/lib/latent-map-view-controls";
import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";
import type { LatentMapRenderablePoint } from "@/lib/latent-map-viewer";

const viewport = {
  height: 500,
  left: 0,
  top: 0,
  width: 1000,
};

function getWorldPoint({
  clientX,
  clientY,
  view,
}: {
  clientX: number;
  clientY: number;
  view: LatentMapViewState;
}) {
  const aspect = viewport.width / viewport.height;
  const ndcX = (clientX / viewport.width) * 2 - 1;
  const ndcY = -((clientY / viewport.height) * 2 - 1);

  return {
    x: view.offsetX + (ndcX * aspect) / view.zoom,
    y: view.offsetY + ndcY / view.zoom,
  };
}

function getScreenSurfacePoint({
  baseView,
  clientX,
  clientY,
  view,
}: {
  baseView: LatentMapViewState;
  clientX: number;
  clientY: number;
  view: LatentMapViewState;
}) {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const localX = clientX - viewport.left;
  const localY = clientY - viewport.top;
  const zoomRatio = view.zoom / Math.max(baseView.zoom, 0.001);
  const pixelsPerWorldUnit = (viewportHeight * Math.max(view.zoom, 0.001)) / 2;
  const panX = -(view.offsetX - baseView.offsetX) * pixelsPerWorldUnit;
  const panY = (view.offsetY - baseView.offsetY) * pixelsPerWorldUnit;

  return {
    x: viewportWidth / 2 + (localX - viewportWidth / 2 - panX) / zoomRatio,
    y: viewportHeight / 2 + (localY - viewportHeight / 2 - panY) / zoomRatio,
  };
}

function projectScreenSurfacePoint({
  baseView,
  point,
  view,
}: {
  baseView: LatentMapViewState;
  point: { x: number; y: number };
  view: LatentMapViewState;
}) {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const zoomRatio = view.zoom / Math.max(baseView.zoom, 0.001);
  const pixelsPerWorldUnit = (viewportHeight * Math.max(view.zoom, 0.001)) / 2;
  const panX = -(view.offsetX - baseView.offsetX) * pixelsPerWorldUnit;
  const panY = (view.offsetY - baseView.offsetY) * pixelsPerWorldUnit;

  return {
    clientX:
      viewport.left +
      viewportWidth / 2 +
      (point.x - viewportWidth / 2) * zoomRatio +
      panX,
    clientY:
      viewport.top +
      viewportHeight / 2 +
      (point.y - viewportHeight / 2) * zoomRatio +
      panY,
  };
}

function createGridTarget(
  overrides: Partial<LatentMapRenderablePoint> = {},
): LatentMapRenderablePoint {
  return {
    image_id: "img_grid",
    x: 0,
    y: 0,
    cluster_id: 0,
    thumbnail_path: "thumb.jpg",
    relative_path: "source.jpg",
    width: 1600,
    height: 900,
    fitted_x: 0,
    fitted_y: 0,
    color: [1, 1, 1],
    point_state: "neighbor",
    ...overrides,
  };
}

function projectGridTargetLocalPoint({
  localX,
  localY,
  target,
  view,
}: {
  localX: number;
  localY: number;
  target: LatentMapRenderablePoint;
  view: LatentMapViewState;
}) {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const baseZoom = Math.max(target.tween_screen_base_zoom ?? 1, 0.001);
  const baseWidth = target.tween_screen_width ?? 1;
  const baseHeight = target.tween_screen_height ?? 1;
  const maxLongSide = target.tween_screen_max_long_side ?? 1024;
  const baseLongSide = Math.max(baseWidth, baseHeight, 1);
  const zoomRatio = Math.max(
    0.1,
    Math.min(
      view.zoom / baseZoom,
      Math.max(maxLongSide / baseLongSide, 1),
    ),
  );
  const width = baseWidth * zoomRatio;
  const height = baseHeight * zoomRatio;
  const pixelsPerWorldUnit = (viewportHeight * Math.max(view.zoom, 0.001)) / 2;
  const panX =
    -(view.offsetX - (target.tween_screen_base_offset_x ?? 0)) *
    pixelsPerWorldUnit;
  const panY =
    (view.offsetY - (target.tween_screen_base_offset_y ?? 0)) *
    pixelsPerWorldUnit;
  const packedBaseX = (target.tween_screen_packed_left ?? 0) + localX * baseWidth;
  const packedBaseY = (target.tween_screen_packed_top ?? 0) + localY * baseHeight;

  return {
    clientX:
      viewport.left +
      viewportWidth / 2 +
      (packedBaseX - viewportWidth / 2) * zoomRatio +
      (target.tween_screen_column ?? 0) * (target.tween_screen_cell_gap ?? 0) +
      panX,
    clientY:
      viewport.top +
      viewportHeight / 2 +
      (packedBaseY - viewportHeight / 2) * zoomRatio +
      (target.tween_screen_row ?? 0) * (target.tween_screen_cell_gap ?? 0) +
      panY,
    height,
    width,
  };
}

describe("latent map view controls", () => {
  it("normalizes wheel delta modes into pixel-like deltas", () => {
    expect(
      normalizeLatentMapWheelDelta({
        deltaMode: 0,
        deltaY: 10,
        viewportHeight: 500,
      }),
    ).toBe(10);
    expect(
      normalizeLatentMapWheelDelta({
        deltaMode: 1,
        deltaY: 10,
        viewportHeight: 500,
      }),
    ).toBe(160);
    expect(
      normalizeLatentMapWheelDelta({
        deltaMode: 2,
        deltaY: 1,
        viewportHeight: 500,
      }),
    ).toBe(500);
  });

  it("uses wheel delta magnitude for smoother zoom steps", () => {
    const view = {
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
    };
    const pointer = {
      clientX: 500,
      clientY: 250,
    };
    const smallStep = createLatentMapWheelZoomView({
      deltaMode: 0,
      deltaY: -10,
      pointer,
      view,
      viewport,
    });
    const largeStep = createLatentMapWheelZoomView({
      deltaMode: 0,
      deltaY: -100,
      pointer,
      view,
      viewport,
    });

    expect(smallStep.zoom).toBeGreaterThan(view.zoom);
    expect(largeStep.zoom).toBeGreaterThan(smallStep.zoom);
  });

  it("keeps the world point under the cursor anchored while zooming", () => {
    const view = {
      offsetX: 0.2,
      offsetY: -0.1,
      zoom: 1.5,
    };
    const pointer = {
      clientX: 750,
      clientY: 125,
    };
    const before = getWorldPoint({ ...pointer, view });
    const afterView = createLatentMapWheelZoomView({
      deltaMode: 0,
      deltaY: -120,
      pointer,
      view,
      viewport,
    });
    const after = getWorldPoint({ ...pointer, view: afterView });

    expect(afterView.zoom).toBeGreaterThan(view.zoom);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom without shifting the map when already at a limit", () => {
    expect(
      createLatentMapWheelZoomView({
        deltaMode: 0,
        deltaY: -10_000,
        pointer: {
          clientX: 750,
          clientY: 125,
        },
        view: {
          offsetX: 0.2,
          offsetY: -0.1,
          zoom: LATENT_MAP_MAX_ZOOM,
        },
        viewport,
      }),
    ).toEqual({
      offsetX: 0.2,
      offsetY: -0.1,
      zoom: LATENT_MAP_MAX_ZOOM,
    });
    expect(
      createLatentMapWheelZoomView({
        deltaMode: 0,
        deltaY: 10_000,
        pointer: {
          clientX: 750,
          clientY: 125,
        },
        view: {
          offsetX: 0.2,
          offsetY: -0.1,
          zoom: LATENT_MAP_MIN_ZOOM,
        },
        viewport,
      }),
    ).toEqual({
      offsetX: 0.2,
      offsetY: -0.1,
      zoom: LATENT_MAP_MIN_ZOOM,
    });
  });

  it("supports an interaction-specific max zoom without cursor drift", () => {
    const view = {
      offsetX: 0.2,
      offsetY: -0.1,
      zoom: 2.9,
    };
    const pointer = {
      clientX: 750,
      clientY: 125,
    };
    const before = getWorldPoint({ ...pointer, view });
    const afterView = createLatentMapWheelZoomView({
      deltaMode: 0,
      deltaY: -120,
      maxZoom: 3,
      pointer,
      view,
      viewport,
    });
    const after = getWorldPoint({ ...pointer, view: afterView });

    expect(afterView.zoom).toBe(3);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("keeps the neighborhood screen surface under the cursor while zooming", () => {
    const baseView = {
      offsetX: -0.6,
      offsetY: 0.2,
      zoom: 1,
    };
    const view = {
      offsetX: -0.52,
      offsetY: 0.08,
      zoom: 1.4,
    };
    const pointer = {
      clientX: 740,
      clientY: 310,
    };
    const before = getScreenSurfacePoint({ ...pointer, baseView, view });
    const afterView = createLatentMapScreenSurfaceWheelZoomView({
      baseView,
      deltaMode: 0,
      deltaY: -160,
      pointer,
      view,
      viewport,
    });
    const after = projectScreenSurfacePoint({
      baseView,
      point: before,
      view: afterView,
    });

    expect(afterView.zoom).toBeGreaterThan(view.zoom);
    expect(after.clientX).toBeCloseTo(pointer.clientX);
    expect(after.clientY).toBeCloseTo(pointer.clientY);
  });

  it("keeps the local grid-image point under the cursor while zooming", () => {
    const baseView = {
      offsetX: -0.6,
      offsetY: 0.2,
      zoom: 1,
    };
    const target = createGridTarget({
      tween_screen_base_offset_x: baseView.offsetX,
      tween_screen_base_offset_y: baseView.offsetY,
      tween_screen_base_zoom: baseView.zoom,
      tween_screen_cell_gap: 32,
      tween_screen_cell_size: 160,
      tween_screen_column: 2,
      tween_screen_grid_x: 450,
      tween_screen_grid_y: 80,
      tween_screen_height: 120,
      tween_screen_kind: "grid",
      tween_screen_max_long_side: 900,
      tween_screen_packed_left: 606,
      tween_screen_packed_top: 228,
      tween_screen_row: 1,
      tween_screen_width: 180,
      tween_screen_x: 760,
      tween_screen_y: 320,
    });
    const localX = 0.72;
    const localY = 0.36;
    const before = projectGridTargetLocalPoint({
      localX,
      localY,
      target,
      view: baseView,
    });
    const bounds = {
      centerX: target.tween_screen_x ?? 0,
      centerY: target.tween_screen_y ?? 0,
      height: target.tween_screen_height ?? 0,
      width: target.tween_screen_width ?? 0,
      x: (target.tween_screen_x ?? 0) - (target.tween_screen_width ?? 0) / 2,
      y: (target.tween_screen_y ?? 0) - (target.tween_screen_height ?? 0) / 2,
    };
    const afterView = createLatentMapScreenTargetWheelZoomView({
      bounds,
      deltaMode: 0,
      deltaY: -160,
      pointer: {
        clientX: before.clientX,
        clientY: before.clientY,
      },
      target,
      view: baseView,
      viewport,
    });

    expect(afterView).not.toBeNull();

    const after = projectGridTargetLocalPoint({
      localX,
      localY,
      target,
      view: afterView!,
    });

    expect(afterView!.zoom).toBeGreaterThan(baseView.zoom);
    expect(after.clientX).toBeCloseTo(before.clientX);
    expect(after.clientY).toBeCloseTo(before.clientY);
  });
});
