import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DELETE, POST } from "./route";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

async function writeArtifact(runDir: string, key: string) {
  const filePath = path.join(runDir, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "artifact", "utf-8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createResult() {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-route-delete-"));
  const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
  const analysisResultId = "latent-map-20260609T123000Z-j-shoot";

  await mkdir(runDir, { recursive: true });
  await writeArtifact(runDir, "manifest.jsonl");
  await writeArtifact(runDir, "viewer/atlases/64px/page-000.png");
  await writeArtifact(runDir, "embeddings/dinov3_vits_384.npy");
  await writeJson(path.join(runDir, "analysis-result.json"), {
    analysis_result_id: analysisResultId,
    status: "ready",
    artifacts: [
      {
        key: "manifest.jsonl",
        retention_class: "durable",
        role: "image-manifest",
      },
      {
        key: "viewer/atlases/64px/page-000.png",
        retention_class: "render-cache",
        role: "thumbnail-atlas",
      },
      {
        key: "embeddings/dinov3_vits_384.npy",
        retention_class: "durable",
        role: "embedding",
      },
    ],
  });

  return { analysisResultId, runDir, runsRoot };
}

describe("Analysis Result delete API", () => {
  const previousRunsRoot = process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;

  afterEach(() => {
    if (previousRunsRoot === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
    } else {
      process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = previousRunsRoot;
    }
  });

  it("deletes a result by ID and returns a retention summary", async () => {
    const { analysisResultId, runDir, runsRoot } = await createResult();
    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;

    const response = await DELETE(
      new Request(`http://localhost/api/analysis-results/${analysisResultId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ analysisResultId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      analysis_result_id: analysisResultId,
      deleted: true,
      deleted_durable_artifact_keys: ["manifest.jsonl"],
      deleted_render_cache_keys: ["viewer/atlases/64px/page-000.png"],
      preserved_artifact_keys: ["embeddings/dinov3_vits_384.npy"],
    });
    expect(await fileExists(path.join(runDir, "manifest.jsonl"))).toBe(false);
    expect(
      await fileExists(path.join(runDir, "embeddings/dinov3_vits_384.npy")),
    ).toBe(true);
  });

  it("supports the browser form POST path with a redirect", async () => {
    const { analysisResultId, runsRoot } = await createResult();
    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;

    const response = await POST(
      new Request(`http://localhost/api/analysis-results/${analysisResultId}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ analysisResultId }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/analysis-results");
  });
});
