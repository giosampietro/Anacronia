import { describe, expect, it } from "vitest";

import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  createLatentMapRuntimeSnapshot,
  createLatentMapThumbnailAtlasPages,
  createLatentMapThumbnailRenderPlan,
  createLatentMapNeighborSet,
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  fitLatentMapPoints,
} from "@/lib/latent-map-viewer";

describe("latent map viewer model", () => {
  it("reports point and cluster counts for exported viewer data", () => {
    expect(createLatentMapStats(latentMapFixture)).toEqual({
      clusterCount: 3,
      pointCount: 8,
    });
  });

  it("selects FAISS neighbors from the selected exported point", () => {
    expect(
      [...createLatentMapNeighborSet(latentMapFixture, "img_saffron")],
    ).toEqual(["img_amber", "img_vermilion", "img_cobalt"]);
  });

  it("marks selected and neighbor points before cluster colors", () => {
    const states = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });

    const stateById = Object.fromEntries(
      states.map((point) => [point.image_id, point.point_state]),
    );

    expect(stateById.img_saffron).toBe("selected");
    expect(stateById.img_amber).toBe("neighbor");
    expect(stateById.img_vermilion).toBe("neighbor");
    expect(stateById.img_cobalt).toBe("neighbor");
    expect(stateById.img_teal).toBe("cluster");
  });

  it("plans all-image atlas thumbnail rendering from generated thumbnails", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });
    const plan = createLatentMapThumbnailRenderPlan({
      points: renderState,
      thumbnailSize: 64,
    });

    expect(plan.capped).toBe(false);
    expect(plan.strategy).toBe("all-atlas");
    expect(plan.thumbnailSize).toBe(64);
    expect(plan.hoverPreviewSize).toBe(256);
    expect(plan.thumbnailPoints).toHaveLength(8);
    expect(plan.atlasPages).toHaveLength(1);
    expect(plan.atlasPages[0].tileSize).toBe(64);
    expect(plan.thumbnailPoints.map((point) => point.image_id).slice(0, 4)).toEqual([
      "img_amber",
      "img_cobalt",
      "img_glass",
      "img_lime",
    ]);
    expect(plan.textureSources).toHaveLength(8);
    expect(plan.textureSources.every((source) => source.startsWith("data:image/png"))).toBe(true);
    expect(plan.textureSources).not.toContain("fixture/a1.jpg");
  });

  it("keeps all-image atlas thumbnail order stable when selection changes", () => {
    const saffronState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });
    const tealState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_teal",
    });
    const saffronPlan = createLatentMapThumbnailRenderPlan({
      points: saffronState,
      strategy: "all-atlas",
    });
    const tealPlan = createLatentMapThumbnailRenderPlan({
      points: tealState,
      strategy: "all-atlas",
    });

    expect(saffronPlan.thumbnailPoints.map((point) => point.image_id)).toEqual(
      tealPlan.thumbnailPoints.map((point) => point.image_id),
    );
  });

  it("keeps the old capped thumbnail sample available as an explicit fallback", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });
    const plan = createLatentMapThumbnailRenderPlan({
      maxThumbnails: 4,
      points: renderState,
      strategy: "capped-sprites",
    });

    expect(plan.capped).toBe(true);
    expect(plan.thumbnailPoints.map((point) => point.image_id)).toEqual([
      "img_saffron",
      "img_amber",
      "img_cobalt",
      "img_vermilion",
    ]);
  });

  it("samples capped thumbnails across the fitted layout", () => {
    const points = Array.from({ length: 25 }, (_, index) => {
      const column = index % 5;
      const row = Math.floor(index / 5);

      return {
        image_id: `img_${String(index).padStart(2, "0")}`,
        x: column,
        y: row,
        fitted_x: column - 2,
        fitted_y: row - 2,
        cluster_id: 0,
        thumbnail_path: `thumb-${index}.jpg`,
        source_path: `source-${index}.jpg`,
        relative_path: `source-${index}.jpg`,
        width: 100,
        height: 100,
        neighbors: [],
        color: [150, 156, 166] as [number, number, number],
        point_state: "cluster" as const,
      };
    });
    const plan = createLatentMapThumbnailRenderPlan({
      maxThumbnails: 9,
      points,
      strategy: "capped-sprites",
    });

    expect(plan.thumbnailPoints).toHaveLength(9);
    expect(new Set(plan.thumbnailPoints.map((point) => point.fitted_x)).size)
      .toBeGreaterThan(1);
    expect(new Set(plan.thumbnailPoints.map((point) => point.fitted_y)).size)
      .toBeGreaterThan(1);
  });

  it("models atlas page counts for 32, 64, and 96 pixel map thumbnails", () => {
    const points = Array.from({ length: 3184 }, (_, index) => ({
      image_id: `img_${String(index).padStart(4, "0")}`,
      x: index,
      y: index,
      fitted_x: 0,
      fitted_y: 0,
      cluster_id: 0,
      thumbnail_path: `thumb-${index}.jpg`,
      source_path: `source-${index}.jpg`,
      relative_path: `source-${index}.jpg`,
      width: 100,
      height: 100,
      neighbors: [],
      color: [150, 156, 166] as [number, number, number],
      point_state: "cluster" as const,
    }));

    expect(createLatentMapThumbnailAtlasPages({ points, tileSize: 32 })).toHaveLength(1);
    expect(createLatentMapThumbnailAtlasPages({ points, tileSize: 64 })).toHaveLength(4);
    expect(createLatentMapThumbnailAtlasPages({ points, tileSize: 96 })).toHaveLength(8);
  });

  it("estimates atlas texture budget for a synthetic 10k image map", () => {
    const points = Array.from({ length: 10_000 }, (_, index) => ({
      image_id: `img_${String(index).padStart(5, "0")}`,
      x: index,
      y: index,
      fitted_x: 0,
      fitted_y: 0,
      cluster_id: 0,
      thumbnail_path: `thumb-${index}.jpg`,
      source_path: `source-${index}.jpg`,
      relative_path: `source-${index}.jpg`,
      width: 100,
      height: 100,
      neighbors: [],
      color: [150, 156, 166] as [number, number, number],
      point_state: "cluster" as const,
    }));

    const at32 = createLatentMapThumbnailRenderPlan({
      points,
      thumbnailSize: 32,
    });
    const at64 = createLatentMapThumbnailRenderPlan({
      points,
      thumbnailSize: 64,
    });
    const at96 = createLatentMapThumbnailRenderPlan({
      points,
      thumbnailSize: 96,
    });
    const atlasBytes = 2048 * 2048 * 4;

    expect(at32.atlasPages).toHaveLength(3);
    expect(at32.estimatedAtlasTextureBytes).toBe(3 * atlasBytes);
    expect(at64.atlasPages).toHaveLength(10);
    expect(at64.estimatedAtlasTextureBytes).toBe(10 * atlasBytes);
    expect(at96.atlasPages).toHaveLength(23);
    expect(at96.estimatedAtlasTextureBytes).toBe(23 * atlasBytes);
  });

  it("summarizes runtime diagnostics from the render plan and renderer info", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });
    const thumbnailPlan = createLatentMapThumbnailRenderPlan({
      points: renderState,
      thumbnailSize: 64,
    });

    expect(
      createLatentMapRuntimeSnapshot({
        loadedThumbnailCount: 5,
        pointCount: renderState.length,
        renderMode: "thumbnails",
        rendererInfo: {
          memory: {
            geometries: 2,
            textures: 1,
          },
          render: {
            calls: 3,
            points: 8,
            triangles: 16,
          },
        },
        thumbnailPlan,
      }),
    ).toEqual({
      atlasPageCount: 1,
      drawCalls: 3,
      geometryCount: 2,
      liveTextureCount: 1,
      loadedThumbnailCount: 5,
      pointCount: 8,
      rendererPointCount: 8,
      rendererTriangleCount: 16,
      renderMode: "thumbnails",
      thumbnailCount: 8,
      thumbnailSize: 64,
    });
  });

  it("fits arbitrary UMAP coordinates into stable WebGL world space", () => {
    const fitted = fitLatentMapPoints(latentMapFixture.points);
    const xs = fitted.map((point) => point.fitted_x);
    const ys = fitted.map((point) => point.fitted_y);

    expect(Math.max(...xs)).toBeLessThanOrEqual(0.86);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.86);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.86);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.86);
  });

  it("finds the nearest fitted point for hover and click hit testing", () => {
    const fitted = fitLatentMapPoints(latentMapFixture.points);
    const saffron = fitted.find((point) => point.image_id === "img_saffron");

    expect(saffron).toBeDefined();
    expect(
      findNearestLatentMapPoint({
        maxDistance: 0.01,
        points: fitted,
        x: saffron?.fitted_x ?? 0,
        y: saffron?.fitted_y ?? 0,
      })?.image_id,
    ).toBe("img_saffron");
  });
});
