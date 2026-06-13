import { describe, expect, it } from "vitest";

import {
  createLatentMapNeighborhoodRuntimePlan,
  createLatentMapRestoredRuntimePoints,
  getLatentMapNeighborhoodMaxZoom,
} from "@/lib/latent-map-neighborhood-targets";
import type { LatentMapRenderablePoint } from "@/lib/latent-map-viewer";

function createPoint(
  index: number,
  overrides: Partial<LatentMapRenderablePoint> = {},
): LatentMapRenderablePoint {
  return {
    image_id: `img_${String(index).padStart(3, "0")}`,
    x: index,
    y: index,
    fitted_x: index * 0.05,
    fitted_y: index * -0.05,
    cluster_id: 0,
    color: [150, 156, 166],
    thumbnail_path: `thumb-${index}.jpg`,
    preview_path: `preview-${index}.jpg`,
    source_path: `source-${index}.jpg`,
    relative_path: `source-${index}.jpg`,
    width: 1200,
    height: 800,
    point_state: "base",
    ...overrides,
  };
}

function createPoints() {
  const selected = createPoint(0, {
    neighbors: [
      { image_id: "img_001", rank: 1, score: 0.9 },
      { image_id: "img_002", rank: 2, score: 0.8 },
      { image_id: "img_003", rank: 3, score: 0.7 },
    ],
    opposites: [
      { image_id: "img_004", rank: 1, score: -0.4 },
      { image_id: "img_005", rank: 2, score: -0.5 },
    ],
    point_state: "selected",
  });

  return [
    selected,
    createPoint(1, { point_state: "neighbor" }),
    createPoint(2, { point_state: "neighbor" }),
    createPoint(3, { point_state: "neighbor" }),
    createPoint(4, { point_state: "opposite" }),
    createPoint(5, { point_state: "opposite" }),
    createPoint(6),
  ];
}

describe("latent map neighborhood runtime targets", () => {
  it("creates selected anchor, four-row grid targets, and a left-aligned recenter view", () => {
    const plan = createLatentMapNeighborhoodRuntimePlan({
      neighborCount: 3,
      points: createPoints(),
      relationMode: "closest",
      selectedImageId: "img_000",
      thumbnailSize: 64,
      viewport: { width: 1600, height: 900 },
    });

    expect(plan.status).toBe("ready");
    expect(plan.activeImageIds).toEqual(
      new Set(["img_000", "img_001", "img_002", "img_003"]),
    );
    expect(plan.recenterView?.zoom).toBeGreaterThan(0);
    expect(plan.layout.status).toBe("ready");

    if (plan.layout.status !== "ready") {
      throw new Error("Expected ready layout.");
    }

    expect(plan.layout.grid.columns).toBe(1);
    expect(plan.layout.grid.rowCount).toBe(3);
    expect(plan.layout.rows.map((row) => row.imageId)).toEqual([
      "img_001",
      "img_002",
      "img_003",
    ]);

    const selected = plan.points.find((point) => point.image_id === "img_000");
    const firstNeighbor = plan.points.find((point) => point.image_id === "img_001");
    const background = plan.points.find((point) => point.image_id === "img_006");

    expect(selected?.tween_state).toBe(2);
    expect(selected?.tween_size).toBeGreaterThan(
      firstNeighbor?.tween_size ?? 0,
    );
    expect(firstNeighbor?.tween_state).toBe(1);
    expect(background).toMatchObject({
      tween_alpha: 0,
      tween_size: 0,
      tween_state: 0,
    });
    expect(plan.recenterView?.offsetX).toBeTypeOf("number");
  });

  it("derives neighborhood max zoom from the anchor and largest grid target", () => {
    const plan = createLatentMapNeighborhoodRuntimePlan({
      neighborCount: 3,
      points: createPoints(),
      relationMode: "closest",
      selectedImageId: "img_000",
      thumbnailSize: 64,
      viewport: { width: 1600, height: 900 },
    });

    expect(plan.status).toBe("ready");

    const anchor = plan.points.find((point) => point.image_id === "img_000");
    const gridPoints = plan.points.filter(
      (point) => point.tween_screen_kind === "grid",
    );
    const largestGridLongSide = Math.max(
      ...gridPoints.map((point) =>
        Math.max(point.tween_screen_width ?? 0, point.tween_screen_height ?? 0),
      ),
    );
    const anchorMaxLongSide =
      Math.max(anchor?.tween_screen_width ?? 0, anchor?.tween_screen_height ?? 0) *
      1.5;
    const maxZoom = getLatentMapNeighborhoodMaxZoom(plan.points);

    expect(anchorMaxLongSide).toBeGreaterThan(largestGridLongSide);
    expect(maxZoom).toBeCloseTo(anchorMaxLongSide / largestGridLongSide);
  });

  it("preserves both-mode relation order and opposite identity metadata", () => {
    const plan = createLatentMapNeighborhoodRuntimePlan({
      neighborCount: 2,
      points: createPoints(),
      relationMode: "both",
      selectedImageId: "img_000",
      thumbnailSize: 64,
      viewport: { width: 1600, height: 900 },
    });

    expect(plan.status).toBe("ready");
    expect(plan.oppositeImageIds).toEqual(new Set(["img_004", "img_005"]));
    expect(
      plan.points.find((point) => point.image_id === "img_004")?.tween_state,
    ).toBe(3);

    if (plan.layout.status !== "ready") {
      throw new Error("Expected ready layout.");
    }

    expect(
      plan.layout.rows.map((row) => ({
        imageId: row.imageId,
        marker: row.marker,
        relation: row.relation,
      })),
    ).toEqual([
      { imageId: "img_001", marker: null, relation: "closest" },
      { imageId: "img_002", marker: null, relation: "closest" },
      { imageId: "img_004", marker: "opposite", relation: "opposite" },
      { imageId: "img_005", marker: "opposite", relation: "opposite" },
    ]);
  });

  it("returns restored normal-map targets when no selected image is available", () => {
    const points = createPoints();
    const plan = createLatentMapNeighborhoodRuntimePlan({
      neighborCount: 3,
      points,
      relationMode: "closest",
      selectedImageId: null,
      thumbnailSize: 64,
      viewport: { width: 1600, height: 900 },
    });

    expect(plan.status).toBe("empty");
    expect(plan.recenterView).toBeNull();
    expect(plan.points[0]).toMatchObject({
      tween_alpha: 1,
      tween_size: 1,
      tween_x: points[0].fitted_x,
      tween_y: points[0].fitted_y,
    });
  });

  it("creates explicit restore targets for exiting neighborhood mode", () => {
    const restored = createLatentMapRestoredRuntimePoints(createPoints());

    expect(restored.every((point) => point.tween_alpha === 1)).toBe(true);
    expect(restored.every((point) => point.tween_size === 1)).toBe(true);
    expect(restored[2]).toMatchObject({
      tween_x: restored[2].fitted_x,
      tween_y: restored[2].fitted_y,
    });
  });
});
