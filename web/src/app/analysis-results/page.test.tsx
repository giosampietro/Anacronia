import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import AnalysisResultsPage from "@/app/analysis-results/page";

describe("AnalysisResultsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders existing Analysis Results with Explorer links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/analysis-results")) {
          return Response.json({
            results: [
              {
                analysis_result_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
                explorer_href:
                  "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
                explorer_readiness: { ready: true },
                item_count: 3184,
                recipe_ids: ["dinov3_vits_384"],
                recipe_names: ["dinov3_vits_384"],
                result_state: { state: "ready" },
                scope_label: "J Shoot",
                status: "ready",
              },
            ],
          });
        }
        if (url.endsWith("/search-sets")) {
          return Response.json([
            {
              display_name: "J Shoot",
              slug: "j-shoot",
              terms: [],
            },
            {
              display_name: "Mood Board",
              slug: "mood-board",
              terms: [],
            },
          ]);
        }
        return Response.json({
          jobs: [
            {
              analysis_job_id: "analysis-job-20260614T130010Z",
              analysis_result_ids: [],
              recipe_ids: ["dinov3_vits_512"],
              stages: [
                {
                  recipe_id: "dinov3_vits_512",
                  stage_name: "embedding_computation",
                  status: "running",
                },
              ],
              status: "running",
              viewer_hrefs: [],
            },
            {
              analysis_job_id: "analysis-job-20260614T130000Z",
              analysis_result_ids: ["latent-map-20260609T123000Z-j-shoot"],
              recipe_ids: ["dinov3_vits_384"],
              status: "ready",
              viewer_hrefs: [
                "/latent-map?analysisResultId=latent-map-20260609T123000Z-j-shoot",
              ],
            },
            {
              analysis_job_id: "analysis-job-20260614T125900Z",
              analysis_result_ids: [],
              recipe_ids: ["dinov3_vits_384"],
              stages: [
                {
                  error: "DINOv3 access failed",
                  recipe_id: "dinov3_vits_384",
                  stage_name: "embedding_computation",
                  status: "failed",
                },
              ],
              status: "failed",
              viewer_hrefs: [],
            },
            {
              analysis_job_id: "analysis-job-20260614T125800Z",
              analysis_result_ids: [],
              recipe_ids: ["dinov3_vits_384"],
              stages: [
                {
                  recipe_id: "dinov3_vits_384",
                  stage_name: "embedding_computation",
                  status: "failed",
                },
              ],
              status: "failed",
              viewer_hrefs: [],
            },
          ],
        });
      }),
    );

    const html = renderToString(await AnalysisResultsPage()).replaceAll(
      "<!-- -->",
      "",
    );

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"analysis\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("Analysis Results");
    expect(html).toContain("Start Analysis Job");
    expect(html).toContain("name=\"collection_slugs\"");
    expect(html).toContain("<option value=\"j-shoot\">J Shoot</option>");
    expect(html).toContain(
      "<option value=\"mood-board\">Mood Board</option>",
    );
    expect(html).not.toContain("placeholder=\"j-shoot, mood-board\"");
    expect(html).toContain("name=\"recipe_ids\"");
    expect(html).toContain("value=\"dinov3_vits_384\"");
    expect(html).toContain("action=\"/api/analysis-jobs\"");
    expect(html).toContain("Analysis Scope");
    expect(html).toContain("1 result");
    expect(html).toContain("3184 images indexed");
    expect(html).toContain("Recipe Choices");
    expect(html).toContain("dinov3_vits_384");
    expect(html).toContain("Job Status");
    expect(html).toContain("ready");
    expect(html).toContain("Analysis running");
    expect(html).toContain("1 running");
    expect(html).toContain("2 failed");
    expect(html).toContain("embedding computation");
    expect(html).toContain("Failed at embedding computation");
    expect(html).toContain("analysis-job-20260614T130010Z");
    expect(html).toContain("Refreshing automatically");
    expect(html).not.toContain("readys");
    expect(html).not.toContain("faileds");
    expect(html).toContain("analysis-job-20260614T130000Z");
    expect(html).toContain("Submitted Jobs");
    expect(html).toContain("J Shoot");
    expect(html).toContain("dinov3_vits_384");
    expect(html).toContain("3184 images");
    expect(html).toContain("ready");
    expect(html).toContain(
      "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    );
    expect(html).toContain(
      "/api/analysis-results/analysis-result-20260614T130000Z-dinov3_vits_384",
    );
    expect(html).toContain("Delete");
  });
});
