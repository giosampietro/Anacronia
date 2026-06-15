import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import AnalysisResultsPage from "@/app/analysis-results/page";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("AnalysisResultsPage", () => {
  const previousRunsRoot = process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;

  afterEach(() => {
    if (previousRunsRoot === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
    } else {
      process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = previousRunsRoot;
    }
    vi.unstubAllGlobals();
  });

  it("renders existing Analysis Results with Explorer links", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-results-page-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
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
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "manifest.jsonl"), "", "utf-8");
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      item_count: 3184,
      recipes: [{ recipe_name: "dinov3_vits_384" }],
      source: {
        run_id: "20260609T123000Z-j-shoot",
        source_folder_name: "J Shoot",
      },
      status: "ready",
      artifacts: [{ key: "manifest.jsonl", role: "image-manifest" }],
    });

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
      "/latent-map?analysisResultId=latent-map-20260609T123000Z-j-shoot",
    );
    expect(html).toContain(
      "/api/analysis-results/latent-map-20260609T123000Z-j-shoot",
    );
    expect(html).toContain("Delete");
  });
});
