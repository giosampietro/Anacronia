import { describe, expect, it } from "vitest";

import {
  createLatentMapRuntimeTweenController,
  createLatentMapTweenValues,
  LATENT_MAP_TWEEN_STRIDE,
  type LatentMapTweenItem,
} from "@/lib/latent-map-runtime-tween";

function createItem(
  imageId: string,
  values: Partial<ReturnType<typeof createLatentMapTweenValues>> = {},
): LatentMapTweenItem {
  return {
    imageId,
    values: createLatentMapTweenValues(values),
  };
}

describe("latent map runtime tween controller", () => {
  it("stores current and target values in typed buffers keyed by image id", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", { x: 1, y: 2 }),
      createItem("img_b", { x: 3, y: 4 }),
    ]);

    expect(controller.getCurrentBuffer()).toBeInstanceOf(Float32Array);
    expect(controller.getTargetBuffer()).toBeInstanceOf(Float32Array);
    expect(controller.getCurrentBuffer()).toHaveLength(
      2 * LATENT_MAP_TWEEN_STRIDE,
    );
    expect(controller.getIndex("img_a")).toBe(0);
    expect(controller.getIndex("img_b")).toBe(1);
    expect(controller.getIndex("img_missing")).toBeNull();
    expect(controller.readCurrentValues("img_b")).toMatchObject({
      x: 3,
      y: 4,
    });
  });

  it("completes short eased tweens deterministically", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", {
        alpha: 1,
        b: 0,
        g: 0,
        r: 1,
        size: 4,
        state: 0,
        x: 0,
      }),
    ]);

    expect(
      controller.retarget(
        [
          {
            imageId: "img_a",
            values: {
              alpha: 0.25,
              b: 1,
              g: 0.5,
              r: 0,
              size: 8,
              state: 2,
              x: 10,
            },
          },
        ],
        { durationMs: 100, now: 0 },
      ),
    ).toEqual({
      dirtyRange: { end: 1, start: 0 },
      isAnimating: true,
      missingImageIds: [],
    });

    const midway = controller.step(50);
    const midwayValues = controller.readCurrentValues("img_a");

    expect(midway).toEqual({
      dirtyRange: { end: 1, start: 0 },
      isAnimating: true,
    });
    expect(midwayValues?.x).toBeGreaterThan(0);
    expect(midwayValues?.x).toBeLessThan(10);
    expect(midwayValues?.size).toBeGreaterThan(4);
    expect(midwayValues?.alpha).toBeLessThan(1);

    expect(controller.step(100)).toEqual({
      dirtyRange: { end: 1, start: 0 },
      isAnimating: false,
    });
    expect(controller.readCurrentValues("img_a")).toMatchObject({
      alpha: 0.25,
      b: 1,
      g: 0.5,
      r: 0,
      size: 8,
      state: 2,
      x: 10,
    });
    expect(controller.isAnimating()).toBe(false);
  });

  it("retargets from the current rendered values mid-animation", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", { x: 0 }),
    ]);

    controller.retarget(
      [{ imageId: "img_a", values: { x: 10 } }],
      { durationMs: 100, now: 0 },
    );
    controller.step(50);
    const currentBeforeRetarget =
      controller.readCurrentValues("img_a")?.x ?? 0;

    controller.retarget(
      [{ imageId: "img_a", values: { x: 20 } }],
      { durationMs: 100, now: 50 },
    );
    expect(controller.readCurrentValues("img_a")?.x).toBeCloseTo(
      currentBeforeRetarget,
    );

    controller.step(100);
    const halfwayAfterRetarget = controller.readCurrentValues("img_a")?.x ?? 0;

    expect(halfwayAfterRetarget).toBeGreaterThan(currentBeforeRetarget);
    expect(halfwayAfterRetarget).toBeLessThan(20);

    controller.step(150);
    expect(controller.readCurrentValues("img_a")?.x).toBeCloseTo(20);
  });

  it("keeps image indexes stable across retargets and exposes dirty ranges", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", { x: 0 }),
      createItem("img_b", { x: 0 }),
      createItem("img_c", { x: 0 }),
    ]);

    expect(controller.getImageIds()).toEqual(["img_a", "img_b", "img_c"]);
    expect(controller.getIndex("img_c")).toBe(2);

    const result = controller.retarget(
      [{ imageId: "img_b", values: { x: 5 } }],
      { durationMs: 50, now: 0 },
    );

    expect(result).toEqual({
      dirtyRange: { end: 2, start: 1 },
      isAnimating: true,
      missingImageIds: [],
    });
    expect(controller.getIndex("img_c")).toBe(2);
    expect(controller.step(25).dirtyRange).toEqual({ end: 2, start: 1 });
  });

  it("reports missing image ids instead of mutating unknown targets", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", { x: 0 }),
    ]);

    expect(
      controller.retarget(
        [
          { imageId: "img_missing", values: { x: 10 } },
          { imageId: "img_a", values: { x: 2 } },
        ],
        { durationMs: 0, now: 0 },
      ),
    ).toEqual({
      dirtyRange: { end: 1, start: 0 },
      isAnimating: false,
      missingImageIds: ["img_missing"],
    });
    expect(controller.readCurrentValues("img_a")?.x).toBe(2);
  });

  it("preserves current rendered values for existing images when items change", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", { x: 0 }),
      createItem("img_b", { x: 1 }),
    ]);

    controller.retarget(
      [{ imageId: "img_b", values: { x: 10 } }],
      { durationMs: 100, now: 0 },
    );
    controller.step(50);
    const renderedB = controller.readCurrentValues("img_b")?.x ?? 0;
    const result = controller.setItems(
      [
        createItem("img_b", { x: 20 }),
        createItem("img_c", { x: 30 }),
      ],
      { now: 50 },
    );

    expect(result).toEqual({
      dirtyRange: { end: 2, start: 0 },
      isAnimating: false,
    });
    expect(controller.getImageIds()).toEqual(["img_b", "img_c"]);
    expect(controller.getIndex("img_b")).toBe(0);
    expect(controller.readCurrentValues("img_b")?.x).toBeCloseTo(renderedB);
    expect(controller.readCurrentValues("img_c")?.x).toBe(30);
  });

  it("cleans up buffers and ignores further mutation after disposal", () => {
    const controller = createLatentMapRuntimeTweenController([
      createItem("img_a", { x: 0 }),
    ]);

    controller.retarget(
      [{ imageId: "img_a", values: { x: 10 } }],
      { durationMs: 100, now: 0 },
    );
    controller.dispose();

    expect(controller.isDisposed()).toBe(true);
    expect(controller.isAnimating()).toBe(false);
    expect(controller.getCurrentBuffer()).toHaveLength(0);
    expect(controller.getTargetBuffer()).toHaveLength(0);
    expect(controller.getImageIds()).toEqual([]);
    expect(controller.readCurrentValues("img_a")).toBeNull();
    expect(
      controller.retarget(
        [{ imageId: "img_a", values: { x: 20 } }],
        { durationMs: 100, now: 0 },
      ),
    ).toEqual({
      dirtyRange: null,
      isAnimating: false,
      missingImageIds: ["img_a"],
    });
    expect(controller.step(50)).toEqual({
      dirtyRange: null,
      isAnimating: false,
    });
  });
});
