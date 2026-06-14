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

  it("loads an Analysis Result by ID without requiring legacy viewer data env", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "latent-page-analysis-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    delete process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;
    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "embeddings"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      artifacts: [],
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
  });

  it("renders the Explorer inside the app rail with Focus Mode available", async () => {
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
    expect(html).toContain("data-testid=\"latent-map-canvas\"");
    expect(html).toContain("data-ui-overlay-hidden=\"false\"");
  });
});
