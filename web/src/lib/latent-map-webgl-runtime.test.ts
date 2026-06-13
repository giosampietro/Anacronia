import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { createLatentMapRuntimeTweenController } from "@/lib/latent-map-runtime-tween";
import {
  createLatentMapPointTweenItem,
  createLatentMapPointTweenItems,
  getLatentMapNeighborhoodPreviewMarkerOpacity,
  getLatentMapNeighborhoodPreviewMeshTransform,
  getLatentMapNeighborhoodPreviewRenderOrder,
  getLatentMapThumbnailWorldScale,
  LATENT_MAP_ATLAS_FRAGMENT_SHADER,
  LATENT_MAP_ATLAS_VERTEX_SHADER,
  LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE,
  LATENT_MAP_NEIGHBORHOOD_PREVIEW_FRAGMENT_SHADER,
  LATENT_MAP_NEIGHBORHOOD_PREVIEW_VERTEX_SHADER,
  type LatentMapViewState,
  writeLatentMapAtlasInstanceAttributesFromTween,
  writeLatentMapPointGeometryFromTween,
  writeLatentMapPointLayerGeometryFromTween,
} from "@/lib/latent-map-webgl-runtime";
import {
  createLatentMapPointLayerPlan,
  createLatentMapThumbnailRenderPlan,
  type LatentMapRenderablePoint,
  type LatentMapThumbnailAtlasPage,
} from "@/lib/latent-map-viewer";
import { createLatentMapWheelZoomView } from "@/lib/latent-map-view-controls";

function createRenderablePoint(
  overrides: Partial<LatentMapRenderablePoint> = {},
): LatentMapRenderablePoint {
  return {
    image_id: "img_test",
    x: 0,
    y: 0,
    fitted_x: 0,
    fitted_y: 0,
    cluster_id: 0,
    thumbnail_path: "thumb.jpg",
    source_path: "",
    relative_path: "thumb.jpg",
    width: 1600,
    height: 1000,
    neighbors: [],
    color: [150, 156, 166],
    point_state: "base",
    ...overrides,
  };
}

function toScreenLongSide({
  scale,
  viewportHeight,
  zoom,
}: {
  scale: [number, number];
  viewportHeight: number;
  zoom: number;
}) {
  return Math.max(scale[0], scale[1]) * ((viewportHeight * zoom) / 2);
}

function worldTransformToScreenBounds({
  height,
  transform,
  view,
  width,
}: {
  height: number;
  transform: { height: number; width: number; x: number; y: number };
  view: LatentMapViewState;
  width: number;
}) {
  const aspect = width / Math.max(height, 1);
  const pixelsPerWorldUnit = (height * view.zoom) / 2;
  const centerX =
    ((transform.x - view.offsetX) * view.zoom / aspect + 1) * width / 2;
  const centerY = (1 - (transform.y - view.offsetY) * view.zoom) * height / 2;
  const screenWidth = transform.width * pixelsPerWorldUnit;
  const screenHeight = transform.height * pixelsPerWorldUnit;

  return {
    bottom: centerY + screenHeight / 2,
    centerX,
    centerY,
    left: centerX - screenWidth / 2,
    right: centerX + screenWidth / 2,
    top: centerY - screenHeight / 2,
  };
}

function expectArrayCloseTo(actual: Float32Array, expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value);
  });
}

function createAtlasPage(
  points: LatentMapRenderablePoint[],
): LatentMapThumbnailAtlasPage {
  return {
    atlasSize: 256,
    columns: points.length,
    index: 0,
    items: points.map((point, index) => ({
      column: index,
      point,
      row: 0,
      uvRect: [index / points.length, 0, 1 / points.length, 1],
    })),
    renderLayer: "primary",
    rows: 1,
    tileSize: 64,
  };
}

describe("latent map WebGL runtime math", () => {
  it("converts custom atlas shader output through Three color management", () => {
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "gl_FragColor = vec4(color, texel.a * vOpacity);",
    );
    expect(LATENT_MAP_ATLAS_VERTEX_SHADER).toContain(
      "attribute float instanceOpacity;",
    );
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "#include <colorspace_fragment>",
    );
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "float oppositeMarker",
    );
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "oppositeMarkerScreenSize",
    );
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain("markerSquare");
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "vec3(1.0, 0.58, 0.66)",
    );
    expect(LATENT_MAP_NEIGHBORHOOD_PREVIEW_FRAGMENT_SHADER).toContain(
      "uniform vec2 markerUvSize;",
    );
    expect(LATENT_MAP_NEIGHBORHOOD_PREVIEW_FRAGMENT_SHADER).toContain(
      "uniform float oppositeMarkerOpacity;",
    );
    expect(LATENT_MAP_NEIGHBORHOOD_PREVIEW_FRAGMENT_SHADER).toContain(
      "markerSquare",
    );
    expect(LATENT_MAP_NEIGHBORHOOD_PREVIEW_FRAGMENT_SHADER).toContain(
      "vec3(1.0, 0.58, 0.66)",
    );
    expect(LATENT_MAP_NEIGHBORHOOD_PREVIEW_FRAGMENT_SHADER).toContain(
      "#include <colorspace_fragment>",
    );
    expect(LATENT_MAP_NEIGHBORHOOD_PREVIEW_VERTEX_SHADER).toContain(
      "vLocalUv = uv;",
    );
  });

  it("preserves original thumbnail aspect ratio", () => {
    const wideScale = getLatentMapThumbnailWorldScale({
      point: createRenderablePoint({ width: 1600, height: 1000 }),
      thumbnailSize: 64,
      viewportHeight: 900,
      zoom: 1,
    });
    const portraitScale = getLatentMapThumbnailWorldScale({
      point: createRenderablePoint({ width: 900, height: 1200 }),
      thumbnailSize: 64,
      viewportHeight: 900,
      zoom: 1,
    });

    expect(wideScale[0] / wideScale[1]).toBeCloseTo(1.6);
    expect(portraitScale[0] / portraitScale[1]).toBeCloseTo(0.75);
  });

  it("caps thumbnail screen growth when zooming in", () => {
    const thumbnailSize = 64;
    const viewportHeight = 900;
    const zoom = 7;
    const scale = getLatentMapThumbnailWorldScale({
      point: createRenderablePoint(),
      thumbnailSize,
      viewportHeight,
      zoom,
    });

    expect(
      toScreenLongSide({
        scale,
        viewportHeight,
        zoom,
      }),
    ).toBeLessThanOrEqual(
      thumbnailSize * LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE,
    );
  });

  it("writes point tween buffers into Three geometry attributes", () => {
    const controller = createLatentMapRuntimeTweenController([
      createLatentMapPointTweenItem({
        point: createRenderablePoint({
          image_id: "img_a",
          color: [255, 0, 0],
          fitted_x: 1,
          fitted_y: 2,
          point_state: "neighbor",
        }),
        pointSize: 3,
        visualTheme: "dark",
      }),
      createLatentMapPointTweenItem({
        point: createRenderablePoint({
          image_id: "img_b",
          color: [0, 255, 0],
          fitted_x: 3,
          fitted_y: 4,
          point_state: "selected",
        }),
        pointSize: 3,
        visualTheme: "dark",
      }),
    ]);
    const geometry = new THREE.BufferGeometry();

    writeLatentMapPointGeometryFromTween({ geometry, tweenController: controller });

    const positions = geometry.getAttribute("position").array as Float32Array;
    const colors = geometry.getAttribute("color").array as Float32Array;

    expectArrayCloseTo(positions, [1, 2, 0.24, 3, 4, 0.32]);
    expectArrayCloseTo(colors.slice(0, 3), [1, 0, 0]);
    expectArrayCloseTo(colors.slice(3, 6), [
      250 / 255,
      250 / 255,
      246 / 255,
    ]);

    const result = controller.retarget(
      [
        {
          imageId: "img_b",
          values: {
            b: 1,
            g: 0,
            r: 0,
            x: 8,
            y: 9,
            z: 0.24,
          },
        },
      ],
      { durationMs: 0, now: 0 },
    );

    writeLatentMapPointGeometryFromTween({
      dirtyRange: result.dirtyRange,
      geometry,
      tweenController: controller,
    });

    expectArrayCloseTo(positions, [1, 2, 0.24, 8, 9, 0.24]);
    expectArrayCloseTo(colors.slice(0, 3), [1, 0, 0]);
    expectArrayCloseTo(colors.slice(3, 6), [0, 0, 1]);
  });

  it("writes tween buffers into atlas instance attributes", () => {
    const pointA = createRenderablePoint({
      image_id: "img_a",
      color: [255, 0, 0],
      fitted_x: 1,
      fitted_y: 2,
      point_state: "neighbor",
      width: 1600,
      height: 800,
    });
    const pointB = createRenderablePoint({
      image_id: "img_b",
      color: [0, 255, 0],
      fitted_x: 3,
      fitted_y: 4,
      point_state: "selected",
      width: 800,
      height: 1600,
    });
    const controller = createLatentMapRuntimeTweenController([
      createLatentMapPointTweenItem({
        point: pointA,
        pointSize: 3,
        visualTheme: "dark",
      }),
      createLatentMapPointTweenItem({
        point: pointB,
        pointSize: 3,
        visualTheme: "dark",
      }),
    ]);
    const geometry = new THREE.InstancedBufferGeometry();
    const page = createAtlasPage([pointA, pointB]);

    writeLatentMapAtlasInstanceAttributesFromTween({
      geometry,
      page,
      thumbnailSize: 64,
      tweenController: controller,
      view: { offsetX: 0, offsetY: 0, zoom: 1 },
      viewportHeight: 900,
      viewportWidth: 1600,
    });

    const positions = geometry.getAttribute("instancePosition")
      .array as Float32Array;
    const scales = geometry.getAttribute("instanceScale")
      .array as Float32Array;
    const states = geometry.getAttribute("instanceState")
      .array as Float32Array;
    const opacities = geometry.getAttribute("instanceOpacity")
      .array as Float32Array;

    expectArrayCloseTo(positions, [1, 2, 0.26, 3, 4, 0.34]);
    expectArrayCloseTo(scales, [0.13, 0.065, 0.065, 0.13]);
    expectArrayCloseTo(states, [1, 2]);
    expectArrayCloseTo(opacities, [1, 1]);

    const result = controller.retarget(
      [
        {
          imageId: "img_b",
          values: {
            alpha: 0.25,
            size: 2,
            state: 0,
            x: 8,
            y: 9,
            z: 0.4,
          },
        },
      ],
      { durationMs: 0, now: 0 },
    );

    writeLatentMapAtlasInstanceAttributesFromTween({
      dirtyRange: result.dirtyRange,
      geometry,
      page,
      thumbnailSize: 64,
      tweenController: controller,
      view: { offsetX: 0, offsetY: 0, zoom: 1 },
      viewportHeight: 900,
      viewportWidth: 1600,
    });

    expectArrayCloseTo(positions, [1, 2, 0.26, 8, 9, 0.42]);
    expectArrayCloseTo(scales, [0.13, 0.065, 0.13, 0.26]);
    expectArrayCloseTo(states, [1, 0]);
    expectArrayCloseTo(opacities, [1, 0.25]);
  });

  it("falls back safely when an atlas item is missing from tween state", () => {
    const knownPoint = createRenderablePoint({
      image_id: "img_known",
      fitted_x: 1,
      fitted_y: 2,
      point_state: "neighbor",
    });
    const missingPoint = createRenderablePoint({
      image_id: "img_missing",
      fitted_x: 5,
      fitted_y: 6,
      point_state: "selected",
    });
    const controller = createLatentMapRuntimeTweenController([
      createLatentMapPointTweenItem({
        point: knownPoint,
        pointSize: 3,
        visualTheme: "dark",
      }),
    ]);
    const geometry = new THREE.InstancedBufferGeometry();

    expect(() =>
      writeLatentMapAtlasInstanceAttributesFromTween({
        geometry,
        page: createAtlasPage([knownPoint, missingPoint]),
        thumbnailSize: 64,
        tweenController: controller,
        view: { offsetX: 0, offsetY: 0, zoom: 1 },
        viewportHeight: 900,
        viewportWidth: 1600,
      }),
    ).not.toThrow();

    const positions = geometry.getAttribute("instancePosition")
      .array as Float32Array;
    const states = geometry.getAttribute("instanceState")
      .array as Float32Array;

    expectArrayCloseTo(positions, [1, 2, 0.26, 5, 6, 0.34]);
    expectArrayCloseTo(states, [1, 2]);
  });

  it("keeps active thumbnail ids in the tween source when the point layer filters them", () => {
    const selectedPoint = createRenderablePoint({
      image_id: "img_selected",
      point_state: "selected",
    });
    const neighborPoint = createRenderablePoint({
      image_id: "img_neighbor",
      point_state: "neighbor",
    });
    const backgroundPoint = createRenderablePoint({
      image_id: "img_background",
      point_state: "base",
    });
    const points = [selectedPoint, neighborPoint, backgroundPoint];
    const thumbnailPlan = createLatentMapThumbnailRenderPlan({
      points,
      thumbnailSize: 64,
    });
    const pointLayer = createLatentMapPointLayerPlan({
      points,
      renderMode: "thumbnails",
      thumbnailPlan,
    });
    const tweenItems = createLatentMapPointTweenItems({
      pointSize: pointLayer.pointSize,
      points,
      visualTheme: "dark",
    });

    expect(pointLayer.points.map((point) => point.image_id)).toEqual([
      "img_background",
    ]);
    expect(tweenItems.map((item) => item.imageId)).toEqual([
      "img_selected",
      "img_neighbor",
      "img_background",
    ]);
  });

  it("draws only filtered point-layer points while atlas tween state keeps active thumbnails", () => {
    const selectedPoint = createRenderablePoint({
      fitted_x: 1,
      fitted_y: 1,
      image_id: "img_selected",
      point_state: "selected",
    });
    const neighborPoint = createRenderablePoint({
      fitted_x: 2,
      fitted_y: 2,
      image_id: "img_neighbor",
      point_state: "neighbor",
    });
    const backgroundPoint = createRenderablePoint({
      fitted_x: 3,
      fitted_y: 3,
      image_id: "img_background",
      point_state: "base",
    });
    const points = [selectedPoint, neighborPoint, backgroundPoint];
    const controller = createLatentMapRuntimeTweenController(
      createLatentMapPointTweenItems({
        pointSize: 3,
        points,
        visualTheme: "dark",
      }),
    );
    const geometry = new THREE.BufferGeometry();

    writeLatentMapPointLayerGeometryFromTween({
      geometry,
      points: [backgroundPoint],
      tweenController: controller,
    });

    const positions = geometry.getAttribute("position").array as Float32Array;

    expect(controller.getIndex("img_selected")).toBe(0);
    expect(controller.getIndex("img_neighbor")).toBe(1);
    expectArrayCloseTo(positions, [3, 3, 0.16]);
  });

  it("positions neighborhood preview meshes from tween values", () => {
    const point = createRenderablePoint({
      fitted_x: 1,
      fitted_y: 2,
      image_id: "img_preview",
      point_state: "neighbor",
      width: 1600,
      height: 800,
    });
    const controller = createLatentMapRuntimeTweenController([
      createLatentMapPointTweenItem({
        point,
        pointSize: 3,
        visualTheme: "dark",
      }),
    ]);

    controller.retarget(
      [
        {
          imageId: "img_preview",
          values: {
            alpha: 0.5,
            size: 2,
            x: 6,
            y: 7,
            z: 0.34,
          },
        },
      ],
      { durationMs: 0, now: 0 },
    );

    const transform = getLatentMapNeighborhoodPreviewMeshTransform({
      point,
      thumbnailSize: 64,
      tweenController: controller,
      view: { offsetX: 0, offsetY: 0, zoom: 1 },
      viewportHeight: 900,
      viewportWidth: 1600,
    });

    expect(transform.opacity).toBe(0.5);
    expect(transform.x).toBe(6);
    expect(transform.y).toBe(7);
    expect(transform.width).toBeCloseTo(0.26);
    expect(transform.height).toBeCloseTo(0.13);
    expect(transform.z).toBeCloseTo(0.42);
  });

  it("keeps packed neighborhood grid visible gaps constant while zooming", () => {
    const view = { offsetX: 0, offsetY: 0, zoom: 2 };
    const viewport = { height: 900, width: 1600 };
    const firstPoint = createRenderablePoint({
      image_id: "img_grid_a",
      point_state: "neighbor",
      tween_screen_base_offset_x: 0,
      tween_screen_base_offset_y: 0,
      tween_screen_base_zoom: 1,
      tween_screen_cell_gap: 32,
      tween_screen_cell_size: 120,
      tween_screen_column: 0,
      tween_screen_grid_x: 100,
      tween_screen_grid_y: 80,
      tween_screen_height: 120,
      tween_screen_kind: "grid",
      tween_screen_row: 0,
      tween_screen_width: 60,
      tween_screen_x: 130,
      tween_screen_y: 140,
    });
    const secondPoint = createRenderablePoint({
      image_id: "img_grid_b",
      point_state: "neighbor",
      tween_screen_base_offset_x: 0,
      tween_screen_base_offset_y: 0,
      tween_screen_base_zoom: 1,
      tween_screen_cell_gap: 32,
      tween_screen_cell_size: 120,
      tween_screen_column: 1,
      tween_screen_grid_x: 100,
      tween_screen_grid_y: 80,
      tween_screen_height: 80,
      tween_screen_kind: "grid",
      tween_screen_row: 0,
      tween_screen_width: 120,
      tween_screen_x: 252,
      tween_screen_y: 140,
    });
    const thirdPoint = createRenderablePoint({
      image_id: "img_grid_c",
      point_state: "neighbor",
      tween_screen_base_offset_x: 0,
      tween_screen_base_offset_y: 0,
      tween_screen_base_zoom: 1,
      tween_screen_cell_gap: 32,
      tween_screen_cell_size: 120,
      tween_screen_column: 0,
      tween_screen_grid_x: 100,
      tween_screen_grid_y: 80,
      tween_screen_height: 120,
      tween_screen_kind: "grid",
      tween_screen_row: 1,
      tween_screen_width: 80,
      tween_screen_x: 140,
      tween_screen_y: 292,
    });
    const controller = createLatentMapRuntimeTweenController(
      [firstPoint, secondPoint, thirdPoint].map((point) =>
        createLatentMapPointTweenItem({
          point,
          pointSize: 3,
          visualTheme: "dark",
        }),
      ),
    );
    const firstTransform = getLatentMapNeighborhoodPreviewMeshTransform({
      point: firstPoint,
      thumbnailSize: 64,
      tweenController: controller,
      view,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const secondTransform = getLatentMapNeighborhoodPreviewMeshTransform({
      point: secondPoint,
      thumbnailSize: 64,
      tweenController: controller,
      view,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const thirdTransform = getLatentMapNeighborhoodPreviewMeshTransform({
      point: thirdPoint,
      thumbnailSize: 64,
      tweenController: controller,
      view,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const firstBounds = worldTransformToScreenBounds({
      height: viewport.height,
      transform: firstTransform,
      view,
      width: viewport.width,
    });
    const secondBounds = worldTransformToScreenBounds({
      height: viewport.height,
      transform: secondTransform,
      view,
      width: viewport.width,
    });
    const thirdBounds = worldTransformToScreenBounds({
      height: viewport.height,
      transform: thirdTransform,
      view,
      width: viewport.width,
    });

    expect(secondBounds.left - firstBounds.right).toBeCloseTo(32);
    expect(thirdBounds.top - firstBounds.bottom).toBeCloseTo(32);
  });

  it("zooms neighborhood grid screen targets around the wheel cursor", () => {
    const baseView = { offsetX: 0, offsetY: 0, zoom: 1 };
    const viewport = { height: 900, left: 0, top: 0, width: 1600 };
    const pointer = { clientX: 1100, clientY: 260 };
    const point = createRenderablePoint({
      image_id: "img_grid_cursor",
      point_state: "neighbor",
      tween_screen_base_offset_x: 0,
      tween_screen_base_offset_y: 0,
      tween_screen_base_zoom: 1,
      tween_screen_cell_gap: 32,
      tween_screen_cell_size: 160,
      tween_screen_column: 0,
      tween_screen_grid_x: 120,
      tween_screen_grid_y: 90,
      tween_screen_height: 120,
      tween_screen_kind: "grid",
      tween_screen_max_long_side: 900,
      tween_screen_row: 0,
      tween_screen_width: 160,
      tween_screen_x: 200,
      tween_screen_y: 150,
    });
    const controller = createLatentMapRuntimeTweenController([
      createLatentMapPointTweenItem({
        point,
        pointSize: 3,
        visualTheme: "dark",
      }),
    ]);
    const baseTransform = getLatentMapNeighborhoodPreviewMeshTransform({
      point,
      thumbnailSize: 64,
      tweenController: controller,
      view: baseView,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const baseBounds = worldTransformToScreenBounds({
      height: viewport.height,
      transform: baseTransform,
      view: baseView,
      width: viewport.width,
    });
    const zoomedView = createLatentMapWheelZoomView({
      deltaMode: 0,
      deltaY: -180,
      pointer,
      view: baseView,
      viewport,
    });
    const zoomedTransform = getLatentMapNeighborhoodPreviewMeshTransform({
      point,
      thumbnailSize: 64,
      tweenController: controller,
      view: zoomedView,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const zoomedBounds = worldTransformToScreenBounds({
      height: viewport.height,
      transform: zoomedTransform,
      view: zoomedView,
      width: viewport.width,
    });
    const zoomRatio = zoomedView.zoom / baseView.zoom;

    expect(zoomedBounds.centerX).toBeCloseTo(
      pointer.clientX + (baseBounds.centerX - pointer.clientX) * zoomRatio,
    );
    expect(zoomedBounds.centerY).toBeCloseTo(
      pointer.clientY + (baseBounds.centerY - pointer.clientY) * zoomRatio,
    );
  });

  it("marks only opposite neighborhood preview meshes", () => {
    const closestPoint = createRenderablePoint({
      image_id: "img_closest",
      point_state: "neighbor",
    });
    const oppositePoint = createRenderablePoint({
      image_id: "img_opposite",
      point_state: "opposite",
      tween_state: 3,
    });
    const controller = createLatentMapRuntimeTweenController([
      createLatentMapPointTweenItem({
        point: closestPoint,
        pointSize: 3,
        visualTheme: "dark",
      }),
      createLatentMapPointTweenItem({
        point: oppositePoint,
        pointSize: 3,
        visualTheme: "dark",
      }),
    ]);

    expect(
      getLatentMapNeighborhoodPreviewMarkerOpacity({
        point: closestPoint,
        tweenController: controller,
      }),
    ).toBe(0);
    expect(
      getLatentMapNeighborhoodPreviewMarkerOpacity({
        point: oppositePoint,
        tweenController: controller,
      }),
    ).toBe(1);
  });

  it("renders the selected neighborhood anchor above grid previews", () => {
    const anchorPoint = createRenderablePoint({
      image_id: "img_anchor",
      point_state: "selected",
      tween_screen_kind: "anchor",
    });
    const closestPoint = createRenderablePoint({
      image_id: "img_closest",
      point_state: "neighbor",
      tween_screen_kind: "grid",
    });
    const oppositePoint = createRenderablePoint({
      image_id: "img_opposite",
      point_state: "opposite",
      tween_screen_kind: "grid",
    });

    const anchorRenderOrder = getLatentMapNeighborhoodPreviewRenderOrder({
      point: anchorPoint,
      rank: 0,
    });

    expect(anchorRenderOrder).toBeGreaterThan(
      getLatentMapNeighborhoodPreviewRenderOrder({
        point: closestPoint,
        rank: 1,
      }),
    );
    expect(anchorRenderOrder).toBeGreaterThan(
      getLatentMapNeighborhoodPreviewRenderOrder({
        point: oppositePoint,
        rank: 50,
      }),
    );
  });
});
