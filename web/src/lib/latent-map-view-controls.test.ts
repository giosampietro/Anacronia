import { describe, expect, it } from "vitest";

import {
  createLatentMapWheelZoomView,
  LATENT_MAP_MAX_ZOOM,
  LATENT_MAP_MIN_ZOOM,
  normalizeLatentMapWheelDelta,
} from "@/lib/latent-map-view-controls";
import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

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
});
