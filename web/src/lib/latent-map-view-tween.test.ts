import { describe, expect, it } from "vitest";

import {
  createLatentMapViewTween,
  shouldAnimateLatentMapView,
  stepLatentMapViewTween,
} from "@/lib/latent-map-view-tween";

describe("latent map view tween", () => {
  it("interpolates pan and zoom toward a target view", () => {
    const tween = createLatentMapViewTween({
      from: { offsetX: 0, offsetY: 0, zoom: 1 },
      now: 1000,
      to: { offsetX: 2, offsetY: -1, zoom: 4 },
    });

    const midway = stepLatentMapViewTween(tween, 1090);

    expect(midway.isAnimating).toBe(true);
    expect(midway.view.offsetX).toBeGreaterThan(0);
    expect(midway.view.offsetX).toBeLessThan(2);
    expect(midway.view.offsetY).toBeLessThan(0);
    expect(midway.view.offsetY).toBeGreaterThan(-1);
    expect(midway.view.zoom).toBeGreaterThan(1);
    expect(midway.view.zoom).toBeLessThan(4);

    const done = stepLatentMapViewTween(tween, 1180);

    expect(done).toEqual({
      isAnimating: false,
      progress: 1,
      view: { offsetX: 2, offsetY: -1, zoom: 4 },
    });
  });

  it("snaps when duration is zero", () => {
    const tween = createLatentMapViewTween({
      durationMs: 0,
      from: { offsetX: 0, offsetY: 0, zoom: 1 },
      now: 1000,
      to: { offsetX: 2, offsetY: -1, zoom: 4 },
    });

    expect(stepLatentMapViewTween(tween, 1000)).toEqual({
      isAnimating: false,
      progress: 1,
      view: { offsetX: 2, offsetY: -1, zoom: 4 },
    });
  });

  it("can retarget from the currently rendered view", () => {
    const firstTween = createLatentMapViewTween({
      durationMs: 100,
      from: { offsetX: 0, offsetY: 0, zoom: 1 },
      now: 0,
      to: { offsetX: 10, offsetY: 0, zoom: 3 },
    });
    const rendered = stepLatentMapViewTween(firstTween, 50).view;
    const secondTween = createLatentMapViewTween({
      durationMs: 100,
      from: rendered,
      now: 50,
      to: { offsetX: -5, offsetY: 2, zoom: 0.8 },
    });

    const retargeted = stepLatentMapViewTween(secondTween, 100).view;

    expect(retargeted.offsetX).toBeLessThan(rendered.offsetX);
    expect(retargeted.offsetX).toBeGreaterThan(-5);
    expect(retargeted.offsetY).toBeGreaterThan(0);
    expect(retargeted.offsetY).toBeLessThan(2);
    expect(retargeted.zoom).toBeLessThan(rendered.zoom);
    expect(retargeted.zoom).toBeGreaterThan(0.8);
  });

  it("skips animation when the view is already effectively at the target", () => {
    expect(
      shouldAnimateLatentMapView({
        from: { offsetX: 1, offsetY: 2, zoom: 3 },
        to: { offsetX: 1, offsetY: 2, zoom: 3 },
      }),
    ).toBe(false);
    expect(
      shouldAnimateLatentMapView({
        from: { offsetX: 1, offsetY: 2, zoom: 3 },
        to: { offsetX: 1.2, offsetY: 2, zoom: 3 },
      }),
    ).toBe(true);
  });
});
