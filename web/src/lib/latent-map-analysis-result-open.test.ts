import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadLatentMapAnalysisResultViewerData } from "@/lib/latent-map-analysis-result-open";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("loadLatentMapAnalysisResultViewerData", () => {
  it("loads the existing viewer contract by Analysis Result ID", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-result-open-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "embeddings"), { recursive: true });
    await mkdir(path.join(runDir, "indexes"), { recursive: true });
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

    const result = await loadLatentMapAnalysisResultViewerData({
      analysisResultId: "latent-map-20260609T123000Z-j-shoot",
      runsRoot,
      selectedClusterId: "hdbscan_detail",
      selectedLayoutId: "umap_a",
      selectedRecipeName: "dinov3_vits_384",
    });

    expect(result.runDir).toBe(runDir);
    expect(result.rawData).toMatchObject({
      cluster_id: "hdbscan_detail",
      layout_id: "umap_a",
      recipe_name: "dinov3_vits_384",
      run_id: "20260609T123000Z-j-shoot",
    });
    expect(result.rawData.points?.[0]).toMatchObject({
      image_id: "img_1",
      thumbnail_path: "thumbnails/img_1.jpg",
      x: 3,
      y: 4,
    });
    expect(result.status).toMatchObject({
      canOpenExplorer: true,
      state: "ready",
    });
  });
});
