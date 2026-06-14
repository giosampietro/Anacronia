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

  it("loads durable job results from an additional Analysis Result root", async () => {
    const legacyRunsRoot = await mkdtemp(
      path.join(os.tmpdir(), "analysis-result-open-legacy-"),
    );
    const jobResultsRoot = await mkdtemp(
      path.join(os.tmpdir(), "analysis-result-open-job-"),
    );
    const analysisResultId = "analysis-result-20260614T130000Z-dinov3_vits_384";
    const runDir = path.join(jobResultsRoot, analysisResultId);

    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      JSON.stringify({
        height: 600,
        image_id: "image-asset-1",
        thumbnail_path: "thumbnails/image-asset-1.jpg",
        width: 800,
      }) + "\n",
      "utf-8",
    );
    await writeJson(path.join(runDir, "layouts", "dinov3_vits_384_umap.json"), {
      layout_id: "umap_a",
      method: "umap",
      points: [{ image_id: "image-asset-1", x: 1, y: 2 }],
      recipe_name: "dinov3_vits_384",
      run_id: analysisResultId,
    });
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_hdbscan.json"),
      {
        cluster_count: 1,
        cluster_id: "hdbscan_detail",
        method: "hdbscan",
        points: [{ cluster_id: 3, image_id: "image-asset-1" }],
        recipe_name: "dinov3_vits_384",
        run_id: analysisResultId,
      },
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
        {
          key: "clusters/dinov3_vits_384_hdbscan.json",
          role: "cluster-result",
        },
      ],
      recipes: [{ recipe_name: "dinov3_vits_384" }],
      status: "ready",
    });

    const result = await loadLatentMapAnalysisResultViewerData({
      additionalRunsRoots: [jobResultsRoot],
      analysisResultId,
      runsRoot: legacyRunsRoot,
      selectedRecipeName: "dinov3_vits_384",
    });

    expect(result.runDir).toBe(runDir);
    expect(result.rawData.points?.[0]).toMatchObject({
      cluster_id: 3,
      image_id: "image-asset-1",
      x: 1,
      y: 2,
    });
  });

  it("opens manifest-pinned layout and cluster artifacts before directory defaults", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-result-open-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const analysisResultId = "latent-map-20260609T123000Z-j-shoot";

    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
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
    await writeJson(path.join(runDir, "layouts", "dinov3_vits_384_aaa_wrong.json"), {
      layout_id: "umap_wrong",
      method: "umap",
      points: [{ image_id: "img_1", x: -10, y: -20 }],
      recipe_name: "dinov3_vits_384",
      run_id: "20260609T123000Z-j-shoot",
    });
    await writeJson(
      path.join(runDir, "layouts", "dinov3_vits_384_umap_pinned.json"),
      {
        layout_id: "umap_pinned",
        method: "umap",
        points: [{ image_id: "img_1", x: 3, y: 4 }],
        recipe_name: "dinov3_vits_384",
        run_id: "20260609T123000Z-j-shoot",
      },
    );
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_aaa_wrong.json"),
      {
        cluster_count: 1,
        cluster_id: "cluster_wrong",
        method: "kmeans",
        points: [{ cluster_id: 99, image_id: "img_1" }],
        recipe_name: "dinov3_vits_384",
      },
    );
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_cluster_pinned.json"),
      {
        cluster_count: 1,
        cluster_id: "cluster_pinned",
        method: "hdbscan",
        points: [{ cluster_id: 7, image_id: "img_1" }],
        recipe_name: "dinov3_vits_384",
      },
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        { key: "layouts/dinov3_vits_384_aaa_wrong.json", role: "layout" },
        {
          key: "layouts/dinov3_vits_384_umap_pinned.json",
          role: "layout",
        },
        { key: "clusters/dinov3_vits_384_aaa_wrong.json", role: "cluster-result" },
        {
          key: "clusters/dinov3_vits_384_cluster_pinned.json",
          role: "cluster-result",
        },
      ],
      recipes: [
        {
          recipe_name: "dinov3_vits_384",
          artifact_keys: {
            image_manifest: "manifest.jsonl",
            layouts: [
              {
                key: "layouts/dinov3_vits_384_umap_pinned.json",
                layout_id: "umap_pinned",
              },
            ],
            clusters: [
              {
                cluster_id: "cluster_pinned",
                key: "clusters/dinov3_vits_384_cluster_pinned.json",
              },
            ],
          },
        },
      ],
    });

    const result = await loadLatentMapAnalysisResultViewerData({
      analysisResultId,
      runsRoot,
      selectedRecipeName: "dinov3_vits_384",
    });

    expect(result.rawData).toMatchObject({
      cluster_id: "cluster_pinned",
      layout_id: "umap_pinned",
      recipe_name: "dinov3_vits_384",
    });
    expect(result.rawData.points?.[0]).toMatchObject({
      cluster_id: 7,
      image_id: "img_1",
      x: 3,
      y: 4,
    });
  });

  it("reports a missing manifest-pinned artifact instead of silently falling back", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-result-open-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const analysisResultId = "latent-map-20260609T123000Z-j-shoot";

    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      JSON.stringify({
        image_id: "img_1",
        thumbnail_path: "thumbnails/img_1.jpg",
      }) + "\n",
      "utf-8",
    );
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_cluster_pinned.json"),
      {
        cluster_count: 1,
        cluster_id: "cluster_pinned",
        method: "hdbscan",
        points: [{ cluster_id: 7, image_id: "img_1" }],
        recipe_name: "dinov3_vits_384",
      },
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        {
          key: "clusters/dinov3_vits_384_cluster_pinned.json",
          role: "cluster-result",
        },
      ],
      recipes: [
        {
          recipe_name: "dinov3_vits_384",
          artifact_keys: {
            image_manifest: "manifest.jsonl",
            layouts: [
              {
                key: "layouts/dinov3_vits_384_missing.json",
                layout_id: "umap_missing",
              },
            ],
            clusters: [
              {
                cluster_id: "cluster_pinned",
                key: "clusters/dinov3_vits_384_cluster_pinned.json",
              },
            ],
          },
        },
      ],
    });

    await expect(
      loadLatentMapAnalysisResultViewerData({
        analysisResultId,
        runsRoot,
        selectedRecipeName: "dinov3_vits_384",
      }),
    ).rejects.toThrow(
      "Pinned Analysis Result artifact is missing: layouts/dinov3_vits_384_missing.json",
    );
  });

  it("detects row-order mismatches against the pinned vector image ID map", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-result-open-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const analysisResultId = "latent-map-20260609T123000Z-j-shoot";

    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "indexes"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      [
        JSON.stringify({
          image_id: "img_1",
          thumbnail_path: "thumbnails/img_1.jpg",
        }),
        JSON.stringify({
          image_id: "img_2",
          thumbnail_path: "thumbnails/img_2.jpg",
        }),
      ].join("\n"),
      "utf-8",
    );
    await writeJson(path.join(runDir, "indexes", "dinov3_vits_384_id_map.json"), {
      ids: ["img_1", "img_2"],
    });
    await writeJson(path.join(runDir, "layouts", "dinov3_vits_384_umap.json"), {
      layout_id: "umap_pinned",
      method: "umap",
      points: [
        { image_id: "img_2", x: 2, y: 2 },
        { image_id: "img_1", x: 1, y: 1 },
      ],
      recipe_name: "dinov3_vits_384",
    });
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_cluster.json"),
      {
        cluster_count: 1,
        cluster_id: "cluster_pinned",
        method: "hdbscan",
        points: [
          { cluster_id: 0, image_id: "img_1" },
          { cluster_id: 0, image_id: "img_2" },
        ],
        recipe_name: "dinov3_vits_384",
      },
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        { key: "indexes/dinov3_vits_384_id_map.json", role: "faiss-index" },
        { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
        { key: "clusters/dinov3_vits_384_cluster.json", role: "cluster-result" },
      ],
      recipes: [
        {
          recipe_name: "dinov3_vits_384",
          artifact_keys: {
            image_manifest: "manifest.jsonl",
            vector_id_map: "indexes/dinov3_vits_384_id_map.json",
            layouts: [
              {
                key: "layouts/dinov3_vits_384_umap.json",
                layout_id: "umap_pinned",
              },
            ],
            clusters: [
              {
                cluster_id: "cluster_pinned",
                key: "clusters/dinov3_vits_384_cluster.json",
              },
            ],
          },
        },
      ],
    });

    await expect(
      loadLatentMapAnalysisResultViewerData({
        analysisResultId,
        runsRoot,
        selectedRecipeName: "dinov3_vits_384",
      }),
    ).rejects.toThrow(
      "Pinned Analysis Result row order mismatch for layout umap_pinned.",
    );
  });

  it("opens production-style FAISS object id maps when pinned rows match", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-result-open-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const analysisResultId = "latent-map-20260609T123000Z-j-shoot";

    await mkdir(path.join(runDir, "clusters"), { recursive: true });
    await mkdir(path.join(runDir, "indexes"), { recursive: true });
    await mkdir(path.join(runDir, "layouts"), { recursive: true });
    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      [
        JSON.stringify({
          image_id: "img_1",
          thumbnail_path: "thumbnails/img_1.jpg",
        }),
        JSON.stringify({
          image_id: "img_2",
          thumbnail_path: "thumbnails/img_2.jpg",
        }),
      ].join("\n"),
      "utf-8",
    );
    await writeJson(path.join(runDir, "indexes", "dinov3_vits_384_id_map.json"), [
      { faiss_id: 0, image_id: "img_1" },
      { faiss_id: 1, image_id: "img_2" },
    ]);
    await writeJson(path.join(runDir, "layouts", "dinov3_vits_384_umap.json"), {
      layout_id: "umap_pinned",
      method: "umap",
      points: [
        { image_id: "img_1", x: 1, y: 1 },
        { image_id: "img_2", x: 2, y: 2 },
      ],
      recipe_name: "dinov3_vits_384",
    });
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_cluster.json"),
      {
        cluster_count: 1,
        cluster_id: "cluster_pinned",
        method: "hdbscan",
        points: [
          { cluster_id: 0, image_id: "img_1" },
          { cluster_id: 0, image_id: "img_2" },
        ],
        recipe_name: "dinov3_vits_384",
      },
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        { key: "indexes/dinov3_vits_384_id_map.json", role: "faiss-index" },
        { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
        { key: "clusters/dinov3_vits_384_cluster.json", role: "cluster-result" },
      ],
      recipes: [
        {
          recipe_name: "dinov3_vits_384",
          artifact_keys: {
            image_manifest: "manifest.jsonl",
            vector_id_map: "indexes/dinov3_vits_384_id_map.json",
            layouts: [
              {
                key: "layouts/dinov3_vits_384_umap.json",
                layout_id: "umap_pinned",
              },
            ],
            clusters: [
              {
                cluster_id: "cluster_pinned",
                key: "clusters/dinov3_vits_384_cluster.json",
              },
            ],
          },
        },
      ],
    });

    const result = await loadLatentMapAnalysisResultViewerData({
      analysisResultId,
      runsRoot,
      selectedRecipeName: "dinov3_vits_384",
    });

    expect(result.rawData.points).toEqual([
      expect.objectContaining({ image_id: "img_1", x: 1, y: 1 }),
      expect.objectContaining({ image_id: "img_2", x: 2, y: 2 }),
    ]);
  });
});
