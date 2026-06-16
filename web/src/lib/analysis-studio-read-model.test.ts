import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAnalysisStudioReadModel } from "@/lib/analysis-studio-read-model";

describe("Analysis Studio read model", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads collections, recipes, jobs, registry results, health, storage, staleness, and selected state without local result scanning", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.method ?? "GET").toBe("GET");

      if (url.endsWith("/search-sets")) {
        return Response.json([
          {
            display_name: "Bread",
            slug: "bread",
            terms: [],
          },
        ]);
      }

      if (url.endsWith("/analysis-recipes")) {
        return Response.json({
          default_recipe_id: "dinov3_vits_384",
          recipes: [
            {
              input_size: 384,
              is_default: true,
              label: "DINOv3 ViT-S 384px",
              recipe_id: "dinov3_vits_384",
            },
          ],
          schema_version: 1,
        });
      }

      if (url.endsWith("/analysis-jobs")) {
        return Response.json({
          jobs: [
            {
              analysis_job_id: "analysis-job-20260614T130000Z",
              analysis_result_ids: [
                "analysis-result-20260614T130000Z-dinov3_vits_384",
              ],
              recipe_ids: ["dinov3_vits_384"],
              stages: [],
              status: "ready",
              viewer_hrefs: [
                "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
              ],
            },
          ],
        });
      }

      if (url.endsWith("/analyses")) {
        return Response.json({
          analyses: [
            {
              analysis_id: "analysis-20260614T130000Z",
              analysis_job_ids: ["analysis-job-20260614T130000Z"],
              recipe_ids: ["dinov3_vits_384"],
              source_collections: [{ label: "Bread", slug: "bread" }],
              status: "pending",
              title: "Bread visual study",
              variants: [],
            },
          ],
        });
      }

      if (url.endsWith("/analysis-results")) {
        return Response.json({
          results: [
            {
              analysis_job_id: "analysis-job-20260614T130000Z",
              analysis_result_id:
                "analysis-result-20260614T130000Z-dinov3_vits_384",
              artifact_health: {
                missing_optional_artifact_keys: [
                  "viewer/atlases/128px/atlas-manifest.json",
                ],
                missing_optional_render_cache_artifact_keys: [
                  "viewer/atlases/128px/atlas-manifest.json",
                ],
                missing_required_artifact_keys: [],
                ready: true,
              },
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
              explorer_readiness: { ready: true },
              item_count: 2,
              recipe_ids: ["dinov3_vits_384"],
              recipe_names: ["dinov3_vits_384"],
              result_state: { state: "ready" },
              scope_label: "Bread",
              status: "ready",
              staleness: {
                added_image_count: 0,
                removed_image_count: 0,
                state: "current",
              },
              storage_totals: {
                durable: 1024,
                "render-cache": 2048,
                total: 3072,
                "viewer-cache": 0,
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const model = await loadAnalysisStudioReadModel({
      searchParams: {
        analysisId: "analysis-20260614T130000Z",
      },
    });

    expect(model.collections).toEqual([{ label: "Bread", slug: "bread" }]);
    expect(model.analyses).toEqual([
      {
        analysisId: "analysis-20260614T130000Z",
        analysisJobIds: ["analysis-job-20260614T130000Z"],
        analyzedImageCount: 2,
        recipeIds: ["dinov3_vits_384"],
        sourceCollections: [{ label: "Bread", slug: "bread" }],
        status: "ready",
        title: "Bread visual study",
        variants: [
          {
            analysisResultId:
              "analysis-result-20260614T130000Z-dinov3_vits_384",
            explorerHref:
              "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
            status: "ready",
          },
        ],
      },
    ]);
    expect(model.recipes).toEqual([
      {
        inputSize: 384,
        isDefault: true,
        label: "DINOv3 ViT-S 384px",
        recipeId: "dinov3_vits_384",
      },
    ]);
    expect(model.jobs[0]).toMatchObject({
      analysisJobId: "analysis-job-20260614T130000Z",
      recipeLabels: ["DINOv3 ViT-S 384px"],
      status: "ready",
    });
    expect(model.results[0]).toMatchObject({
      analysisJobId: "analysis-job-20260614T130000Z",
      analysisResultId: "analysis-result-20260614T130000Z-dinov3_vits_384",
      artifactHealth: {
        missingOptionalArtifactKeys: [
          "viewer/atlases/128px/atlas-manifest.json",
        ],
        missingOptionalRenderCacheKeys: [
          "viewer/atlases/128px/atlas-manifest.json",
        ],
        missingRequiredArtifactKeys: [],
      },
      canOpenExplorer: true,
      explorerHref:
        "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
      itemCount: 2,
      recipeIds: ["dinov3_vits_384"],
      recipeLabels: ["DINOv3 ViT-S 384px"],
      scopeLabel: "Bread",
      state: "ready",
      staleness: {
        addedImageCount: 0,
        removedImageCount: 0,
        state: "current",
      },
      storageTotals: {
        durableBytes: 1024,
        renderCacheBytes: 2048,
        totalBytes: 3072,
        viewerCacheBytes: 0,
      },
    });
    expect(model.summary).toEqual({
      indexedImageCount: 2,
      resultCount: 1,
    });
    expect(model.selectedState).toEqual({
      analysisId: "analysis-20260614T130000Z",
      state: "selected-analysis",
    });
    expect(model.selectedAnalysis?.analysisId).toBe("analysis-20260614T130000Z");
    expect(model.selectedResult).toBeNull();
    expect(JSON.stringify(model)).not.toContain("/Users/");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      "http://127.0.0.1:18670/analyses",
      "http://127.0.0.1:18670/analysis-jobs",
      "http://127.0.0.1:18670/analysis-recipes",
      "http://127.0.0.1:18670/analysis-results",
      "http://127.0.0.1:18670/search-sets",
    ]);
  });
});
