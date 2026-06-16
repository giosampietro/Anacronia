import { renderToString } from "react-dom/server";
import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import AnalysisResultsPage, { createAnalysisAction } from "@/app/analysis-results/page";

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

function stubAnalysisStudioFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

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
            {
              analysis_id: "analysis-20260614T140000Z",
              analysis_job_ids: ["analysis-job-20260614T140000Z"],
              recipe_ids: ["dinov3_vits_512"],
              source_collections: [
                { label: "Bread", slug: "bread" },
                { label: "Hands/Mani", slug: "hands-mani" },
              ],
              status: "running",
              title: "DINO comparison",
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
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
              explorer_readiness: { ready: true },
              item_count: 40,
              recipe_ids: ["dinov3_vits_384"],
              recipe_names: ["dinov3_vits_384"],
              result_state: { state: "ready" },
              scope_label: "Bread",
              status: "ready",
            },
          ],
        });
      }

      if (url.endsWith("/search-sets")) {
        return Response.json([
          { display_name: "Bread", slug: "bread", terms: [] },
          { display_name: "Hands/Mani", slug: "hands-mani", terms: [] },
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
            {
              analysis_job_id: "analysis-job-20260614T140000Z",
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
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

describe("AnalysisResultsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Analysis Studio workspace shell around persistent Analyses", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T130000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"analysis\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("aria-label=\"Workspace\"");
    expect(html).toContain("Analysis Studio");
    expect(html).toContain(">New Analysis<");
    expect(html).toContain(">Analyses<");
    expect(html).toContain("aria-label=\"Filter Analyses\"");
    expect(html).toContain("placeholder=\"Filter by title or collection\"");
    expect(html).toContain(
      "href=\"/analysis-results?analysisId=analysis-20260614T130000Z\"",
    );
    expect(html).toContain("Bread visual study");
    expect(html).toContain("DINO comparison");
    expect(html).toContain("DINO comparison in progress");
    expect(html).toContain("40 images analyzed");
    expect(html).toContain("Selected Analysis overview");
    expect(html).toContain("Source Collections");
    expect(html).toContain("Job activity");
    expect(html).toContain("analysis-job-20260614T130000Z");
    expect(html).toContain("Variants");
    expect(html).toContain("DINOv3 ViT-S 384px");
    expect(html).toContain("40 images");
    expect(html).toContain("Open Explorer");
    expect(html).toContain(
      "href=\"/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384\"",
    );
    expect(html).toContain("ready");
    expect(html).not.toContain(">Analysis Results<");
    expect(html).not.toContain(">Jobs<");
    expect(html).not.toContain("Start Analysis Job");
    expect(html).not.toContain("Submitted Jobs");
  });

  it("renders missing selected Analysis explicitly instead of selecting the first Analysis", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-missing",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis not found");
    expect(html).toContain("analysis-missing");
    expect(html).not.toContain("Selected Analysis overview");
  });

  it("renders the New Analysis form with title, Collections, and recipe controls", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            mode: "new-analysis",
          }),
        }),
      ),
    );

    expect(html).toContain("Name the Analysis");
    expect(html).toContain("Analysis title");
    expect(html).toContain("Bread visual study");
    expect(html).toContain("Choose Collections");
    expect(html).toContain("Collection 1");
    expect(html).toContain("Add Collection");
    expect(html).toContain("Scope preview");
    expect(html).toContain("Choose Recipes");
    expect(html).toContain("DINOv3 ViT-S 384px");
    expect(html).toContain("384px image embeddings");
    expect(html).toContain("Start analysis");
    expect(html).not.toContain("Choose a title, collections, and recipes.");
  });

  it("submits New Analysis form data and redirects to the created Analysis", async () => {
    const fetchMock = vi.fn(async () => (
      Response.json(
        {
          analysis: {
            analysis_id: "analysis-20260616T210000Z",
          },
          initial_analysis_job: {
            analysis_job_id: "analysis-job-20260616T210000Z",
            status: "running",
          },
        },
        { status: 201 },
      )
    ));
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("title", "Bread visual study");
    form.append("collection_slugs", "bread");
    form.append("collection_slugs", "hands-mani");
    form.append("collection_slugs", "bread");
    form.append("recipe_ids", "dinov3_vits_384");
    form.append("recipe_ids", "dinov3_vits_512");

    await createAnalysisAction(form);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/analyses",
      {
        body: JSON.stringify({
          collection_slugs: ["bread", "hands-mani"],
          recipe_ids: ["dinov3_vits_384", "dinov3_vits_512"],
          start_job: true,
          title: "Bread visual study",
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(redirect).toHaveBeenCalledWith(
      "/analysis-results?analysisId=analysis-20260616T210000Z",
    );
  });
});
