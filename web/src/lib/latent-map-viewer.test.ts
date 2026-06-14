import { describe, expect, it } from "vitest";

import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  createLatentMapRuntimeSnapshot,
  createLatentMapThumbnailAtlasPages,
  createLatentMapThumbnailRendererComparison,
  createLatentMapThumbnailRenderPlan,
  createLatentMapNeighborSet,
  createLatentMapOppositeSet,
  createLatentMapPointLayerPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  fitLatentMapPoints,
  getLatentMapAvailableTextureDetails,
  getLatentMapFallbackThumbnailAtlas,
  getLatentMapThumbnailStateScaleMultiplier,
  getNextLatentMapTextureDetail,
  getNextLatentMapThumbnailSize,
  getLatentMapRenderableAtlasPages,
  getLatentMapThumbnailScreenLongSide,
  getLatentMapThumbnailAtlasForSize,
  getNextLatentMapSelection,
  isLatentMapThumbnailFocusActive,
  resolveLatentMapTextureDetail,
  selectLatentMapAtlasPagesForViewport,
  selectLatentMapTextureDetail,
  shouldUseLatentMapAutoFallbackAtlas,
  type LatentMapGeneratedThumbnailAtlas,
  type LatentMapRenderablePoint,
} from "@/lib/latent-map-viewer";

function createRenderablePoints(count: number): LatentMapRenderablePoint[] {
  return Array.from({ length: count }, (_, index) => ({
    image_id: `img_${String(index).padStart(2, "0")}`,
    x: index,
    y: 0,
    fitted_x: index * 0.25,
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
}

function createGeneratedAtlas({
  atlasSize = 256,
  points,
  tileSize,
}: {
  atlasSize?: number;
  points: LatentMapRenderablePoint[];
  tileSize: number;
}): LatentMapGeneratedThumbnailAtlas {
  const columns = Math.max(1, Math.floor(atlasSize / tileSize));
  const pageCapacity = columns * columns;
  const pageCount = Math.ceil(points.length / pageCapacity);

  return {
    schema_version: 1,
    asset_kind: "latent-map-thumbnail-atlas",
    run_id: "run-1",
    tile_size: tileSize,
    atlas_size: atlasSize,
    image_count: points.length,
    page_count: pageCount,
    pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
      height: atlasSize,
      index: pageIndex,
      path: `/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F${tileSize}px%2Fpage-${String(pageIndex).padStart(3, "0")}.png`,
      width: atlasSize,
    })),
    items: points.map((point, index) => {
      const pageIndex = Math.floor(index / pageCapacity);
      const pageOffset = index % pageCapacity;
      const column = pageOffset % columns;
      const row = Math.floor(pageOffset / columns);

      return {
        height: point.height,
        image_id: point.image_id,
        page_index: pageIndex,
        page_path: `viewer/atlases/${tileSize}px/page-${String(pageIndex).padStart(3, "0")}.png`,
        source_thumbnail_path: point.thumbnail_path,
        tile_rect: [
          column * tileSize,
          row * tileSize,
          tileSize,
          tileSize,
        ] as [number, number, number, number],
        uv_rect: [
          column / columns,
          row / columns,
          1 / columns,
          1 / columns,
        ] as [number, number, number, number],
        width: point.width,
      };
    }),
  };
}

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

  it("limits FAISS neighbors to the selected count", () => {
    expect(
      [
        ...createLatentMapNeighborSet(
          latentMapFixture,
          "img_saffron",
          {},
          2,
        ),
      ],
    ).toEqual(["img_amber", "img_vermilion"]);
  });

  it("selects FAISS opposites from the selected point", () => {
    const oppositeFixture = structuredClone(latentMapFixture);
    const selectedPoint = oppositeFixture.points.find(
      (point) => point.image_id === "img_saffron",
    );

    if (!selectedPoint) {
      throw new Error("Fixture is missing selected point.");
    }

    selectedPoint.opposites = [
      { image_id: "img_teal", score: -0.12 },
      { image_id: "img_lime", score: -0.08 },
    ];

    expect(
      [...createLatentMapOppositeSet(oppositeFixture, "img_saffron")],
    ).toEqual(["img_teal", "img_lime"]);
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

  it("marks opposite points when FAISS focus is opposite", () => {
    const oppositeFixture = structuredClone(latentMapFixture);
    const selectedPoint = oppositeFixture.points.find(
      (point) => point.image_id === "img_saffron",
    );

    if (!selectedPoint) {
      throw new Error("Fixture is missing selected point.");
    }

    selectedPoint.opposites = [{ image_id: "img_teal", score: -0.12 }];
    const states = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: oppositeFixture,
      faissRelationMode: "opposite",
      selectedImageId: "img_saffron",
    });
    const stateById = Object.fromEntries(
      states.map((point) => [point.image_id, point.point_state]),
    );

    expect(stateById.img_saffron).toBe("selected");
    expect(stateById.img_teal).toBe("opposite");
    expect(stateById.img_amber).toBe("cluster");
  });

  it("renders group focus with dark-pink background points and FAISS precedence", () => {
    const states = createLatentMapRenderState({
      clusterColorsEnabled: true,
      clusterFilter: "1",
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });
    const stateById = Object.fromEntries(
      states.map((point) => [point.image_id, point.point_state]),
    );
    const colorById = Object.fromEntries(
      states.map((point) => [point.image_id, point.color]),
    );
    const thumbnailPlan = createLatentMapThumbnailRenderPlan({
      points: states,
      thumbnailSize: 64,
    });
    const pointLayer = createLatentMapPointLayerPlan({
      points: states,
      renderMode: "thumbnails",
      thumbnailPlan,
    });

    expect(stateById.img_saffron).toBe("selected");
    expect(stateById.img_cobalt).toBe("neighbor");
    expect(stateById.img_teal).toBe("group");
    expect(stateById.img_glass).toBe("group");
    expect(stateById.img_moss).toBe("group-background");
    expect(colorById.img_moss).toEqual([190, 45, 112]);
    expect(
      thumbnailPlan.thumbnailPoints.map((point) => point.image_id).sort(),
    ).toEqual([
      "img_amber",
      "img_cobalt",
      "img_glass",
      "img_saffron",
      "img_teal",
      "img_vermilion",
    ]);
    expect(pointLayer.pointSize).toBe(3);
    expect(pointLayer.points.map((point) => point.image_id).sort()).toEqual([
      "img_lime",
      "img_moss",
    ]);
    expect(new Set(pointLayer.points.map((point) => point.point_state))).toEqual(
      new Set(["group-background"]),
    );
  });

  it("keeps selected and FAISS focus thumbnails at the base display size", () => {
    expect(getLatentMapThumbnailStateScaleMultiplier("base")).toBe(1);
    expect(getLatentMapThumbnailStateScaleMultiplier("cluster")).toBe(1);
    expect(getLatentMapThumbnailStateScaleMultiplier("selected")).toBe(1);
    expect(getLatentMapThumbnailStateScaleMultiplier("neighbor")).toBe(1);
    expect(getLatentMapThumbnailStateScaleMultiplier("opposite")).toBe(1);
  });

  it("cycles canvas display control options for keyboard shortcuts", () => {
    expect(
      getNextLatentMapThumbnailSize({
        currentSize: 64,
        direction: "next",
      }),
    ).toBe(96);
    expect(
      getNextLatentMapThumbnailSize({
        currentSize: 32,
        direction: "previous",
      }),
    ).toBe(96);
    expect(
      getNextLatentMapTextureDetail({
        availableDetails: [128, 32, 96, 64],
        currentDetail: "auto",
        direction: "next",
      }),
    ).toBe(32);
    expect(
      getNextLatentMapTextureDetail({
        availableDetails: [128, 32, 96, 64],
        currentDetail: 128,
        direction: "next",
      }),
    ).toBe("auto");
    expect(
      getNextLatentMapTextureDetail({
        availableDetails: [128, 32, 96, 64],
        currentDetail: "auto",
        direction: "previous",
      }),
    ).toBe(128);
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
    expect(focusedPointLayer.points.map((point) => point.image_id).sort()).toEqual([
      "img_glass",
      "img_lime",
      "img_moss",
      "img_teal",
    ]);
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
    expect(plan.hoverPreviewSize).toBe(512);
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
    expect(plan.displayThumbnailSize).toBe(32);
    expect(plan.resolvedTextureDetail).toBe(64);
    expect(plan.textureSources).toEqual([
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F64px%2Fpage-000.png",
    ]);
    expect(plan.thumbnailPoints).toHaveLength(8);
  });

  it("selects viewport atlas pages while keeping focus pages pinned", () => {
    const points = createRenderablePoints(10);
    const atlas = createGeneratedAtlas({
      points,
      tileSize: 128,
    });
    const renderPlan = createLatentMapThumbnailRenderPlan({
      points,
      thumbnailAtlas: atlas,
      thumbnailSize: 96,
    });

    points[9].point_state = "selected";

    const pinnedOnlyPages = selectLatentMapAtlasPagesForViewport({
      pageBudget: 1,
      pages: renderPlan.atlasPages,
      thumbnailSize: 96,
      viewport: {
        height: 800,
        offsetX: 0,
        offsetY: 0,
        width: 1200,
        zoom: 8,
      },
    });
    const visibleAndPinnedPages = selectLatentMapAtlasPagesForViewport({
      pageBudget: 2,
      pages: renderPlan.atlasPages,
      thumbnailSize: 96,
      viewport: {
        height: 800,
        offsetX: 0,
        offsetY: 0,
        width: 1200,
        zoom: 8,
      },
    });

    expect(pinnedOnlyPages.map((page) => page.index)).toEqual([2]);
    expect(visibleAndPinnedPages.map((page) => page.index)).toEqual([0, 2]);
    expect(renderPlan.atlasPages[0].bounds).toEqual({
      maxX: 0.75,
      maxY: 0,
      minX: 0,
      minY: 0,
    });
    expect(renderPlan.atlasPages[0].center).toEqual({
      x: 0.375,
      y: 0,
    });
  });

  it("uses atlas page bounds to avoid item scans for offscreen pages", () => {
    const points = createRenderablePoints(4);
    const atlasPages = createLatentMapThumbnailAtlasPages({
      atlasSize: 256,
      points,
      tileSize: 128,
    });
    const selectedPages = selectLatentMapAtlasPagesForViewport({
      pageBudget: 1,
      pages: [
        {
          ...atlasPages[0],
          bounds: {
            maxX: 100,
            maxY: 100,
            minX: 99,
            minY: 99,
          },
        },
      ],
      thumbnailSize: 96,
      viewport: {
        height: 800,
        offsetX: 0,
        offsetY: 0,
        width: 1200,
        zoom: 8,
      },
    });

    expect(selectedPages).toEqual([]);
  });

  it("uses a low-detail fallback while caching high-detail atlas pages", () => {
    const points = createRenderablePoints(10);
    const highDetailAtlas = createGeneratedAtlas({
      points,
      tileSize: 128,
    });
    const fallbackAtlas = createGeneratedAtlas({
      points,
      tileSize: 64,
    });
    const plan = createLatentMapThumbnailRenderPlan({
      atlasPageBudget: 1,
      fallbackThumbnailAtlas: fallbackAtlas,
      points,
      thumbnailAtlas: highDetailAtlas,
      thumbnailSize: 96,
      viewport: {
        height: 800,
        offsetX: 0,
        offsetY: 0,
        width: 1200,
        zoom: 8,
      },
    });

    expect(plan.atlasPageCacheActive).toBe(true);
    expect(plan.fallbackResolvedTextureDetail).toBe(64);
    expect(plan.fallbackAtlasPages).toHaveLength(1);
    expect(plan.atlasPages.map((page) => page.index)).toEqual([0]);
    expect(plan.totalAtlasPageCount).toBe(3);
    expect(getLatentMapRenderableAtlasPages(plan)).toHaveLength(2);
    expect(plan.estimatedAtlasTextureBytes).toBe(2 * 256 * 256 * 4);
    expect(plan.textureSources).toEqual([
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F64px%2Fpage-000.png",
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F128px%2Fpage-000.png",
    ]);
  });

  it("does not mix fallback atlas pages into explicit texture detail selections", () => {
    const points = createRenderablePoints(10);
    const highDetailAtlas = createGeneratedAtlas({
      points,
      tileSize: 128,
    });
    const fallbackAtlas = createGeneratedAtlas({
      points,
      tileSize: 64,
    });
    const plan = createLatentMapThumbnailRenderPlan({
      atlasPageBudget: 1,
      fallbackThumbnailAtlas: fallbackAtlas,
      points,
      textureDetail: 128,
      thumbnailAtlas: highDetailAtlas,
      thumbnailSize: 96,
      viewport: {
        height: 800,
        offsetX: 0,
        offsetY: 0,
        width: 1200,
        zoom: 8,
      },
    });

    expect(plan.atlasPageCacheActive).toBe(false);
    expect(plan.fallbackResolvedTextureDetail).toBeNull();
    expect(plan.fallbackAtlasPages).toEqual([]);
    expect(plan.atlasPages).toHaveLength(3);
    expect(plan.atlasPages.every((page) => page.tileSize === 128)).toBe(true);
    expect(plan.textureSources).toEqual([
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F128px%2Fpage-000.png",
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F128px%2Fpage-001.png",
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F128px%2Fpage-002.png",
    ]);
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

  it("models atlas page counts for 32, 64, 96, and 128 pixel map thumbnails", () => {
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
    expect(createLatentMapThumbnailAtlasPages({ points, tileSize: 128 })).toHaveLength(13);
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
    const at128 = createLatentMapThumbnailAtlasPages({
      points,
      tileSize: 128,
    });
    const atlasBytes = 2048 * 2048 * 4;

    expect(at32.atlasPages).toHaveLength(3);
    expect(at32.estimatedAtlasTextureBytes).toBe(3 * atlasBytes);
    expect(at64.atlasPages).toHaveLength(10);
    expect(at64.estimatedAtlasTextureBytes).toBe(10 * atlasBytes);
    expect(at96.atlasPages).toHaveLength(23);
    expect(at96.estimatedAtlasTextureBytes).toBe(23 * atlasBytes);
    expect(at128).toHaveLength(40);
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

  it("selects a generated thumbnail atlas matching the requested size", () => {
    expect(
      getLatentMapThumbnailAtlasForSize(
        {
          ...latentMapFixture,
          thumbnail_atlases: [
            {
              schema_version: 1,
              asset_kind: "latent-map-thumbnail-atlas",
              run_id: "run-1",
              tile_size: 32,
              atlas_size: 512,
              image_count: 0,
              page_count: 0,
              pages: [],
              items: [],
            },
            {
              schema_version: 1,
              asset_kind: "latent-map-thumbnail-atlas",
              run_id: "run-1",
              tile_size: 96,
              atlas_size: 512,
              image_count: 0,
              page_count: 0,
              pages: [],
              items: [],
            },
          ],
        },
        96,
      )?.tile_size,
    ).toBe(96);
  });

  it("exposes generated texture detail options from the run manifest", () => {
    expect(
      getLatentMapAvailableTextureDetails({
        ...latentMapFixture,
        thumbnail_atlas: {
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: 64,
          atlas_size: 512,
          image_count: 0,
          page_count: 0,
          pages: [],
          items: [],
        },
        thumbnail_atlases: [
          {
            schema_version: 1,
            asset_kind: "latent-map-thumbnail-atlas",
            run_id: "run-1",
            tile_size: 96,
            atlas_size: 512,
            image_count: 0,
            page_count: 0,
            pages: [],
            items: [],
          },
          {
            schema_version: 1,
            asset_kind: "latent-map-thumbnail-atlas",
            run_id: "run-1",
            tile_size: 128,
            atlas_size: 512,
            image_count: 0,
            page_count: 0,
            pages: [],
            items: [],
          },
          {
            schema_version: 1,
            asset_kind: "latent-map-thumbnail-atlas",
            run_id: "run-1",
            tile_size: 32,
            atlas_size: 512,
            image_count: 0,
            page_count: 0,
            pages: [],
            items: [],
          },
        ],
      }),
    ).toEqual([32, 64, 96, 128]);
  });

  it("chooses the sharpest lower fallback atlas within the page budget", () => {
    expect(
      getLatentMapFallbackThumbnailAtlas({
        data: {
          ...latentMapFixture,
          thumbnail_atlases: [
            {
              schema_version: 1,
              asset_kind: "latent-map-thumbnail-atlas",
              run_id: "run-1",
              tile_size: 32,
              atlas_size: 2048,
              image_count: 0,
              page_count: 1,
              pages: [],
              items: [],
            },
            {
              schema_version: 1,
              asset_kind: "latent-map-thumbnail-atlas",
              run_id: "run-1",
              tile_size: 64,
              atlas_size: 2048,
              image_count: 0,
              page_count: 4,
              pages: [],
              items: [],
            },
            {
              schema_version: 1,
              asset_kind: "latent-map-thumbnail-atlas",
              run_id: "run-1",
              tile_size: 96,
              atlas_size: 2048,
              image_count: 0,
              page_count: 8,
              pages: [],
              items: [],
            },
          ],
        },
        resolvedTextureDetail: 128,
      })?.tile_size,
    ).toBe(64);
  });

  it("uses the auto fallback atlas only below the sharpest available detail", () => {
    const availableDetails = [32, 64, 96, 128, 256];

    expect(
      shouldUseLatentMapAutoFallbackAtlas({
        availableDetails,
        resolvedTextureDetail: 128,
        textureDetail: "auto",
      }),
    ).toBe(true);
    expect(
      shouldUseLatentMapAutoFallbackAtlas({
        availableDetails,
        resolvedTextureDetail: 256,
        textureDetail: "auto",
      }),
    ).toBe(false);
    expect(
      shouldUseLatentMapAutoFallbackAtlas({
        availableDetails,
        resolvedTextureDetail: 128,
        textureDetail: 128,
      }),
    ).toBe(false);
  });

  it("resolves automatic texture detail from screen size but preserves manual detail", () => {
    const data = {
      ...latentMapFixture,
      thumbnail_atlases: [
        {
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: 32,
          atlas_size: 512,
          image_count: 0,
          page_count: 0,
          pages: [],
          items: [],
        },
        {
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: 64,
          atlas_size: 512,
          image_count: 0,
          page_count: 0,
          pages: [],
          items: [],
        },
        {
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: 96,
          atlas_size: 512,
          image_count: 0,
          page_count: 0,
          pages: [],
          items: [],
        },
        {
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: 128,
          atlas_size: 512,
          image_count: 0,
          page_count: 0,
          pages: [],
          items: [],
        },
      ],
    };

    expect(
      resolveLatentMapTextureDetail({
        data,
        displayThumbnailScreenLongSide: 34,
        textureDetail: "auto",
        thumbnailSize: 64,
      }),
    ).toBe(32);
    expect(
      resolveLatentMapTextureDetail({
        data,
        displayThumbnailScreenLongSide: 118,
        textureDetail: "auto",
        thumbnailSize: 64,
      }),
    ).toBe(128);
    expect(
      resolveLatentMapTextureDetail({
        data,
        textureDetail: 96,
        thumbnailSize: 32,
      }),
    ).toBe(96);
  });

  it("selects texture detail from arbitrary atlas ladders with hysteresis", () => {
    const availableDetails = [128, 32, 96, 64];

    expect(
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide: 34,
      }),
    ).toBe(32);
    expect(
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide: 118,
      }),
    ).toBe(128);
    expect(
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide: 82,
        previousResolvedDetail: 64,
      }),
    ).toBe(64);
    expect(
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide: 86,
        previousResolvedDetail: 64,
      }),
    ).toBe(96);
    expect(
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide: 109,
        previousResolvedDetail: 128,
      }),
    ).toBe(128);
    expect(
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide: 104,
        previousResolvedDetail: 128,
      }),
    ).toBe(96);
  });

  it("uses the same thumbnail screen-size cap as the WebGL runtime", () => {
    expect(
      getLatentMapThumbnailScreenLongSide({
        thumbnailSize: 64,
        viewportHeight: 900,
        zoom: 20,
      }),
    ).toBe(128);
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
        neighborhoodPreviewTextureInfo: {
          budget: 24,
          cachedTextureCount: 2,
          estimatedTextureBytes: 8_388_608,
          failedTextureCount: 1,
          loadingTextureCount: 3,
          requestedTextureCount: 6,
        },
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
      neighborhoodPreviewFailedTextureCount: 1,
      neighborhoodPreviewLoadingTextureCount: 3,
      neighborhoodPreviewRequestedTextureCount: 6,
      neighborhoodPreviewTextureBudget: 24,
      neighborhoodPreviewTextureBytes: 8388608,
      neighborhoodPreviewTextureCount: 2,
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
