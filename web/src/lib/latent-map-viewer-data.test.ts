import { describe, expect, it } from "vitest";

import { normalizeExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

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
            neighbors: [{ image_id: "img_2", score: 0.91 }],
          },
        ],
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
      source_path: "/source/images/original.jpg",
      relative_path: "original.jpg",
      neighbors: [{ image_id: "img_2", score: 0.91 }],
    });
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
});
