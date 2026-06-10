import { describe, expect, it } from "vitest";

import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  createLatentMapRuntimeSnapshot,
  createLatentMapThumbnailAtlasPages,
  createLatentMapThumbnailRendererComparison,
  createLatentMapThumbnailRenderPlan,
  createLatentMapNeighborSet,
  createLatentMapPointLayerPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  fitLatentMapPoints,
  getNextLatentMapSelection,
  isLatentMapThumbnailFocusActive,
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

  it("selects FAISS neighbors from a separately loaded neighbor index", () => {
    const splitFixture = structuredClone(latentMapFixture);
    splitFixture.points.forEach((point) => {
      delete point.neighbors;
    });

    expect(
      [
        ...createLatentMapNeighborSet(splitFixture, "img_saffron", {
          img_saffron: [
            { image_id: "img_amber", score: 0.94 },
            { image_id: "img_vermilion", score: 0.82 },
          ],
        }),
      ],
    ).toEqual(["img_amber", "img_vermilion"]);
    expect(
      [...createLatentMapNeighborSet(splitFixture, "img_saffron")],
    ).toEqual([]);
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

  it("clears FAISS focus when clicking the background or selected image", () => {
    expect(
      getNextLatentMapSelection({
        currentSelectedImageId: "img_saffron",
        pickedImageId: null,
      }),
    ).toBeNull();
    expect(
      getNextLatentMapSelection({
        currentSelectedImageId: "img_saffron",
        pickedImageId: "img_saffron",
      }),
    ).toBeNull();
    expect(
      getNextLatentMapSelection({
        currentSelectedImageId: "img_saffron",
        pickedImageId: "img_amber",
      }),
    ).toBe("img_amber");
  });

  it("uses FAISS focus thumbnails with small grey background points", () => {
    const focusedState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });
    const unfocusedState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const focusedThumbnailPlan = createLatentMapThumbnailRenderPlan({
      points: focusedState,
      thumbnailSize: 64,
    });
    const focusedPointLayer = createLatentMapPointLayerPlan({
      points: focusedState,
      renderMode: "thumbnails",
      thumbnailPlan: focusedThumbnailPlan,
    });

    expect(isLatentMapThumbnailFocusActive(focusedState)).toBe(true);
    expect(
      focusedThumbnailPlan.thumbnailPoints
        .map((point) => point.image_id)
        .sort(),
    ).toEqual([
      "img_amber",
      "img_cobalt",
      "img_saffron",
      "img_vermilion",
    ]);
    expect(focusedPointLayer.visible).toBe(true);
    expect(focusedPointLayer.pointSize).toBe(3);
    expect(
      new Set(
        focusedPointLayer.points.map((point) => JSON.stringify(point.color)),
      ),
    ).toEqual(new Set([JSON.stringify([150, 156, 166])]));
    expect(focusedPointLayer.points).toHaveLength(latentMapFixture.points.length);
    expect(isLatentMapThumbnailFocusActive(unfocusedState)).toBe(false);
  });

  it("plans all-image atlas thumbnail rendering from generated thumbnails", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
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

  it("keeps all-image atlas thumbnail order stable when no FAISS focus is active", () => {
    const firstState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const secondState = createLatentMapRenderState({
      clusterColorsEnabled: false,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const firstPlan = createLatentMapThumbnailRenderPlan({
      points: firstState,
      strategy: "all-atlas",
    });
    const secondPlan = createLatentMapThumbnailRenderPlan({
      points: secondState,
      strategy: "all-atlas",
    });

    expect(firstPlan.thumbnailPoints.map((point) => point.image_id)).toEqual(
      secondPlan.thumbnailPoints.map((point) => point.image_id),
    );
  });

  it("plans generated atlas assets without per-image base thumbnail textures", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const atlasItems = renderState.map((point, index) => ({
      height: point.height,
      image_id: point.image_id,
      page_index: 0,
      page_path: "viewer/atlases/32px/page-000.png",
      source_thumbnail_path: point.thumbnail_path,
      tile_rect: [index * 32, 0, 32, 32] as [number, number, number, number],
      uv_rect: [0.0078125, 0.0078125, 0.1, 0.1] as [
        number,
        number,
        number,
        number,
      ],
      width: point.width,
    }));

    const plan = createLatentMapThumbnailRenderPlan({
      points: renderState,
      thumbnailAtlas: {
        schema_version: 1,
        asset_kind: "latent-map-thumbnail-atlas",
        run_id: latentMapFixture.run_id,
        tile_size: 32,
        atlas_size: 256,
        image_count: renderState.length,
        page_count: 1,
        pages: [
          {
            height: 256,
            index: 0,
            path: "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F32px%2Fpage-000.png",
            width: 256,
          },
        ],
        items: atlasItems,
      },
      thumbnailSize: 32,
    });

    expect(plan.strategy).toBe("generated-atlas");
    expect(plan.textureSources).toEqual([
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F32px%2Fpage-000.png",
    ]);
    expect(plan.thumbnailPoints).toHaveLength(8);
    expect(plan.atlasPages).toHaveLength(1);
    expect(plan.atlasPages[0].texturePath).toBe(
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F32px%2Fpage-000.png",
    );
    expect(plan.atlasPages[0].items[0].uvRect).toEqual([
      0.0078125,
      0.0078125,
      0.1,
      0.1,
    ]);
  });

  it("reuses generated atlas textures when display thumbnail size changes", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const atlasItems = renderState.map((point, index) => ({
      height: point.height,
      image_id: point.image_id,
      page_index: 0,
      page_path: "viewer/atlases/64px/page-000.png",
      source_thumbnail_path: point.thumbnail_path,
      tile_rect: [index * 64, 0, 64, 64] as [number, number, number, number],
      uv_rect: [0.0078125, 0.0078125, 0.1, 0.1] as [
        number,
        number,
        number,
        number,
      ],
      width: point.width,
    }));

    const plan = createLatentMapThumbnailRenderPlan({
      points: renderState,
      thumbnailAtlas: {
        schema_version: 1,
        asset_kind: "latent-map-thumbnail-atlas",
        run_id: latentMapFixture.run_id,
        tile_size: 64,
        atlas_size: 512,
        image_count: renderState.length,
        page_count: 1,
        pages: [
          {
            height: 512,
            index: 0,
            path: "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F64px%2Fpage-000.png",
            width: 512,
          },
        ],
        items: atlasItems,
      },
      thumbnailSize: 32,
    });

    expect(plan.strategy).toBe("generated-atlas");
    expect(plan.thumbnailSize).toBe(32);
    expect(plan.textureSources).toEqual([
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F64px%2Fpage-000.png",
    ]);
    expect(plan.thumbnailPoints).toHaveLength(8);
  });

  it("keeps the old capped thumbnail sample available as an explicit fallback", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const plan = createLatentMapThumbnailRenderPlan({
      maxThumbnails: 4,
      points: renderState,
      strategy: "capped-sprites",
    });

    expect(plan.capped).toBe(true);
    expect(plan.thumbnailPoints.map((point) => point.image_id)).toEqual([
      "img_saffron",
      "img_lime",
      "img_amber",
      "img_glass",
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

  it("compares per-thumbnail sprites against the instanced atlas path", () => {
    const points = Array.from({ length: 3_184 }, (_, index) => ({
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
    const plan = createLatentMapThumbnailRenderPlan({
      points,
      thumbnailSize: 64,
    });
    const comparison = createLatentMapThumbnailRendererComparison(plan);

    expect(comparison.spriteBaseline).toMatchObject({
      drawCalls: 3_184,
      gpuTextures: 3_184,
      materialCount: 3_184,
      sprites: 3_184,
    });
    expect(comparison.instancedAtlas).toMatchObject({
      atlasPageCount: 4,
      drawCalls: 4,
      gpuTextures: 4,
      instances: 3_184,
    });
    expect(comparison.recommendation).toBe(
      "generate-atlas-pages-before-scaling",
    );
  });

  it("models generated atlas pages as bounded texture requests", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const plan = createLatentMapThumbnailRenderPlan({
      points: renderState,
      thumbnailAtlas: {
        schema_version: 1,
        asset_kind: "latent-map-thumbnail-atlas",
        run_id: latentMapFixture.run_id,
        tile_size: 64,
        atlas_size: 512,
        image_count: renderState.length,
        page_count: 1,
        pages: [
          {
            height: 512,
            index: 0,
            path: "/api/latent-map/thumbnails?run=run-1&path=page-000.png",
            width: 512,
          },
        ],
        items: renderState.map((point, index) => ({
          height: point.height,
          image_id: point.image_id,
          page_index: 0,
          page_path: "page-000.png",
          source_thumbnail_path: point.thumbnail_path,
          tile_rect: [index * 64, 0, 64, 64] as [
            number,
            number,
            number,
            number,
          ],
          uv_rect: [0, 0, 0.125, 0.125] as [
            number,
            number,
            number,
            number,
          ],
          width: point.width,
        })),
      },
      thumbnailSize: 64,
    });
    const comparison = createLatentMapThumbnailRendererComparison(plan);

    expect(comparison.spriteBaseline.sourceImageRequests).toBe(8);
    expect(comparison.instancedAtlas.sourceImageRequests).toBe(1);
    expect(comparison.instancedAtlas.gpuTextures).toBe(1);
    expect(comparison.recommendation).toBe("use-instanced-generated-atlas");
  });

  it("summarizes runtime diagnostics from the render plan and renderer info", () => {
    const renderState = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: null,
    });
    const thumbnailPlan = createLatentMapThumbnailRenderPlan({
      points: renderState,
      thumbnailSize: 64,
    });

    expect(
      createLatentMapRuntimeSnapshot({
        loadedThumbnailCount: 5,
        performanceInfo: {
          averageFrameMs: 17.372,
          averageRenderMs: 3.243,
          estimatedFps: 57.564,
          lastRenderMs: 2.194,
        },
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
      averageFrameMs: 17.37,
      averageRenderMs: 3.24,
      atlasPageCount: 1,
      drawCalls: 3,
      estimatedFps: 57.6,
      geometryCount: 2,
      lastRenderMs: 2.19,
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
