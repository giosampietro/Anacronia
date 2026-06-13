import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { createLatentMapRuntimeTweenController } from "@/lib/latent-map-runtime-tween";
import {
  createLatentMapPointTweenItem,
  getLatentMapThumbnailWorldScale,
  LATENT_MAP_ATLAS_FRAGMENT_SHADER,
  LATENT_MAP_ATLAS_VERTEX_SHADER,
  LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE,
  writeLatentMapAtlasInstanceAttributesFromTween,
  writeLatentMapPointGeometryFromTween,
} from "@/lib/latent-map-webgl-runtime";
import type {
  LatentMapRenderablePoint,
  LatentMapThumbnailAtlasPage,
} from "@/lib/latent-map-viewer";

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
      "vec3(1.0, 0.58, 0.66)",
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
      }),
    ).not.toThrow();

    const positions = geometry.getAttribute("instancePosition")
      .array as Float32Array;
    const states = geometry.getAttribute("instanceState")
      .array as Float32Array;

    expectArrayCloseTo(positions, [1, 2, 0.26, 5, 6, 0.34]);
    expectArrayCloseTo(states, [1, 2]);
  });
});
