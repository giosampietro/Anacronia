import { afterEach, describe, expect, it, vi } from "vitest";

import { listAnalysisResults } from "@/lib/analysis-results-browser";

describe("listAnalysisResults", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists durable Analysis Results from the backend Registry read model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("http://127.0.0.1:18670/analysis-results");
        return Response.json({
          results: [
            {
              analysis_result_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
              explorer_readiness: { ready: true },
              item_count: 2,
              recipe_ids: ["dinov3_vits_384"],
              recipe_names: ["DINOv3 ViT-S 384"],
              result_state: { state: "ready" },
              scope_label: "Analysis Board",
              status: "ready",
              storage_totals: { durable: 10, "render-cache": 2, total: 12 },
            },
            {
              analysis_result_id: "analysis-result-20260614T140000Z-dinov3_vits_512",
              explorer_readiness: {
                missing_required_artifact_keys: ["viewer/map-data.json"],
                ready: false,
              },
              item_count: 0,
              recipe_ids: ["dinov3_vits_512"],
              result_state: { state: "ready" },
              scope_label: "Incomplete Board",
              status: "ready",
            },
          ],
        });
      }),
    );

    await expect(listAnalysisResults()).resolves.toEqual([
      {
        analysisResultId: "analysis-result-20260614T130000Z-dinov3_vits_384",
        canOpenExplorer: true,
        explorerHref:
          "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
        itemCount: 2,
        recipeNames: ["DINOv3 ViT-S 384"],
        runId: "analysis-result-20260614T130000Z-dinov3_vits_384",
        sourceFolderName: "Analysis Board",
        state: "ready",
      },
      {
        analysisResultId: "analysis-result-20260614T140000Z-dinov3_vits_512",
        canOpenExplorer: false,
        explorerHref:
          "/latent-map?analysisResultId=analysis-result-20260614T140000Z-dinov3_vits_512",
        itemCount: 0,
        recipeNames: ["dinov3_vits_512"],
        runId: "analysis-result-20260614T140000Z-dinov3_vits_512",
        sourceFolderName: "Incomplete Board",
        state: "incomplete",
      },
    ]);
  });

  it("returns an empty list when the Registry API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );

    await expect(listAnalysisResults()).resolves.toEqual([]);
  });
});
