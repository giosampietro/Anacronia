import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { listAnalysisResults } from "@/lib/analysis-results-browser";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("listAnalysisResults", () => {
  it("lists durable Analysis Results with status and Explorer hrefs", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-results-"));
    const readyRunDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const staleRunDir = path.join(runsRoot, "20260610T123000Z-other");

    await mkdir(readyRunDir, { recursive: true });
    await mkdir(staleRunDir, { recursive: true });
    await writeFile(path.join(readyRunDir, "manifest.jsonl"), "", "utf-8");
    await writeJson(path.join(readyRunDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      item_count: 2,
      recipes: [
        {
          recipe_name: "dinov3_vits_384",
          artifact_keys: {
            thumbnail_atlas_manifests: {
              "32": "viewer/atlases/32px/atlas-manifest.json",
              "64": "viewer/atlases/64px/atlas-manifest.json",
              "96": "viewer/atlases/96px/atlas-manifest.json",
            },
          },
        },
      ],
      source: {
        kind: "legacy-latent-map-run",
        run_id: "20260609T123000Z-j-shoot",
        source_folder_name: "source-images",
      },
      status: "ready",
      artifacts: [{ key: "manifest.jsonl", role: "image-manifest" }],
    });
    await writeJson(path.join(staleRunDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260610T123000Z-other",
      item_count: 0,
      recipes: [],
      source: {
        kind: "legacy-latent-map-run",
        run_id: "20260610T123000Z-other",
        source_folder_name: "other-source",
      },
      status: "failed",
      artifacts: [],
    });

    const results = await listAnalysisResults({ runsRoot });

    expect(results).toEqual([
      {
        analysisResultId: "latent-map-20260610T123000Z-other",
        atlasTileSizes: [],
        canOpenExplorer: false,
        explorerHref:
          "/latent-map?analysisResultId=latent-map-20260610T123000Z-other",
        itemCount: 0,
        recipeNames: [],
        runId: "20260610T123000Z-other",
        sourceFolderName: "other-source",
        state: "failed",
      },
      {
        analysisResultId: "latent-map-20260609T123000Z-j-shoot",
        atlasTileSizes: [32, 64, 96],
        canOpenExplorer: true,
        explorerHref:
          "/latent-map?analysisResultId=latent-map-20260609T123000Z-j-shoot",
        itemCount: 2,
        recipeNames: ["dinov3_vits_384"],
        runId: "20260609T123000Z-j-shoot",
        sourceFolderName: "source-images",
        state: "ready",
      },
    ]);
  });

  it("lists legacy runs and durable job results from separate roots", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-results-"));
    const jobResultsRoot = await mkdtemp(
      path.join(os.tmpdir(), "analysis-job-results-"),
    );
    const legacyRunDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const jobResultDir = path.join(
      jobResultsRoot,
      "analysis-result-20260614T130000Z-dinov3_vits_384",
    );

    await mkdir(legacyRunDir, { recursive: true });
    await mkdir(jobResultDir, { recursive: true });
    await writeFile(path.join(legacyRunDir, "manifest.jsonl"), "", "utf-8");
    await writeFile(path.join(jobResultDir, "manifest.jsonl"), "", "utf-8");
    await writeJson(path.join(legacyRunDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      item_count: 2,
      recipes: [{ recipe_name: "dinov3_vits_384" }],
      source: {
        run_id: "20260609T123000Z-j-shoot",
        source_folder_name: "J Shoot",
      },
      status: "ready",
      artifacts: [{ key: "manifest.jsonl", role: "image-manifest" }],
    });
    await writeJson(path.join(jobResultDir, "analysis-result.json"), {
      analysis_result_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
      item_count: 1,
      recipes: [{ recipe_name: "dinov3_vits_384" }],
      source: {
        run_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
        source_folder_name: "Analysis Board",
      },
      status: "ready",
      artifacts: [{ key: "manifest.jsonl", role: "image-manifest" }],
    });

    const results = await listAnalysisResults({
      additionalRunsRoots: [jobResultsRoot],
      runsRoot,
    });

    expect(results.map((result) => result.analysisResultId).sort()).toEqual([
      "analysis-result-20260614T130000Z-dinov3_vits_384",
      "latent-map-20260609T123000Z-j-shoot",
    ]);
  });
});
