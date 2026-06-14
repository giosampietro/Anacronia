import { describe, expect, it } from "vitest";

import {
  normalizeExportedLatentMapViewerData,
  normalizeLatentMapNeighborResponse,
  normalizeLatentMapRelationResponse,
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
        cluster_result: {
          asset_kind: "latent-map-cluster-result",
          cluster_id: "cluster-1",
          cluster_count: 4,
          groups: [
            {
              cluster_id: 4,
              count: 1,
              group_key: "cluster:4",
              kind: "cluster",
              label: "Group 4",
            },
          ],
          label: "HDBSCAN · Balanced",
          method: "hdbscan",
          params: { preset: "balanced" },
          random_state: null,
          schema_version: 1,
          unassigned_count: 0,
        },
        available_recipes: [
          {
            family: "dinov3",
            long_edge: 256,
            model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
            recipe_name: "dinov3_vits_256",
          },
        ],
        available_layouts: [
          {
            layout_id: "layout-1",
            method: "umap",
            params: { min_dist: 0.05 },
          },
        ],
        available_clusters: [
          {
            cluster_id: "cluster-1",
            cluster_count: 4,
            method: "kmeans",
            random_state: 42,
          },
        ],
        points: [
          {
            image_id: "img_1",
            x: 1.25,
            y: -0.5,
            cluster_id: 4,
            cluster_group_key: "cluster:4",
            cluster_membership: 0.91,
            thumbnail_path: "thumbnails/img_1.jpg",
            preview_path: "previews/img_1.jpg",
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
      cluster_result: {
        asset_kind: "latent-map-cluster-result",
        cluster_id: "cluster-1",
        cluster_count: 4,
        groups: [
          {
            cluster_id: 4,
            count: 1,
            group_key: "cluster:4",
            kind: "cluster",
            label: "Group 4",
          },
        ],
        label: "HDBSCAN · Balanced",
        method: "hdbscan",
        params: { preset: "balanced" },
        random_state: null,
        schema_version: 1,
        unassigned_count: 0,
      },
      source_folder: "/source/images",
      available_recipes: [
        {
          family: "dinov3",
          long_edge: 256,
          model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
          recipe_name: "dinov3_vits_256",
        },
      ],
      available_layouts: [
        {
          layout_id: "layout-1",
          method: "umap",
          params: { min_dist: 0.05 },
        },
      ],
      available_clusters: [
        {
          cluster_id: "cluster-1",
          cluster_count: 4,
          method: "kmeans",
          random_state: 42,
        },
      ],
    });
    expect(data.points[0]).toMatchObject({
      image_id: "img_1",
      thumbnail_path:
        "/api/latent-map/thumbnails?path=thumbnails%2Fimg_1.jpg",
      preview_path: "/api/latent-map/thumbnails?path=previews%2Fimg_1.jpg",
      cluster_group_key: "cluster:4",
      cluster_membership: 0.91,
      source_path: "",
      relative_path: "original.jpg",
    });
    expect(data.neighbor_lookup_path).toBe(
      "/api/latent-map/neighbors?recipe=dinov3_vits_256",
    );
    expect(data.points[0].neighbors).toEqual([]);
    expect(data.points[0].thumbnail_path).not.toContain("original.jpg");
    expect(data.points[0].preview_path).not.toContain("original.jpg");
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
    expect(data.points[0].preview_path).toBe(
      "/api/latent-map/thumbnails?run=run-1&path=thumbnails%2Fimg_1.jpg",
    );
  });

  it("can address thumbnails by artifact key for Analysis Result opens", () => {
    const data = normalizeExportedLatentMapViewerData({
      sourceFolder: "/source/images",
      thumbnailApiPath:
        "/api/latent-map/thumbnails?analysisResultId=latent-map-run-1",
      thumbnailResourceParamName: "artifactKey",
      rawData: {
        points: [
          {
            image_id: "img_1",
            thumbnail_path: "thumbnails/img_1.jpg",
            preview_path: "previews/img_1.jpg",
          },
        ],
        thumbnail_atlas: {
          asset_kind: "latent-map-thumbnail-atlas",
          atlas_size: 64,
          image_count: 1,
          items: [],
          page_count: 1,
          pages: [
            {
              height: 64,
              index: 0,
              path: "viewer/atlases/64px/page-000.png",
              width: 64,
            },
          ],
          run_id: "run-1",
          schema_version: 1,
          tile_size: 64,
        },
      },
    });

    expect(data.points[0].thumbnail_path).toBe(
      "/api/latent-map/thumbnails?analysisResultId=latent-map-run-1&artifactKey=thumbnails%2Fimg_1.jpg",
    );
    expect(data.points[0].preview_path).toBe(
      "/api/latent-map/thumbnails?analysisResultId=latent-map-run-1&artifactKey=previews%2Fimg_1.jpg",
    );
    expect(data.thumbnail_atlas?.pages[0].path).toBe(
      "/api/latent-map/thumbnails?analysisResultId=latent-map-run-1&artifactKey=viewer%2Fatlases%2F64px%2Fpage-000.png",
    );
  });

  it("preserves existing neighbor API query params", () => {
    const data = normalizeExportedLatentMapViewerData({
      sourceFolder: "/source/images",
      neighborApiPath: "/api/latent-map/neighbors?run=run-1",
      rawData: {
        recipe_name: "dinov3_vits_384",
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
      "/api/latent-map/neighbors?run=run-1&recipe=dinov3_vits_384",
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
              content_rect: [0, 4, 32, 24],
              uv_rect: [0.0078125, 0.0703125, 0.484375, 0.359375],
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
    expect(data.thumbnail_atlas?.items[0].content_rect).toEqual([
      0, 4, 32, 24,
    ]);
    expect(data.thumbnail_atlas?.items[0].uv_rect).toEqual([
      0.0078125, 0.0703125, 0.484375, 0.359375,
    ]);
  });

  it("normalizes multiple generated atlas sizes for client-side LOD switching", () => {
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
        thumbnail_atlases: [32, 64, 96].map((tileSize) => ({
          schema_version: 1,
          asset_kind: "latent-map-thumbnail-atlas",
          run_id: "run-1",
          tile_size: tileSize,
          atlas_size: 512,
          image_count: 1,
          page_count: 1,
          pages: [
            {
              index: 0,
              path: `viewer/atlases/${tileSize}px/page-000.png`,
              width: 512,
              height: 512,
            },
          ],
          items: [
            {
              image_id: "img_1",
              page_index: 0,
              page_path: `viewer/atlases/${tileSize}px/page-000.png`,
              source_thumbnail_path: "thumbnails/img_1.jpg",
              tile_rect: [0, 0, tileSize, tileSize],
              uv_rect: [0, 0, 0.125, 0.125],
              width: 100,
              height: 100,
            },
          ],
        })),
      },
    });

    expect(data.thumbnail_atlases?.map((atlas) => atlas.tile_size)).toEqual([
      32, 64, 96,
    ]);
    expect(data.thumbnail_atlases?.[2].pages[0].path).toBe(
      "/api/latent-map/thumbnails?run=run-1&path=viewer%2Fatlases%2F96px%2Fpage-000.png",
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
    expect(
      normalizeLatentMapRelationResponse(
        {
          image_id: "img_1",
          neighbors: [{ image_id: "img_2", rank: 1, score: "0.91" }],
          opposites: [{ image_id: "img_9", rank: 1, score: -0.21 }],
        },
        "img_1",
      ),
    ).toEqual({
      neighbors: [{ image_id: "img_2", rank: 1, score: 0.91 }],
      opposites: [{ image_id: "img_9", rank: 1, score: -0.21 }],
    });
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
