import { describe, expect, it } from "vitest";

import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  createLatentMapFilterOptions,
  filterLatentMapViewerData,
  getLatentMapSourceGroup,
  parseLatentMapUrlState,
  serializeLatentMapUrlState,
} from "@/lib/latent-map-viewer-state";

describe("latent map viewer state", () => {
  it("derives cluster and source-folder filter options from viewer data", () => {
    expect(createLatentMapFilterOptions(latentMapFixture)).toEqual({
      groups: [
        {
          cluster_id: 0,
          count: 3,
          group_key: "0",
          kind: "cluster",
          label: "Group 0",
        },
        {
          cluster_id: 1,
          count: 3,
          group_key: "1",
          kind: "cluster",
          label: "Group 1",
        },
        {
          cluster_id: 2,
          count: 2,
          group_key: "2",
          kind: "cluster",
          label: "Group 2",
        },
      ],
      sources: ["set-a", "set-b", "set-c"],
    });
  });

  it("groups flat files under root instead of creating one source per filename", () => {
    expect(getLatentMapSourceGroup("plain-file.jpg")).toBe("root");
    expect(getLatentMapSourceGroup("folder/plain-file.jpg")).toBe("folder");
  });

  it("filters points by source without applying group focus as a data filter", () => {
    const filtered = filterLatentMapViewerData(latentMapFixture, {
      clusterFilter: "1",
      sourceFilter: "set-a",
    });

    expect(filtered.run_id).toBe(latentMapFixture.run_id);
    expect(filtered.points.map((point) => point.image_id)).toEqual([
      "img_saffron",
      "img_amber",
      "img_vermilion",
    ]);
  });

  it("parses durable URL state with validated mode, thumbnail size, filters, camera, and selection", () => {
    expect(
      parseLatentMapUrlState(
        new URLSearchParams(
          "mode=thumbnails&thumb=96&neighbors=50&relation=both&selected=img_saffron&cluster=0&source=set-a&x=0.2&y=-0.1&z=24",
        ),
        latentMapFixture,
      ),
    ).toEqual({
      clusterFilter: "0",
      faissNeighborCount: 50,
      faissRelationMode: "both",
      renderMode: "thumbnails",
      selectedImageId: "img_saffron",
      sourceFilter: "set-a",
      textureDetail: "auto",
      thumbnailSize: 96,
      view: {
        offsetX: 0.2,
        offsetY: -0.1,
        zoom: 24,
      },
    });
  });

  it("ignores invalid URL state instead of restoring impossible filters or selections", () => {
    expect(
      parseLatentMapUrlState(
        new URLSearchParams(
          "mode=bad&thumb=512&neighbors=500&relation=sideways&selected=missing&cluster=99&source=missing&x=nope&z=-1",
        ),
        latentMapFixture,
      ),
    ).toEqual({
      clusterFilter: "all",
      faissNeighborCount: 20,
      faissRelationMode: "closest",
      renderMode: "points",
      selectedImageId: null,
      sourceFilter: "all",
      textureDetail: "auto",
      thumbnailSize: 64,
      view: {
        offsetX: 0,
        offsetY: 0,
        zoom: 1,
      },
    });
  });

  it("serializes durable URL state with run, recipe, layout, and cluster-result identity", () => {
    expect(
      serializeLatentMapUrlState(
        {
          clusterFilter: "1",
          faissNeighborCount: 5,
          faissRelationMode: "opposite",
          renderMode: "thumbnails",
          selectedImageId: "img_cobalt",
          sourceFilter: "set-b",
          textureDetail: 96,
          thumbnailSize: 32,
          view: {
            offsetX: 0.125,
            offsetY: -0.25,
            zoom: 1.5,
          },
        },
        latentMapFixture,
      ).toString(),
    ).toBe(
      "run=prototype-fixture-8&recipe=dinov3_vits_256&layout=umap_n4_mindist0p05_seed42&clusterResult=kmeans_k3_seed42&mode=thumbnails&thumb=32&detail=96&neighbors=5&relation=opposite&selected=img_cobalt&cluster=1&source=set-b&x=0.125&y=-0.25&z=1.5",
    );
  });

  it("serializes Analysis Result URL state without downgrading to legacy run identity", () => {
    expect(
      serializeLatentMapUrlState(
        {
          clusterFilter: "all",
          faissNeighborCount: 20,
          faissRelationMode: "closest",
          renderMode: "thumbnails",
          selectedImageId: "img_cobalt",
          sourceFilter: "all",
          textureDetail: "auto",
          thumbnailSize: 64,
          view: {
            offsetX: 0,
            offsetY: 0,
            zoom: 1,
          },
        },
        {
          ...latentMapFixture,
          analysis_result_id: "latent-map-real-run",
          run_id: "real-run",
        },
      ).toString(),
    ).toBe(
      "analysisResultId=latent-map-real-run&recipe=dinov3_vits_256&layout=umap_n4_mindist0p05_seed42&clusterResult=kmeans_k3_seed42&mode=thumbnails&thumb=64&detail=auto&neighbors=20&relation=closest&selected=img_cobalt",
    );
  });

  it("parses manual texture detail only when the run advertises that atlas", () => {
    expect(
      parseLatentMapUrlState(
        new URLSearchParams("mode=thumbnails&thumb=32&detail=96"),
        {
          ...latentMapFixture,
          thumbnail_atlases: [
            {
              schema_version: 1,
              asset_kind: "latent-map-thumbnail-atlas",
              run_id: latentMapFixture.run_id,
              tile_size: 96,
              atlas_size: 512,
              image_count: 0,
              page_count: 0,
              pages: [],
              items: [],
            },
          ],
        },
      ).textureDetail,
    ).toBe(96);
    expect(
      parseLatentMapUrlState(
        new URLSearchParams("mode=thumbnails&thumb=32&detail=128"),
        latentMapFixture,
      ).textureDetail,
    ).toBe("auto");
  });
});
