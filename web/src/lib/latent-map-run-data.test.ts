import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadLatentMapRunExportedViewerData } from "@/lib/latent-map-run-data";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("loadLatentMapRunExportedViewerData", () => {
  it("loads the selected DINOv3 recipe layout, cluster result, and FAISS index", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "latent-map-run-"));

    await mkdir(path.join(runDir, "clusters"));
    await mkdir(path.join(runDir, "embeddings"));
    await mkdir(path.join(runDir, "indexes"));
    await mkdir(path.join(runDir, "layouts"));
    await Promise.all(
      [32, 64, 96].map((tileSize) =>
        mkdir(path.join(runDir, "viewer", "atlases", `${tileSize}px`), {
          recursive: true,
        }),
      ),
    );

    await writeFile(
      path.join(runDir, "manifest.jsonl"),
      [
        JSON.stringify({
          height: 600,
          image_id: "img_1",
          preview_path: "previews/img_1.jpg",
          relative_path: "set/img_1.jpg",
          thumbnail_path: "thumbnails/img_1.jpg",
          width: 800,
        }),
        JSON.stringify({
          height: 400,
          image_id: "img_2",
          preview_path: "previews/img_2.jpg",
          relative_path: "set/img_2.jpg",
          thumbnail_path: "thumbnails/img_2.jpg",
          width: 500,
        }),
      ].join("\n"),
      "utf-8",
    );
    await writeJson(path.join(runDir, "embeddings", "dinov3_vits_256.json"), {
      model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
      recipe_name: "dinov3_vits_256",
    });
    await writeJson(path.join(runDir, "embeddings", "dinov3_vits_384.json"), {
      model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
      recipe_name: "dinov3_vits_384",
    });
    await writeJson(
      path.join(runDir, "layouts", "dinov3_vits_256_umap_a.json"),
      {
        layout_id: "umap_a",
        method: "umap",
        params: { n_neighbors: 15 },
        points: [{ image_id: "img_1", x: 1, y: 2 }],
        recipe_name: "dinov3_vits_256",
        run_id: "test-run",
      },
    );
    await writeJson(
      path.join(runDir, "layouts", "dinov3_vits_384_umap_a.json"),
      {
        layout_id: "umap_a",
        method: "umap",
        params: { n_neighbors: 15 },
        points: [{ image_id: "img_1", x: 3, y: 4 }],
        recipe_name: "dinov3_vits_384",
        run_id: "test-run",
      },
    );
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_kmeans_a.json"),
      {
        cluster_count: 2,
        cluster_id: "kmeans_a",
        method: "kmeans",
        points: [{ cluster_id: 7, image_id: "img_1" }],
        random_state: 42,
        recipe_name: "dinov3_vits_384",
        run_id: "test-run",
      },
    );
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_hdbscan_balanced.json"),
      {
        asset_kind: "latent-map-cluster-result",
        cluster_count: 1,
        cluster_id: "hdbscan_balanced_mcs25_ms10_eom",
        groups: [
          {
            cluster_id: 0,
            count: 1,
            group_key: "cluster:0",
            kind: "cluster",
            label: "Group 0",
          },
        ],
        label: "HDBSCAN · Balanced",
        method: "hdbscan",
        params: { preset: "balanced" },
        points: [
          {
            cluster_id: 0,
            group_key: "cluster:0",
            image_id: "img_1",
            membership: 0.92,
          },
        ],
        recipe_name: "dinov3_vits_384",
        run_id: "test-run",
        schema_version: 1,
        unassigned_count: 0,
      },
    );
    await writeJson(
      path.join(runDir, "clusters", "dinov3_vits_384_graph_balanced.json"),
      {
        asset_kind: "latent-map-cluster-result",
        cluster_count: 1,
        cluster_id: "graph_communities_balanced_k8_res0p6_min2",
        groups: [
          {
            cluster_id: 0,
            count: 1,
            group_key: "cluster:0",
            kind: "cluster",
            label: "Group 0",
          },
        ],
        label: "Graph communities · Balanced",
        method: "graph_communities",
        params: {
          algorithm: "weighted_label_propagation",
          k: 8,
          max_iterations: 30,
          min_group_size: 2,
          min_score: 0,
          preset: "balanced",
          resolution: 0.6,
        },
        points: [
          {
            cluster_id: 0,
            group_key: "cluster:0",
            image_id: "img_1",
          },
        ],
        recipe_name: "dinov3_vits_384",
        run_id: "test-run",
        schema_version: 1,
        unassigned_count: 0,
      },
    );
    await writeFile(
      path.join(runDir, "indexes", "dinov3_vits_384_neighbors.jsonl"),
      `${JSON.stringify({
        image_id: "img_1",
        neighbor_image_id: "img_2",
        neighbor_rank: 1,
        score: 0.9,
      })}\n`,
      "utf-8",
    );
    await Promise.all(
      [32, 64, 96].map((tileSize) =>
        writeJson(
          path.join(
            runDir,
            "viewer",
            "atlases",
            `${tileSize}px`,
            "atlas-manifest.json",
          ),
          {
            asset_kind: "latent-map-thumbnail-atlas",
            atlas_size: 2048,
            image_count: 2,
            items: [],
            page_count: 0,
            pages: [],
            run_id: "test-run",
            schema_version: 1,
            tile_size: tileSize,
          },
        ),
      ),
    );

    const data = await loadLatentMapRunExportedViewerData({
      runDir,
      selectedClusterId: "hdbscan_balanced_mcs25_ms10_eom",
      selectedLayoutId: "umap_a",
      selectedRecipeName: "dinov3_vits_384",
    });

    expect(data).toMatchObject({
      cluster_id: "hdbscan_balanced_mcs25_ms10_eom",
      cluster_result: {
        cluster_id: "hdbscan_balanced_mcs25_ms10_eom",
        groups: [
          {
            cluster_id: 0,
            count: 1,
            group_key: "cluster:0",
            kind: "cluster",
            label: "Group 0",
          },
        ],
        label: "HDBSCAN · Balanced",
        method: "hdbscan",
        params: { preset: "balanced" },
        unassigned_count: 0,
      },
      layout_id: "umap_a",
      neighbor_index_path: "indexes/dinov3_vits_384_neighbors.jsonl",
      recipe_name: "dinov3_vits_384",
      thumbnail_atlas_manifest_path: "viewer/atlases/64px/atlas-manifest.json",
      thumbnail_atlas_manifest_paths: {
        "32": "viewer/atlases/32px/atlas-manifest.json",
        "64": "viewer/atlases/64px/atlas-manifest.json",
        "96": "viewer/atlases/96px/atlas-manifest.json",
      },
    });
    expect(data.available_recipes).toEqual([
      expect.objectContaining({
        family: "dinov3",
        long_edge: 256,
        recipe_name: "dinov3_vits_256",
      }),
      expect.objectContaining({
        family: "dinov3",
        long_edge: 384,
        recipe_name: "dinov3_vits_384",
      }),
    ]);
    expect(data.points).toEqual([
      expect.objectContaining({
        cluster_group_key: "cluster:0",
        cluster_id: 0,
        cluster_membership: 0.92,
        image_id: "img_1",
        preview_path: "previews/img_1.jpg",
        relative_path: "set/img_1.jpg",
        thumbnail_path: "thumbnails/img_1.jpg",
        x: 3,
        y: 4,
      }),
    ]);
    expect(data.available_clusters?.map((cluster) => cluster.cluster_id)).toEqual([
      "graph_communities_balanced_k8_res0p6_min2",
      "hdbscan_balanced_mcs25_ms10_eom",
      "kmeans_a",
    ]);
  });
});
