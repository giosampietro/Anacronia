import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAnalysisStudioReadModel } from "@/lib/analysis-studio-read-model";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("Analysis Studio read model", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads browser-safe collections, recipes, jobs, results, artifact health, storage, and selected state without computation", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-studio-"));
    const runDir = path.join(
      runsRoot,
      "analysis-result-20260614T130000Z-dinov3_vits_384",
    );

    await mkdir(path.join(runDir, "viewer/atlases/32px"), {
      recursive: true,
    });
    await writeFile(path.join(runDir, "manifest.jsonl"), "{}", "utf-8");
    await writeFile(
      path.join(runDir, "viewer/atlases/32px/atlas-manifest.json"),
      "{}",
      "utf-8",
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_job_id: "analysis-job-20260614T130000Z",
      analysis_result_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
      artifacts: [
        {
          key: "manifest.jsonl",
          required: true,
          retention_class: "durable",
          role: "image-manifest",
        },
        {
          key: "viewer/atlases/32px/atlas-manifest.json",
          required: false,
          retention_class: "render-cache",
          role: "thumbnail-atlas",
        },
      ],
      item_count: 2,
      recipes: [{ recipe_name: "dinov3_vits_384" }],
      source: {
        kind: "analysis-scope-snapshot",
        run_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
        source_folder_name: "Bread",
      },
      status: "ready",
      staleness: {
        added_image_count: 0,
        removed_image_count: 0,
        state: "current",
      },
    });

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
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const model = await loadAnalysisStudioReadModel({
      runsRoot,
      searchParams: {
        analysisResultId: "analysis-result-20260614T130000Z-dinov3_vits_384",
      },
    });

    expect(model.collections).toEqual([
      {
        label: "Bread",
        slug: "bread",
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
        missingOptionalArtifactKeys: [],
        missingRequiredArtifactKeys: [],
      },
      artifactKeys: [
        "manifest.jsonl",
        "viewer/atlases/32px/atlas-manifest.json",
      ],
      explorerHref:
        "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
      itemCount: 2,
      recipeLabels: ["DINOv3 ViT-S 384px"],
      scopeLabel: "Bread",
      staleness: {
        addedImageCount: 0,
        removedImageCount: 0,
        state: "current",
      },
    });
    expect(model.results[0].storageTotals.totalBytes).toBeGreaterThan(0);
    expect(model.selectedState).toEqual({
      analysisResultId: "analysis-result-20260614T130000Z-dinov3_vits_384",
      state: "selected-result",
    });
    expect(model.selectedResult?.analysisResultId).toBe(
      "analysis-result-20260614T130000Z-dinov3_vits_384",
    );
    expect(JSON.stringify(model)).not.toContain(runsRoot);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
