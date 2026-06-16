import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import AnalysisResultsPage from "@/app/analysis-results/page";

function stubAnalysisStudioFetch({
  jobsOk = true,
  resultsOk = true,
}: {
  jobsOk?: boolean;
  resultsOk?: boolean;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return Response.json({
          service: "api",
          status: "ok",
          worker: { service: "worker", status: "idle" },
        });
      }
      if (url.endsWith("/analysis-results")) {
        if (!resultsOk) {
          return new Response(null, { status: 500 });
        }
        return Response.json({
          results: [
            {
              analysis_job_id: "analysis-job-20260614T130000Z",
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
              staleness: { state: "current" },
              storage_totals: { total: 2621440 },
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
            {
              input_size: 512,
              is_default: false,
              label: "DINOv3 ViT-S 512px",
              recipe_id: "dinov3_vits_512",
            },
          ],
          schema_version: 1,
        });
      }
      if (url.endsWith("/analysis-jobs")) {
        if (!jobsOk) {
          return new Response(null, { status: 500 });
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
              analysis_result_ids: [
                "analysis-result-20260614T130000Z-dinov3_vits_384",
              ],
              recipe_ids: ["dinov3_vits_384"],
              status: "ready",
              viewer_hrefs: [
                "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
              ],
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

describe("AnalysisResultsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Analysis Studio workspace shell with sidebar groups and overview state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(await AnalysisResultsPage()),
    );

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"analysis\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("aria-label=\"Workspace\"");
    expect(html).toContain("id=\"app-shell-top-bar-controls\"");
    expect(html).toContain(">New Analysis<");
    expect(html).toContain(">Overview<");
    expect(html).toContain(">Analysis Results<");
    expect(html).toContain(">Jobs<");
    expect(html).toContain(">J Shoot<");
    expect(html).toContain("DINOv3 ViT-S 384px · ready");
    expect(html).toContain("analysis-job-20260614T130000Z");
    expect(html).toContain("Analysis active");
    expect(html).toContain("Current stage: embedding computation");
    expect(html).toContain("Durable Analysis Results live here.");
    expect(html).toContain("3184 images indexed");
    expect(html).not.toContain("Submitted Jobs");
    expect(html).not.toContain("Collection slugs");
  });

  it("renders the New Analysis workspace from URL state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({ mode: "new-analysis" }),
        }),
      ),
    );

    expect(html).toContain(">New Analysis<");
    expect(html).toContain("Start Analysis Job");
    expect(html).toContain("name=\"collection_slugs\"");
    expect(html).toContain("<option value=\"j-shoot\">J Shoot</option>");
    expect(html).toContain("name=\"recipe_ids\"");
    expect(html).toContain("value=\"dinov3_vits_384\"");
    expect(html).toContain("Run Analysis");
  });

  it("renders the selected result workspace from URL state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisResultId:
              "analysis-result-20260614T130000Z-dinov3_vits_384",
          }),
        }),
      ),
    );

    expect(html).toContain("Selected Analysis Result");
    expect(html).toContain("J Shoot");
    expect(html).toContain("Required artifacts ready");
    expect(html).toContain("2.5 MB");
    expect(html).toContain("Open Explorer");
    expect(html).toContain(
      "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    );
    expect(html).toContain(
      "/api/analysis-results/analysis-result-20260614T130000Z-dinov3_vits_384",
    );
  });

  it("renders the selected job workspace from URL state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-20260614T130000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Selected Analysis Job");
    expect(html).toContain("analysis-job-20260614T130000Z");
    expect(html).toContain("Process history is separate from durable Analysis Results.");
    expect(html).toContain("Produced Results");
    expect(html).toContain(
      "/analysis-results?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    );
  });

  it("renders explicit missing result state instead of silently falling back", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisResultId: "analysis-result-missing",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis Result not found");
    expect(html).toContain("analysis-result-missing");
    expect(html).not.toContain("Selected Analysis Result");
  });

  it("renders explicit missing job state instead of silently falling back", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-missing",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis Job not found");
    expect(html).toContain("analysis-job-missing");
    expect(html).not.toContain("Selected Analysis Job");
  });

  it("shows unavailable state instead of not-found when results cannot be loaded", async () => {
    stubAnalysisStudioFetch({ resultsOk: false });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisResultId:
              "analysis-result-20260614T130000Z-dinov3_vits_384",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis Results unavailable");
    expect(html).not.toContain("Analysis Result not found");
  });
});
