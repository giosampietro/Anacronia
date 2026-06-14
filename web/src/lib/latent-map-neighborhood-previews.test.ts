import { describe, expect, it } from "vitest";

import { createLatentMapNeighborhoodLayout } from "@/lib/latent-map-neighborhood-layout";
import {
  createLatentMapNeighborhoodPreviewPlan,
  LATENT_MAP_NEIGHBORHOOD_PREVIEW_TEXTURE_SIZE,
} from "@/lib/latent-map-neighborhood-previews";
import type { LatentMapPoint } from "@/lib/latent-map-viewer";

function createPoint(
  index: number,
  overrides: Partial<LatentMapPoint> = {},
): LatentMapPoint {
  return {
    image_id: `img_${String(index).padStart(3, "0")}`,
    x: index,
    y: index,
    cluster_id: 0,
    thumbnail_path: `thumb_${index}.jpg`,
    preview_path: `preview_${index}.jpg`,
    source_path: `source_${index}.jpg`,
    relative_path: `source_${index}.jpg`,
    width: 1000,
    height: 800,
    neighbors: [],
    ...overrides,
  };
}

function createPoints(): LatentMapPoint[] {
  return [
    createPoint(0, {
      neighbors: [
        { image_id: "img_001", score: 0.9 },
        { image_id: "img_002", score: 0.8 },
        { image_id: "img_003", score: 0.7 },
      ],
    }),
    createPoint(1),
    createPoint(2, {
      preview_path: undefined,
    }),
    createPoint(3),
    createPoint(4),
  ];
}

function createReadyLayout(points = createPoints()) {
  return createLatentMapNeighborhoodLayout({
    neighborCount: 3,
    points,
    relationMode: "closest",
    selectedImageId: "img_000",
    viewport: {
      height: 900,
      width: 1600,
    },
  });
}

describe("latent map neighborhood preview planning", () => {
  it("prefers preview sources for selected and ranked active rows", () => {
    const points = createPoints();
    const layout = createReadyLayout(points);
    const plan = createLatentMapNeighborhoodPreviewPlan({
      activeImageIds: new Set(["img_000", "img_001", "img_002", "img_003"]),
      isActive: true,
      layout,
      points,
    });

    expect(plan.items.map((item) => item.imageId)).toEqual([
      "img_000",
      "img_001",
      "img_002",
      "img_003",
    ]);
    expect(plan.items[0]).toMatchObject({
      source: "preview_0.jpg",
      sourceKind: "preview",
    });
  });

  it("falls back to thumbnail sources when preview is missing", () => {
    const points = createPoints();
    const layout = createReadyLayout(points);
    const plan = createLatentMapNeighborhoodPreviewPlan({
      activeImageIds: new Set(["img_000", "img_001", "img_002", "img_003"]),
      isActive: true,
      layout,
      points,
    });

    expect(plan.items[2]).toMatchObject({
      imageId: "img_002",
      source: "thumb_2.jpg",
      sourceKind: "thumbnail",
    });
  });

  it("caps planned preview textures by explicit budget", () => {
    const points = createPoints();
    const layout = createReadyLayout(points);
    const plan = createLatentMapNeighborhoodPreviewPlan({
      activeImageIds: new Set(["img_000", "img_001", "img_002", "img_003"]),
      budget: 2,
      isActive: true,
      layout,
      points,
    });

    expect(plan.items.map((item) => item.imageId)).toEqual([
      "img_000",
      "img_001",
    ]);
    expect(plan.budget).toBe(2);
  });

  it("plans all active 50-neighbor focus textures by default", () => {
    const points = Array.from({ length: 51 }, (_, index) => createPoint(index));

    points[0] = {
      ...points[0],
      neighbors: Array.from({ length: 50 }, (_, index) => ({
        image_id: `img_${String(index + 1).padStart(3, "0")}`,
        rank: index + 1,
        score: 1 - index * 0.01,
      })),
    };

    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 50,
      points,
      relationMode: "closest",
      selectedImageId: "img_000",
      viewport: {
        height: 900,
        width: 1600,
      },
    });
    const plan = createLatentMapNeighborhoodPreviewPlan({
      activeImageIds: new Set(points.map((point) => point.image_id)),
      isActive: true,
      layout,
      points,
    });

    expect(plan.budget).toBe(51);
    expect(plan.items).toHaveLength(51);
    expect(plan.items.at(-1)?.imageId).toBe("img_050");
  });

  it("exposes expected texture count and approximate memory bytes", () => {
    const points = createPoints();
    const layout = createReadyLayout(points);
    const plan = createLatentMapNeighborhoodPreviewPlan({
      activeImageIds: new Set(["img_000", "img_001", "img_002"]),
      isActive: true,
      layout,
      points,
    });

    expect(plan.items).toHaveLength(3);
    expect(plan.estimatedTextureBytes).toBe(
      3 * LATENT_MAP_NEIGHBORHOOD_PREVIEW_TEXTURE_SIZE *
        LATENT_MAP_NEIGHBORHOOD_PREVIEW_TEXTURE_SIZE *
        4,
    );
  });

  it("returns an empty plan when inactive or empty", () => {
    const points = createPoints();
    const readyLayout = createReadyLayout(points);
    const emptyLayout = createLatentMapNeighborhoodLayout({
      neighborCount: 3,
      points,
      relationMode: "closest",
      selectedImageId: null,
      viewport: {
        height: 900,
        width: 1600,
      },
    });

    expect(
      createLatentMapNeighborhoodPreviewPlan({
        activeImageIds: new Set(["img_000"]),
        isActive: false,
        layout: readyLayout,
        points,
      }).items,
    ).toEqual([]);
    expect(
      createLatentMapNeighborhoodPreviewPlan({
        activeImageIds: new Set(),
        isActive: true,
        layout: emptyLayout,
        points,
      }).items,
    ).toEqual([]);
  });
});
