import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadAnalysisResultStatus,
  summarizeAnalysisResultStatus,
} from "@/lib/analysis-result-status";

describe("summarizeAnalysisResultStatus", () => {
  it("reports ready when declared durable artifacts are present", () => {
    const status = summarizeAnalysisResultStatus({
      existingArtifactKeys: new Set([
        "manifest.jsonl",
        "layouts/dinov3_vits_384_umap.json",
        "clusters/dinov3_vits_384_hdbscan.json",
        "indexes/dinov3_vits_384_flat_ip.faiss",
      ]),
      manifest: {
        artifacts: [
          { key: "manifest.jsonl", role: "image-manifest" },
          { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
          {
            key: "clusters/dinov3_vits_384_hdbscan.json",
            role: "cluster-result",
          },
          {
            key: "indexes/dinov3_vits_384_flat_ip.faiss",
            role: "faiss-index",
          },
        ],
        status: "ready",
      },
    });

    expect(status.state).toBe("ready");
    expect(status.canOpenExplorer).toBe(true);
    expect(status.relationAvailable).toBe(true);
  });

  it("does not block Explorer open when optional render caches are missing", () => {
    const status = summarizeAnalysisResultStatus({
      existingArtifactKeys: new Set([
        "manifest.jsonl",
        "layouts/dinov3_vits_384_umap.json",
        "clusters/dinov3_vits_384_hdbscan.json",
        "indexes/dinov3_vits_384_flat_ip.faiss",
      ]),
      manifest: {
        artifacts: [
          { key: "manifest.jsonl", role: "image-manifest" },
          { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
          {
            key: "clusters/dinov3_vits_384_hdbscan.json",
            role: "cluster-result",
          },
          {
            key: "indexes/dinov3_vits_384_flat_ip.faiss",
            role: "faiss-index",
          },
          {
            key: "viewer/atlases/128px/page-000.png",
            retention_class: "render-cache",
            role: "thumbnail-atlas",
          },
        ],
        status: "ready",
      },
    });

    expect(status.state).toBe("ready");
    expect(status.canOpenExplorer).toBe(true);
    expect(status.missingOptionalRenderCacheKeys).toEqual([
      "viewer/atlases/128px/page-000.png",
    ]);
  });

  it("marks relation lookup unavailable when declared FAISS artifacts are missing", () => {
    const status = summarizeAnalysisResultStatus({
      existingArtifactKeys: new Set([
        "manifest.jsonl",
        "layouts/dinov3_vits_384_umap.json",
        "clusters/dinov3_vits_384_hdbscan.json",
      ]),
      manifest: {
        artifacts: [
          { key: "manifest.jsonl", role: "image-manifest" },
          { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
          {
            key: "clusters/dinov3_vits_384_hdbscan.json",
            role: "cluster-result",
          },
          {
            key: "indexes/dinov3_vits_384_flat_ip.faiss",
            role: "faiss-index",
          },
        ],
        status: "ready",
      },
    });

    expect(status.state).toBe("incomplete");
    expect(status.canOpenExplorer).toBe(true);
    expect(status.relationAvailable).toBe(false);
    expect(status.missingRequiredRelationArtifactKeys).toEqual([
      "indexes/dinov3_vits_384_flat_ip.faiss",
    ]);
  });

  it("reports stale source membership without requiring recomputation", () => {
    const status = summarizeAnalysisResultStatus({
      currentImageIds: new Set(["img-b", "img-c"]),
      manifest: {
        artifacts: [],
        status: "ready",
      },
      snapshotImageIds: new Set(["img-a", "img-b"]),
    });

    expect(status.state).toBe("stale");
    expect(status.canOpenExplorer).toBe(true);
    expect(status.sourceChanges).toEqual({
      addedImageIds: ["img-c"],
      removedImageIds: ["img-a"],
    });
  });

  it("loads status from a manifest and existing files in a run directory", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "analysis-status-"));

    await mkdir(path.join(runDir, "manifest-dir"), { recursive: true });
    await writeFile(path.join(runDir, "manifest.jsonl"), "", "utf-8");
    await writeFile(
      path.join(runDir, "analysis-result.json"),
      JSON.stringify({
        artifacts: [
          { key: "manifest.jsonl", role: "image-manifest" },
          {
            key: "indexes/dinov3_vits_384_flat_ip.faiss",
            role: "faiss-index",
          },
          {
            key: "viewer/atlases/128px/page-000.png",
            retention_class: "render-cache",
            role: "thumbnail-atlas",
          },
        ],
        status: "ready",
      }),
      "utf-8",
    );

    const status = await loadAnalysisResultStatus({ runDir });

    expect(status.state).toBe("incomplete");
    expect(status.canOpenExplorer).toBe(true);
    expect(status.relationAvailable).toBe(false);
    expect(status.missingRequiredRelationArtifactKeys).toEqual([
      "indexes/dinov3_vits_384_flat_ip.faiss",
    ]);
    expect(status.missingOptionalRenderCacheKeys).toEqual([
      "viewer/atlases/128px/page-000.png",
    ]);
  });
});
