import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

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
  });

  it("renders existing Analysis Results with Explorer links", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-results-page-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
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

    const html = renderToString(await AnalysisResultsPage());

    expect(html).toContain("Analysis Results");
    expect(html).toContain("J Shoot");
    expect(html).toContain("dinov3_vits_384");
    expect(html).toContain("3184 images");
    expect(html).toContain("ready");
    expect(html).toContain(
      "/latent-map?analysisResultId=latent-map-20260609T123000Z-j-shoot",
    );
  });
});
