import { describe, expect, it } from "vitest";

import {
  normalizeExportedLatentMapViewerData,
  normalizeLatentMapNeighborResponse,
} from "@/lib/latent-map-viewer-data";

describe("normalizeExportedLatentMapViewerData", () => {
  it("loads exported map data through generated thumbnail URLs", () => {
    const data = normalizeExportedLatentMapViewerData({
      sourceFolder: "/source/images",
      rawData: {
        run_id: "run-1",
        recipe_name: "dinov3_vits_256",
        layout_id: "layout-1",
        cluster_id: "cluster-1",
        points: [
          {
            image_id: "img_1",
            x: 1.25,
            y: -0.5,
            cluster_id: 4,
            thumbnail_path: "thumbnails/img_1.jpg",
            source_path: "/source/images/original.jpg",
            relative_path: "original.jpg",
            width: 800,
            height: 600,
          },
        ],
        neighbor_index_path: "viewer/neighbors.json",
      },
    });

    expect(data).toMatchObject({
      schema_version: 1,
      run_id: "run-1",
      embedding_recipe: "dinov3_vits_256",
      layout_id: "layout-1",
      cluster_id: "cluster-1",
      source_folder: "/source/images",
    });
    expect(data.points[0]).toMatchObject({
      image_id: "img_1",
      thumbnail_path:
        "/api/latent-map/thumbnails?path=thumbnails%2Fimg_1.jpg",
      source_path: "",
      relative_path: "original.jpg",
    });
    expect(data.neighbor_lookup_path).toBe(
      "/api/latent-map/neighbors?path=viewer%2Fneighbors.json",
    );
    expect(data.points[0].neighbors).toEqual([]);
    expect(data.points[0].thumbnail_path).not.toContain("original.jpg");
  });

  it("preserves existing thumbnail API query params", () => {
    const data = normalizeExportedLatentMapViewerData({
      sourceFolder: "/source/images",
      thumbnailApiPath: "/api/latent-map/thumbnails?run=run-1",
      rawData: {
        points: [
          {
            image_id: "img_1",
            thumbnail_path: "thumbnails/img_1.jpg",
          },
        ],
      },
    });

    expect(data.points[0].thumbnail_path).toBe(
      "/api/latent-map/thumbnails?run=run-1&path=thumbnails%2Fimg_1.jpg",
    );
  });

  it("preserves existing neighbor API query params", () => {
    const data = normalizeExportedLatentMapViewerData({
      sourceFolder: "/source/images",
      neighborApiPath: "/api/latent-map/neighbors?run=run-1",
      rawData: {
        neighbor_index_path: "viewer/neighbors.json",
        points: [
          {
            image_id: "img_1",
            thumbnail_path: "thumbnails/img_1.jpg",
          },
        ],
      },
    });

    expect(data.neighbor_lookup_path).toBe(
      "/api/latent-map/neighbors?run=run-1&path=viewer%2Fneighbors.json",
    );
  });

  it("loads generated atlas page URLs through the thumbnail API", () => {
    const data = normalizeExportedLatentMapViewerData({
      sourceFolder: "/source/images",
      thumbnailApiPath: "/api/latent-map/thumbnails?run=run-1",
      rawData: {
        points: [
          {
            image_id: "img_1",
            thumbnail_path: "thumbnails/img_1.jpg",
          },
        ],
        thumbnail_atlas: {
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: 32,
          atlas_size: 64,
          image_count: 1,
          page_count: 1,
          pages: [
            {
              index: 0,
              path: "viewer/atlases/32px/page-000.png",
              width: 64,
              height: 64,
            },
          ],
          items: [
            {
              image_id: "img_1",
              page_index: 0,
              page_path: "viewer/atlases/32px/page-000.png",
              source_thumbnail_path: "thumbnails/img_1.jpg",
              tile_rect: [0, 0, 32, 32],
              uv_rect: [0.0078125, 0.0078125, 0.484375, 0.484375],
              width: 100,
              height: 200,
            },
          ],
        },
      },
    });

    expect(data.thumbnail_atlas?.pages[0].path).toBe(
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F32px%2Fpage-000.png",
    );
    expect(data.thumbnail_atlas?.items[0].source_thumbnail_path).toBe(
      "thumbnails/img_1.jpg",
    );
  });

  it("normalizes selected-image FAISS neighbor responses", () => {
    expect(
      normalizeLatentMapNeighborResponse(
        {
          image_id: "img_1",
          neighbors: [
            { image_id: "img_2", score: "0.91" },
            { image_id: "img_3", score: 0.75 },
          ],
        },
        "img_1",
      ),
    ).toEqual([
      { image_id: "img_2", score: 0.91 },
      { image_id: "img_3", score: 0.75 },
    ]);
  });

  it("rejects missing FAISS neighbor responses clearly", () => {
    expect(() =>
      normalizeLatentMapNeighborResponse(
        {
          image_id: "img_1",
        },
        "img_1",
      ),
    ).toThrow("FAISS neighbors are unavailable");
    expect(() =>
      normalizeLatentMapNeighborResponse(
        {
          image_id: "img_2",
          neighbors: [],
        },
        "img_1",
      ),
    ).toThrow("FAISS neighbor response mismatch");
  });
});
