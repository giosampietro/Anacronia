import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createLocalAnalysisResultStore } from "@/lib/analysis-result-store";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("Local Analysis Result store", () => {
  it("lists, checks status, and resolves artifacts through one interface", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-store-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const artifactKey = "viewer/atlases/64px/page-000.png";

    await mkdir(path.dirname(path.join(runDir, artifactKey)), {
      recursive: true,
    });
    await writeFile(path.join(runDir, "manifest.jsonl"), "", "utf-8");
    await writeFile(path.join(runDir, artifactKey), "png-bytes", "utf-8");
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      artifacts: [
        { key: "manifest.jsonl", role: "image-manifest" },
        {
          content_type: "image/png",
          key: artifactKey,
          retention_class: "render-cache",
          role: "thumbnail-atlas",
        },
      ],
      item_count: 1,
      recipes: [{ recipe_name: "dinov3_vits_384" }],
      source: {
        kind: "legacy-latent-map-run",
        run_id: "20260609T123000Z-j-shoot",
        source_folder_name: "J Shoot",
      },
      status: "ready",
    });

    const store = createLocalAnalysisResultStore({ runsRoot });

    await expect(store.list()).resolves.toMatchObject([
      {
        analysisResultId: "latent-map-20260609T123000Z-j-shoot",
        itemCount: 1,
        recipeNames: ["dinov3_vits_384"],
        runId: "20260609T123000Z-j-shoot",
        sourceFolderName: "J Shoot",
        state: "ready",
      },
    ]);
    await expect(
      store.loadStatus("latent-map-20260609T123000Z-j-shoot"),
    ).resolves.toMatchObject({
      canOpenExplorer: true,
      state: "ready",
    });
    await expect(
      store.resolveRunDir("latent-map-20260609T123000Z-j-shoot"),
    ).resolves.toBe(runDir);
    await expect(
      store.resolveArtifact({
        analysisResultId: "latent-map-20260609T123000Z-j-shoot",
        artifactKey,
      }),
    ).resolves.toEqual({
      contentType: "image/png",
      filePath: path.join(runDir, artifactKey),
    });
  });

  it("plans and deletes result artifacts through the same interface", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-store-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const analysisResultId = "latent-map-20260609T123000Z-j-shoot";
    const store = createLocalAnalysisResultStore({ runsRoot });

    await mkdir(path.join(runDir, "viewer/atlases/64px"), { recursive: true });
    await mkdir(path.join(runDir, "embeddings"), { recursive: true });
    await writeFile(path.join(runDir, "manifest.jsonl"), "", "utf-8");
    await writeFile(
      path.join(runDir, "viewer/atlases/64px/page-000.png"),
      "atlas",
      "utf-8",
    );
    await writeFile(
      path.join(runDir, "embeddings/dinov3_vits_384.npy"),
      "embedding",
      "utf-8",
    );
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: analysisResultId,
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
      status: "ready",
    });

    await expect(store.planDeletion(analysisResultId)).resolves.toMatchObject({
      deleteDurableArtifactKeys: ["manifest.jsonl"],
      deleteRenderCacheKeys: ["viewer/atlases/64px/page-000.png"],
      preserveArtifactKeys: ["embeddings/dinov3_vits_384.npy"],
    });

    const summary = await store.deleteResult({
      analysisResultId,
      deletedAt: new Date("2026-06-14T15:00:00Z"),
    });

    expect(summary.deleted).toBe(true);
    expect(await fileExists(path.join(runDir, "manifest.jsonl"))).toBe(false);
    expect(
      await fileExists(path.join(runDir, "viewer/atlases/64px/page-000.png")),
    ).toBe(false);
    expect(
      await fileExists(path.join(runDir, "embeddings/dinov3_vits_384.npy")),
    ).toBe(true);
    await expect(store.list()).resolves.toEqual([]);
    await expect(
      JSON.parse(await readFile(path.join(runDir, "analysis-result.json"), "utf-8")),
    ).toMatchObject({
      deleted_at: "2026-06-14T15:00:00.000Z",
      status: "deleted",
    });
  });
});
