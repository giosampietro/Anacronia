import { afterEach, describe, expect, it, vi } from "vitest";

import { loadLatentMapAnalysisResultViewerData } from "@/lib/latent-map-analysis-result-open";

const ANALYSIS_RESULT_ID = "analysis-result-20260614T130000Z-dinov3_vits_384";

describe("loadLatentMapAnalysisResultViewerData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the Explorer viewer data through backend Registry detail and artifact APIs", async () => {
    vi.stubGlobal("fetch", vi.fn(fetchAnalysisResultFixture));

    const result = await loadLatentMapAnalysisResultViewerData({
      analysisResultId: ANALYSIS_RESULT_ID,
      selectedClusterId: "hdbscan_detail",
      selectedLayoutId: "umap_a",
      selectedRecipeName: "dinov3_vits_384",
    });

    expect(result.runDir).toBe("");
    expect(result.sourceFolder).toBe("J Shoot");
    expect(result.rawData).toMatchObject({
      cluster_id: "hdbscan_detail",
      layout_id: "umap_a",
      recipe_name: "dinov3_vits_384",
      run_id: ANALYSIS_RESULT_ID,
    });
    expect(result.rawData.points?.[0]).toMatchObject({
      cluster_id: 7,
      image_id: "image-asset-1",
      thumbnail_path: "thumbnails/image-asset-1.jpg",
      x: 3,
      y: 4,
    });
    expect(result.rawData.thumbnail_atlases?.[0]?.tile_size).toBe(64);
    expect(result.status).toMatchObject({
      canOpenExplorer: true,
      state: "ready",
    });
  });

  it("does not fall back to local fixture data when backend detail is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );

    await expect(
      loadLatentMapAnalysisResultViewerData({
        analysisResultId: "analysis-result-does-not-exist",
      }),
    ).rejects.toThrow("Analysis Result not found: analysis-result-does-not-exist");
  });

  it("reports missing declared artifacts from the backend artifact API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/analysis-results/${ANALYSIS_RESULT_ID}`)) {
          return Response.json({ result: analysisResultDetailFixture() });
        }
        if (url.endsWith("/layouts/dinov3_vits_384_umap.json")) {
          return new Response("missing", { status: 404 });
        }
        return fetchAnalysisResultFixture(input);
      }),
    );

    await expect(
      loadLatentMapAnalysisResultViewerData({
        analysisResultId: ANALYSIS_RESULT_ID,
        selectedRecipeName: "dinov3_vits_384",
      }),
    ).rejects.toThrow(
      "Pinned Analysis Result artifact is missing: layouts/dinov3_vits_384_umap.json",
    );
  });

  it("detects row-order mismatches against the pinned vector image ID map", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/analysis-results/${ANALYSIS_RESULT_ID}`)) {
          return Response.json({ result: analysisResultDetailFixture() });
        }
        if (url.endsWith("/layouts/dinov3_vits_384_umap.json")) {
          return textResponse({
            layout_id: "umap_a",
            method: "umap",
            points: [
              { image_id: "image-asset-2", x: 3, y: 4 },
              { image_id: "image-asset-1", x: 5, y: 6 },
            ],
            recipe_name: "dinov3_vits_384",
          });
        }
        return fetchAnalysisResultFixture(input);
      }),
    );

    await expect(
      loadLatentMapAnalysisResultViewerData({
        analysisResultId: ANALYSIS_RESULT_ID,
        selectedRecipeName: "dinov3_vits_384",
      }),
    ).rejects.toThrow(
      "Pinned Analysis Result row order mismatch for layout umap_a.",
    );
  });
});

async function fetchAnalysisResultFixture(input: RequestInfo | URL) {
  const url = String(input);
  if (url.endsWith(`/analysis-results/${ANALYSIS_RESULT_ID}`)) {
    return Response.json({ result: analysisResultDetailFixture() });
  }
  if (url.endsWith("/manifest.jsonl")) {
    return new Response(
      [
        JSON.stringify({
          height: 600,
          image_id: "image-asset-1",
          preview_path: "previews/image-asset-1.jpg",
          relative_path: "set/image-asset-1.jpg",
          thumbnail_path: "thumbnails/image-asset-1.jpg",
          width: 800,
        }),
        JSON.stringify({
          height: 700,
          image_id: "image-asset-2",
          thumbnail_path: "thumbnails/image-asset-2.jpg",
          width: 900,
        }),
      ].join("\n"),
    );
  }
  if (url.endsWith("/indexes/dinov3_vits_384_faiss_id_map.json")) {
    return textResponse([
      { faiss_id: 0, image_id: "image-asset-1" },
      { faiss_id: 1, image_id: "image-asset-2" },
    ]);
  }
  if (url.endsWith("/layouts/dinov3_vits_384_umap.json")) {
    return textResponse({
      layout_id: "umap_a",
      method: "umap",
      params: { n_neighbors: 15 },
      points: [
        { image_id: "image-asset-1", x: 3, y: 4 },
        { image_id: "image-asset-2", x: 5, y: 6 },
      ],
      recipe_name: "dinov3_vits_384",
    });
  }
  if (url.endsWith("/clusters/dinov3_vits_384_hdbscan.json")) {
    return textResponse({
      cluster_count: 1,
      cluster_id: "hdbscan_detail",
      method: "hdbscan",
      points: [
        { cluster_id: 7, image_id: "image-asset-1" },
        { cluster_id: 8, image_id: "image-asset-2" },
      ],
      recipe_name: "dinov3_vits_384",
    });
  }
  if (url.endsWith("/viewer/atlases/64px/atlas-manifest.json")) {
    return textResponse({
      asset_kind: "latent-map-thumbnail-atlas",
      atlas_size: 512,
      image_count: 2,
      items: [],
      page_count: 1,
      pages: [{ path: "viewer/atlases/64px/page-000.png" }],
      run_id: ANALYSIS_RESULT_ID,
      schema_version: 1,
      tile_size: 64,
    });
  }
  return new Response("unexpected", { status: 500 });
}

function analysisResultDetailFixture() {
  return {
    analysis_result_id: ANALYSIS_RESULT_ID,
    artifact_health: {
      missing_optional_render_cache_artifact_keys: [],
      missing_required_artifact_keys: [],
    },
    artifacts: [
      { key: "manifest.jsonl", role: "image-manifest" },
      { key: "indexes/dinov3_vits_384_faiss_id_map.json", role: "faiss-id-map" },
      { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
      { key: "clusters/dinov3_vits_384_hdbscan.json", role: "cluster-result" },
      {
        key: "viewer/atlases/64px/atlas-manifest.json",
        role: "thumbnail-atlas",
      },
    ],
    explorer_readiness: { ready: true },
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
          vector_id_map: "indexes/dinov3_vits_384_faiss_id_map.json",
        },
        recipe: {
          input_size: 384,
          model_family: "dinov3",
          model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
        },
        recipe_name: "dinov3_vits_384",
      },
    ],
    result_state: { state: "ready" },
    scope_label: "J Shoot",
    status: "ready",
    staleness: {
      added_image_count: 0,
      removed_image_count: 0,
      state: "current",
    },
  };
}

function textResponse(value: unknown) {
  return new Response(`${JSON.stringify(value)}\n`, {
    headers: { "content-type": "application/json" },
  });
}
