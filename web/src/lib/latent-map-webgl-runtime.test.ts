import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { createLatentMapRuntimeTweenController } from "@/lib/latent-map-runtime-tween";
import {
  createLatentMapPointTweenItem,
  getLatentMapThumbnailWorldScale,
  LATENT_MAP_ATLAS_FRAGMENT_SHADER,
  LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE,
  writeLatentMapPointGeometryFromTween,
} from "@/lib/latent-map-webgl-runtime";
import type { LatentMapRenderablePoint } from "@/lib/latent-map-viewer";

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

describe("latent map WebGL runtime math", () => {
  it("converts custom atlas shader output through Three color management", () => {
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "gl_FragColor = vec4(color, 1.0);",
    );
    expect(LATENT_MAP_ATLAS_FRAGMENT_SHADER).toContain(
      "#include <colorspace_fragment>",
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

    expectArrayCloseTo(positions, [1, 2, 0, 3, 4, 0.08]);
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

    expectArrayCloseTo(positions, [1, 2, 0, 8, 9, 0.24]);
    expectArrayCloseTo(colors.slice(0, 3), [1, 0, 0]);
    expectArrayCloseTo(colors.slice(3, 6), [0, 0, 1]);
  });
});
