import { describe, expect, it } from "vitest";

import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  findNearestLatentMapPoint,
  fitLatentMapPoints,
  type LatentMapFittedPoint,
} from "@/lib/latent-map-viewer";
import {
  createLatentMapPointerHitRadius,
  createLatentMapSpatialIndex,
  screenPixelsToLatentMapWorldRadius,
} from "@/lib/latent-map-spatial-index";

function createSyntheticPoints(): LatentMapFittedPoint[] {
  return Array.from({ length: 400 }, (_, index) => {
    const column = index % 20;
    const row = Math.floor(index / 20);

    return {
      image_id: `img_${String(index).padStart(3, "0")}`,
      x: column,
      y: row,
      fitted_x: column / 8 - 1.2,
      fitted_y: row / 8 - 1.2,
      cluster_id: 0,
      thumbnail_path: `thumb-${index}.jpg`,
      source_path: `source-${index}.jpg`,
      relative_path: `source-${index}.jpg`,
      width: 100,
      height: 100,
      neighbors: [],
    };
  });
}

describe("latent map spatial index", () => {
  it("matches brute-force nearest lookup on fixture points", () => {
    const points = fitLatentMapPoints(latentMapFixture.points);
    const index = createLatentMapSpatialIndex(points, { cellSize: 0.25 });
    const queries = [
      { x: -0.82, y: -0.18, maxDistance: 0.2 },
      { x: 0.1, y: 0.5, maxDistance: 0.3 },
      { x: 0.75, y: -0.35, maxDistance: 0.25 },
      { x: 2.5, y: 2.5, maxDistance: 0.1 },
    ];

    for (const query of queries) {
      expect(index.findNearest(query)?.image_id ?? null).toBe(
        findNearestLatentMapPoint({
          maxDistance: query.maxDistance,
          points,
          x: query.x,
          y: query.y,
        })?.image_id ?? null,
      );
    }
  });

  it("matches brute-force nearest lookup on synthetic dense points", () => {
    const points = createSyntheticPoints();
    const index = createLatentMapSpatialIndex(points, { cellSize: 0.2 });

    for (const queryPoint of points.filter((_, index) => index % 37 === 0)) {
      const query = {
        x: queryPoint.fitted_x + 0.015,
        y: queryPoint.fitted_y - 0.01,
        maxDistance: 0.08,
      };

      expect(index.findNearest(query)?.image_id ?? null).toBe(
        findNearestLatentMapPoint({
          maxDistance: query.maxDistance,
          points,
          x: query.x,
          y: query.y,
        })?.image_id ?? null,
      );
    }
  });

  it("converts screen hit radius into world units for orthographic zoom", () => {
    expect(
      screenPixelsToLatentMapWorldRadius({
        screenPixels: 24,
        viewportHeight: 800,
        zoom: 1,
      }),
    ).toBeCloseTo(0.06);
    expect(
      screenPixelsToLatentMapWorldRadius({
        screenPixels: 24,
        viewportHeight: 800,
        zoom: 2,
      }),
    ).toBeCloseTo(0.03);
  });

  it("accounts for thumbnail size when calculating hit radius", () => {
    const pointRadius = createLatentMapPointerHitRadius({
      renderMode: "points",
      thumbnailSize: 64,
      viewportHeight: 800,
      zoom: 1,
    });
    const smallThumbnailRadius = createLatentMapPointerHitRadius({
      renderMode: "thumbnails",
      thumbnailSize: 32,
      viewportHeight: 800,
      zoom: 1,
    });
    const largeThumbnailRadius = createLatentMapPointerHitRadius({
      renderMode: "thumbnails",
      thumbnailSize: 96,
      viewportHeight: 800,
      zoom: 1,
    });

    expect(smallThumbnailRadius).toBeGreaterThan(pointRadius);
    expect(largeThumbnailRadius).toBeGreaterThan(smallThumbnailRadius);
  });
});
