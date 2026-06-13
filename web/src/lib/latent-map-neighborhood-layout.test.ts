import { describe, expect, it } from "vitest";

import {
  createLatentMapNeighborhoodLayout,
  type LatentMapNeighborhoodReadyLayout,
} from "@/lib/latent-map-neighborhood-layout";
import type { LatentMapNeighbor, LatentMapPoint } from "@/lib/latent-map-viewer";

function createPoint(
  index: number,
  overrides: Partial<LatentMapPoint> = {},
): LatentMapPoint {
  return {
    image_id: `img_${String(index).padStart(3, "0")}`,
    x: index * 0.01,
    y: index * -0.01,
    cluster_id: 0,
    thumbnail_path: `thumb-${index}.jpg`,
    preview_path: `preview-${index}.jpg`,
    source_path: `source-${index}.jpg`,
    relative_path: `source-${index}.jpg`,
    width: 1200,
    height: 800,
    ...overrides,
  };
}

function createNeighbors(
  startIndex: number,
  count: number,
): LatentMapNeighbor[] {
  return Array.from({ length: count }, (_, index) => ({
    image_id: `img_${String(startIndex + index).padStart(3, "0")}`,
    rank: index + 1,
    score: 1 - index * 0.01,
  }));
}

function createFixture({
  neighborCount = 50,
  oppositeCount = 50,
}: {
  neighborCount?: number;
  oppositeCount?: number;
} = {}) {
  const points = Array.from(
    { length: 1 + neighborCount + oppositeCount },
    (_, index) => createPoint(index),
  );

  points[0] = {
    ...points[0],
    neighbors: createNeighbors(1, neighborCount),
    opposites: createNeighbors(1 + neighborCount, oppositeCount),
  };

  return {
    points,
    selectedImageId: "img_000",
  };
}

function expectReady(
  layout: ReturnType<typeof createLatentMapNeighborhoodLayout>,
): asserts layout is LatentMapNeighborhoodReadyLayout {
  expect(layout.status).toBe("ready");
}

describe("latent map neighborhood layout", () => {
  it("returns the selected anchor and 20 closest rows in FAISS rank order", () => {
    const fixture = createFixture();
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 20,
      points: fixture.points,
      relationMode: "closest",
      selectedImageId: fixture.selectedImageId,
      viewport: { width: 1600, height: 1000 },
    });

    expectReady(layout);
    expect(layout.anchor.imageId).toBe("img_000");
    expect(layout.rows).toHaveLength(20);
    expect(layout.rows.map((row) => row.imageId)).toEqual(
      createNeighbors(1, 20).map((neighbor) => neighbor.image_id),
    );
    expect(layout.rows.every((row) => row.relation === "closest")).toBe(true);
    expect(layout.rows.every((row) => row.marker === null)).toBe(true);
    expect(layout.grid.columns).toBe(5);
    expect(layout.grid.rowCount).toBe(4);
    expect(layout.grid.cellGap).toBe(30);
    expect(layout.rows[3]).toMatchObject({
      column: 0,
      gridIndex: 3,
      row: 3,
    });
    expect(layout.rows[4]).toMatchObject({
      column: 1,
      gridIndex: 4,
      row: 0,
    });
  });

  it("returns opposite rows with marker metadata for the pale red dot", () => {
    const fixture = createFixture();
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 20,
      points: fixture.points,
      relationMode: "opposite",
      selectedImageId: fixture.selectedImageId,
      viewport: { width: 1600, height: 1000 },
    });

    expectReady(layout);
    expect(layout.rows).toHaveLength(20);
    expect(layout.rows[0]).toMatchObject({
      imageId: "img_051",
      isOpposite: true,
      marker: "opposite",
      relation: "opposite",
    });
    expect(layout.rows.every((row) => row.marker === "opposite")).toBe(true);
  });

  it("combines closest and opposite rows when relation mode is both", () => {
    const fixture = createFixture();
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 20,
      points: fixture.points,
      relationMode: "both",
      selectedImageId: fixture.selectedImageId,
      viewport: { width: 1600, height: 1000 },
    });

    expectReady(layout);
    expect(layout.rows).toHaveLength(40);
    expect(layout.grid.columns).toBe(10);
    expect(layout.grid.rowCount).toBe(4);
    expect(layout.rows.slice(0, 20).every((row) => row.relation === "closest"))
      .toBe(true);
    expect(layout.rows.slice(20).every((row) => row.relation === "opposite"))
      .toBe(true);
    expect(layout.rows.slice(20).every((row) => row.marker === "opposite"))
      .toBe(true);
  });

  it("supports 50 relation rows by expanding horizontally from four rows", () => {
    const fixture = createFixture();
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 50,
      points: fixture.points,
      relationMode: "closest",
      selectedImageId: fixture.selectedImageId,
      viewport: { width: 1600, height: 1000 },
    });

    expectReady(layout);
    expect(layout.rows).toHaveLength(50);
    expect(layout.grid.columns).toBe(13);
    expect(layout.grid.rowCount).toBe(4);
    expect(layout.rows.at(-1)).toMatchObject({
      column: 12,
      imageId: "img_050",
      row: 1,
    });
  });

  it("sorts loaded neighbors by rank before creating grid rows", () => {
    const fixture = createFixture({ neighborCount: 5, oppositeCount: 0 });
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 3,
      neighborsByImageId: {
        img_000: [
          { image_id: "img_003", rank: 3, score: 0.7 },
          { image_id: "img_001", rank: 1, score: 0.9 },
          { image_id: "img_002", rank: 2, score: 0.8 },
        ],
      },
      points: fixture.points,
      relationMode: "closest",
      selectedImageId: fixture.selectedImageId,
      viewport: { width: 1200, height: 800 },
    });

    expectReady(layout);
    expect(layout.rows.map((row) => row.imageId)).toEqual([
      "img_001",
      "img_002",
      "img_003",
    ]);
  });

  it("reports selected-image exclusions and missing or filtered image IDs", () => {
    const selected = createPoint(0, {
      neighbors: [
        { image_id: "img_001", rank: 1, score: 0.9 },
        { image_id: "img_000", rank: 2, score: 0.8 },
        { image_id: "img_missing", rank: 3, score: 0.7 },
      ],
    });
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 3,
      points: [selected, createPoint(1)],
      relationMode: "closest",
      selectedImageId: selected.image_id,
      viewport: { width: 1000, height: 700 },
    });

    expectReady(layout);
    expect(layout.rows.map((row) => row.imageId)).toEqual(["img_001"]);
    expect(layout.excludedSelectedImageIds).toEqual(["img_000"]);
    expect(layout.missingItems).toEqual([
      {
        imageId: "img_missing",
        rank: 3,
        relation: "closest",
        score: 0.7,
      },
    ]);
  });

  it("computes bounded target transforms and a positive recenter target", () => {
    const fixture = createFixture();
    const layout = createLatentMapNeighborhoodLayout({
      neighborCount: 50,
      points: fixture.points,
      relationMode: "both",
      selectedImageId: fixture.selectedImageId,
      viewport: { width: 900, height: 600 },
    });

    expectReady(layout);
    expect(layout.stageBounds.width).toBeGreaterThan(0);
    expect(layout.stageBounds.height).toBe(600);
    expect(layout.recenterTarget.zoom).toBeGreaterThan(0);
    expect(layout.anchor.target.height).toBe(536);
    expect(layout.grid.bounds.height).toBe(536);
    expect(layout.grid.cellSize).toBeCloseTo((536 - 3 * 30) / 4);
    expect(layout.anchor.target.x).toBeGreaterThanOrEqual(0);
    expect(layout.anchor.target.y).toBeGreaterThanOrEqual(0);
    expect(layout.anchor.target.x).toBeLessThanOrEqual(
      layout.stageBounds.width,
    );
    expect(layout.anchor.target.y).toBeLessThanOrEqual(
      layout.stageBounds.height,
    );

    for (const row of layout.rows) {
      expect(row.target.width).toBeGreaterThan(0);
      expect(row.target.height).toBeGreaterThan(0);
      expect(row.target.x).toBeGreaterThanOrEqual(0);
      expect(row.target.y).toBeGreaterThanOrEqual(0);
      expect(row.target.x).toBeLessThanOrEqual(layout.stageBounds.width);
      expect(row.target.y).toBeLessThanOrEqual(layout.stageBounds.height);
    }
  });

  it("returns explicit empty states for missing selections", () => {
    expect(
      createLatentMapNeighborhoodLayout({
        neighborCount: 20,
        points: [createPoint(0)],
        relationMode: "closest",
        selectedImageId: null,
        viewport: { width: 1000, height: 700 },
      }),
    ).toMatchObject({
      reason: "no-selection",
      rows: [],
      status: "empty",
    });

    expect(
      createLatentMapNeighborhoodLayout({
        neighborCount: 20,
        points: [createPoint(0)],
        relationMode: "closest",
        selectedImageId: "img_missing",
        viewport: { width: 1000, height: 700 },
      }),
    ).toMatchObject({
      reason: "selected-missing",
      rows: [],
      status: "empty",
    });
  });
});
