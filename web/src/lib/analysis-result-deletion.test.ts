import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  UnsafeAnalysisResultDeletionError,
  deleteAnalysisResult,
  planAnalysisResultDeletion,
} from "@/lib/analysis-result-deletion";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

async function writeArtifact(runDir: string, key: string, content = "artifact") {
  const filePath = path.join(runDir, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createDeletionFixture() {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-delete-"));
  const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
  const sourceDerivative = path.join(runsRoot, "source-assets", "thumb.jpg");
  const analysisResultId = "latent-map-20260609T123000Z-j-shoot";

  await mkdir(runDir, { recursive: true });
  await mkdir(path.dirname(sourceDerivative), { recursive: true });
  await writeFile(sourceDerivative, "source derivative", "utf-8");
  await writeArtifact(runDir, "manifest.jsonl");
  await writeArtifact(runDir, "clusters/dinov3_hdbscan.json");
  await writeArtifact(runDir, "viewer/atlases/64px/page-000.png");
  await writeArtifact(runDir, "previews/img_001.jpg");
  await writeArtifact(runDir, "embeddings/dinov3_vits_384.npy");
  await writeArtifact(runDir, "source/original.jpg");
  await writeJson(path.join(runDir, "analysis-result.json"), {
    analysis_result_id: analysisResultId,
    item_count: 1,
    recipes: [{ recipe_name: "dinov3_vits_384" }],
    source: {
      run_id: "20260609T123000Z-j-shoot",
      source_folder_name: "J Shoot",
    },
    status: "ready",
    artifacts: [
      {
        key: "manifest.jsonl",
        retention_class: "durable",
        role: "image-manifest",
      },
      {
        key: "clusters/dinov3_hdbscan.json",
        retention_class: "durable",
        role: "cluster-result",
      },
      {
        key: "viewer/atlases/64px/page-000.png",
        retention_class: "render-cache",
        role: "thumbnail-atlas",
      },
      {
        key: "viewer/atlases/128px/page-000.png",
        retention_class: "render-cache",
        role: "thumbnail-atlas",
      },
      {
        key: "previews/img_001.jpg",
        retention_class: "render-cache",
        role: "preview",
      },
      {
        key: "embeddings/dinov3_vits_384.npy",
        retention_class: "durable",
        role: "embedding",
      },
      {
        key: "source/original.jpg",
        retention_class: "durable",
        role: "source-image",
      },
    ],
  });

  return { analysisResultId, runDir, runsRoot, sourceDerivative };
}

describe("Analysis Result deletion", () => {
  it("plans durable artifact deletion separately from render-cache deletion", async () => {
    const { analysisResultId, runsRoot } = await createDeletionFixture();

    const plan = await planAnalysisResultDeletion({
      analysisResultId,
      runsRoot,
    });

    expect(plan.deleteDurableArtifactKeys).toEqual([
      "clusters/dinov3_hdbscan.json",
      "manifest.jsonl",
    ]);
    expect(plan.deleteRenderCacheKeys).toEqual([
      "previews/img_001.jpg",
      "viewer/atlases/128px/page-000.png",
      "viewer/atlases/64px/page-000.png",
    ]);
    expect(plan.missingArtifactKeys).toEqual([
      "viewer/atlases/128px/page-000.png",
    ]);
    expect(plan.preserveArtifactKeys).toEqual([
      "embeddings/dinov3_vits_384.npy",
      "source/original.jpg",
    ]);
  });

  it("marks the selected result deleted while preserving source material and embeddings", async () => {
    const { analysisResultId, runDir, runsRoot, sourceDerivative } =
      await createDeletionFixture();

    const summary = await deleteAnalysisResult({
      analysisResultId,
      deletedAt: new Date("2026-06-14T09:15:00Z"),
      runsRoot,
    });

    expect(summary.deleted).toBe(true);
    expect(summary.deletedDurableArtifactKeys).toEqual([
      "clusters/dinov3_hdbscan.json",
      "manifest.jsonl",
    ]);
    expect(summary.deletedRenderCacheKeys).toEqual([
      "previews/img_001.jpg",
      "viewer/atlases/64px/page-000.png",
    ]);
    expect(summary.missingArtifactKeys).toEqual([
      "viewer/atlases/128px/page-000.png",
    ]);
    expect(await fileExists(path.join(runDir, "manifest.jsonl"))).toBe(false);
    expect(
      await fileExists(path.join(runDir, "clusters/dinov3_hdbscan.json")),
    ).toBe(false);
    expect(
      await fileExists(path.join(runDir, "viewer/atlases/64px/page-000.png")),
    ).toBe(false);
    expect(
      await fileExists(path.join(runDir, "embeddings/dinov3_vits_384.npy")),
    ).toBe(true);
    expect(await fileExists(path.join(runDir, "source/original.jpg"))).toBe(
      true,
    );
    expect(await fileExists(sourceDerivative)).toBe(true);

    const manifest = JSON.parse(
      await readFile(path.join(runDir, "analysis-result.json"), "utf-8"),
    ) as {
      deleted_at?: string;
      deletion?: {
        deleted_durable_artifact_keys?: string[];
        preserved_artifact_keys?: string[];
      };
      status?: string;
    };
    expect(manifest.status).toBe("deleted");
    expect(manifest.deleted_at).toBe("2026-06-14T09:15:00.000Z");
    expect(manifest.deletion?.deleted_durable_artifact_keys).toEqual([
      "clusters/dinov3_hdbscan.json",
      "manifest.jsonl",
    ]);
    expect(manifest.deletion?.preserved_artifact_keys).toEqual([
      "embeddings/dinov3_vits_384.npy",
      "source/original.jpg",
    ]);
  });

  it("rejects unsafe artifact keys before deleting anything", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-delete-unsafe-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    await mkdir(runDir, { recursive: true });
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      status: "ready",
      artifacts: [
        {
          key: "../outside.txt",
          retention_class: "durable",
          role: "cluster-result",
        },
      ],
    });

    await expect(
      planAnalysisResultDeletion({
        analysisResultId: "latent-map-20260609T123000Z-j-shoot",
        runsRoot,
      }),
    ).rejects.toThrow(UnsafeAnalysisResultDeletionError);
  });
});
