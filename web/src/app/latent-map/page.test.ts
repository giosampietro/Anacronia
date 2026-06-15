import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import LatentMapPage, { loadLatentMapViewerData } from "@/app/latent-map/page";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("loadLatentMapViewerData", () => {
  const previousRunsRoot = process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
  const previousViewerData = process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;

  afterEach(() => {
    if (previousRunsRoot === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
    } else {
      process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = previousRunsRoot;
    }

    if (previousViewerData === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;
    } else {
      process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = previousViewerData;
    }
  });

  it("loads an Analysis Result by ID without reading stale legacy viewer data env", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "latent-page-analysis-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = path.join(
      runsRoot,
      "missing-legacy-viewer-data.json",
    );
    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "embeddings"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await mkdir(path.join(runDir, "viewer", "atlases", "64px"), {
      recursive: true,
    });
    await mkdir(path.join(runDir, "viewer", "atlases", "96px"), {
      recursive: true,
    });
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      artifacts: [
        {
          content_type: "application/x-jsonlines",
          key: "manifest.jsonl",
          retention_class: "durable",
          role: "image-manifest",
        },
        {
          content_type: "application/json",
          key: "layouts/dinov3_vits_384_umap.json",
          retention_class: "durable",
          role: "layout",
        },
        {
          content_type: "application/json",
          key: "clusters/dinov3_vits_384_hdbscan.json",
          retention_class: "durable",
          role: "cluster-result",
        },
        {
          content_type: "application/json",
          key: "viewer/atlases/64px/atlas-manifest.json",
          retention_class: "render-cache",
          role: "thumbnail-atlas",
        },
        {
          content_type: "image/png",
          key: "viewer/atlases/64px/page-000.png",
          retention_class: "render-cache",
          role: "thumbnail-atlas-page",
        },
        {
          content_type: "image/jpeg",
          key: "previews/img_1.jpg",
          retention_class: "render-cache",
          role: "generated-preview",
        },
        {
          content_type: "image/jpeg",
          key: "thumbnails/img_1.jpg",
          retention_class: "render-cache",
          role: "generated-thumbnail",
        },
      ],
      recipes: [
        {
          artifact_keys: {
            clusters: [
              {
                cluster_id: "hdbscan_detail",
                key: "clusters/dinov3_vits_384_hdbscan.json",
              },
            ],
            image_manifest: "manifest.jsonl",
            layouts: [
              {
                key: "layouts/dinov3_vits_384_umap.json",
                layout_id: "umap_a",
              },
            ],
            thumbnail_atlas_manifests: {
              "64": "viewer/atlases/64px/atlas-manifest.json",
              "96": "viewer/atlases/96px/atlas-manifest.json",
            },
          },
          recipe_name: "dinov3_vits_384",
        },
      ],
    });
    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      JSON.stringify({
        height: 600,
        image_id: "img_1",
        preview_path: "previews/img_1.jpg",
        relative_path: "set/img_1.jpg",
        thumbnail_path: "thumbnails/img_1.jpg",
        width: 800,
      }) + "\n",
      "utf-8",
    );
    await writeJson(path.join(runDir, "embeddings", "dinov3_vits_384.json"), {
      family: "dinov3",
      long_edge: 384,
      model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
      recipe_name: "dinov3_vits_384",
    });
    await writeJson(path.join(runDir, "layouts", "dinov3_vits_384_umap.json"), {
      layout_id: "umap_a",
      method: "umap",
      params: { n_neighbors: 15 },
      points: [{ image_id: "img_1", x: 3, y: 4 }],
      recipe_name: "dinov3_vits_384",
      run_id: "20260609T123000Z-j-shoot",
    });
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_hdbscan.json"),
      {
        cluster_count: 1,
        cluster_id: "hdbscan_detail",
        method: "hdbscan",
        points: [{ cluster_id: 7, image_id: "img_1" }],
        recipe_name: "dinov3_vits_384",
        run_id: "20260609T123000Z-j-shoot",
      },
    );
    await writeJson(
      path.join(runDir, "viewer", "atlases", "64px", "atlas-manifest.json"),
      {
        asset_kind: "latent-map-thumbnail-atlas",
        atlas_size: 512,
        image_count: 1,
        items: [],
        page_count: 1,
        pages: [
          {
            height: 512,
            index: 0,
            path: "viewer/atlases/64px/page-000.png",
            width: 512,
          },
        ],
        run_id: "20260609T123000Z-j-shoot",
        schema_version: 1,
        tile_size: 64,
      },
    );
    await writeJson(
      path.join(runDir, "viewer", "atlases", "96px", "atlas-manifest.json"),
      {
        asset_kind: "latent-map-thumbnail-atlas",
        atlas_size: 512,
        image_count: 1,
        items: [],
        page_count: 0,
        pages: [],
        run_id: "20260609T123000Z-j-shoot",
        schema_version: 1,
        tile_size: 96,
      },
    );

    const data = await loadLatentMapViewerData({
      analysisResultId: "latent-map-20260609T123000Z-j-shoot",
      clusterResult: "hdbscan_detail",
      layout: "umap_a",
      recipe: "dinov3_vits_384",
    });

    expect(data.run_id).toBe("20260609T123000Z-j-shoot");
    expect(data.analysis_result_id).toBe(
      "latent-map-20260609T123000Z-j-shoot",
    );
    expect(data.points).toHaveLength(1);
    expect(data.neighbor_lookup_path).toBe(
      "/api/latent-map/neighbors?analysisResultId=latent-map-20260609T123000Z-j-shoot&recipe=dinov3_vits_384",
    );
    expect(data.points[0].thumbnail_path).toBe(
      "/api/latent-map/thumbnails?analysisResultId=latent-map-20260609T123000Z-j-shoot&artifactKey=thumbnails%2Fimg_1.jpg",
    );
    expect(data.thumbnail_atlases?.map((atlas) => atlas.tile_size)).toEqual([
      64,
    ]);
    expect(data.thumbnail_atlases?.[0]?.pages[0]?.path).toBe(
      "/api/latent-map/thumbnails?analysisResultId=latent-map-20260609T123000Z-j-shoot&artifactKey=viewer%2Fatlases%2F64px%2Fpage-000.png",
    );
  });

  it("does not fall back to legacy viewer data when an Analysis Result ID is missing", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "latent-page-analysis-"));
    const fallbackRunDir = path.join(runsRoot, "fallback-run");
    const fallbackViewerDataPath = path.join(
      fallbackRunDir,
      "viewer",
      "viewer-data.json",
    );

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = fallbackViewerDataPath;
    await mkdir(path.dirname(fallbackViewerDataPath), { recursive: true });
    await writeJson(fallbackViewerDataPath, {
      cluster_id: "fallback_cluster",
      layout_id: "fallback_layout",
      points: [],
      recipe_name: "fallback_recipe",
      run_id: "fallback-run",
    });

    await expect(
      loadLatentMapViewerData({
        analysisResultId: "analysis-result-does-not-exist",
      }),
    ).rejects.toThrow("Analysis Result not found: analysis-result-does-not-exist");
  });

  it("opens a durable Analysis Result when an optional atlas manifest is missing", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "latent-page-analysis-"));
    const runDir = path.join(runsRoot, "analysis-result-ready-without-atlas");
    const analysisResultId = "analysis-result-ready-without-atlas";

    delete process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;
    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "embeddings"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
        {
          key: "clusters/dinov3_vits_384_hdbscan.json",
          role: "cluster-result",
        },
        {
          key: "viewer/atlases/64px/atlas-manifest.json",
          retention_class: "render-cache",
          role: "thumbnail-atlas",
        },
        {
          key: "thumbnails/img_1.jpg",
          retention_class: "render-cache",
          role: "generated-thumbnail",
        },
      ],
      recipes: [
        {
          artifact_keys: {
            clusters: [
              {
                cluster_id: "hdbscan_detail",
                key: "clusters/dinov3_vits_384_hdbscan.json",
              },
            ],
            image_manifest: "manifest.jsonl",
            layouts: [
              {
                key: "layouts/dinov3_vits_384_umap.json",
                layout_id: "umap_a",
              },
            ],
            thumbnail_atlas_manifests: {
              "64": "viewer/atlases/64px/atlas-manifest.json",
            },
          },
          recipe_name: "dinov3_vits_384",
        },
      ],
      status: "ready",
    });
    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      JSON.stringify({
        height: 600,
        image_id: "img_1",
        thumbnail_path: "thumbnails/img_1.jpg",
        width: 800,
      }) + "\n",
      "utf-8",
    );
    await writeJson(path.join(runDir, "embeddings", "dinov3_vits_384.json"), {
      recipe_name: "dinov3_vits_384",
    });
    await writeJson(path.join(runDir, "layouts", "dinov3_vits_384_umap.json"), {
      layout_id: "umap_a",
      method: "umap",
      points: [{ image_id: "img_1", x: 1, y: 2 }],
      recipe_name: "dinov3_vits_384",
    });
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_hdbscan.json"),
      {
        cluster_id: "hdbscan_detail",
        method: "hdbscan",
        points: [{ cluster_id: 0, image_id: "img_1" }],
        recipe_name: "dinov3_vits_384",
      },
    );

    const data = await loadLatentMapViewerData({ analysisResultId });

    expect(data.analysis_result_id).toBe(analysisResultId);
    expect(data.points).toHaveLength(1);
    expect(data.thumbnail_atlases).toBeUndefined();
  });

  it("renders an intentional empty Explorer rail entry without a selected result", async () => {
    delete process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;
    delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;

    const html = renderToString(
      await LatentMapPage({ searchParams: Promise.resolve({}) }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"explorer\"");
    expect(html).toContain("data-focus-mode-available=\"true\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("Latent Space Explorer");
    expect(html).toContain("data-testid=\"latent-map-empty-state\"");
    expect(html).toContain("Open Analysis Studio");
    expect(html).not.toContain("data-testid=\"latent-map-canvas\"");
    expect(html).toContain("data-ui-overlay-hidden=\"false\"");
  });
});
