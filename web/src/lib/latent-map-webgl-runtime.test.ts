import { describe, expect, it } from "vitest";

import {
  getLatentMapThumbnailWorldScale,
  LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE,
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

describe("latent map WebGL runtime math", () => {
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
});
