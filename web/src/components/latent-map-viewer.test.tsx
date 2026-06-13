import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LatentMapViewer } from "@/components/latent-map-viewer";
import { latentMapFixture } from "@/lib/latent-map-fixture";
import type {
  LatentMapGeneratedThumbnailAtlas,
  LatentMapThumbnailSize,
} from "@/lib/latent-map-viewer";

function createFixtureAtlas(
  tileSize: LatentMapThumbnailSize,
): LatentMapGeneratedThumbnailAtlas {
  return {
    schema_version: 1,
    asset_kind: "latent-map-thumbnail-atlas",
    run_id: latentMapFixture.run_id,
    tile_size: tileSize,
    atlas_size: 512,
    image_count: latentMapFixture.points.length,
    page_count: 1,
    pages: [
      {
        height: 512,
        index: 0,
        path: `/atlas-${tileSize}.png`,
        width: 512,
      },
    ],
    items: latentMapFixture.points.map((point, index) => {
      const columns = Math.floor(512 / tileSize);
      const column = index % columns;
      const row = Math.floor(index / columns);

      return {
        height: point.height,
        image_id: point.image_id,
        page_index: 0,
        page_path: `/atlas-${tileSize}.png`,
        source_thumbnail_path: point.thumbnail_path,
        tile_rect: [
          column * tileSize,
          row * tileSize,
          tileSize,
          tileSize,
        ] as [number, number, number, number],
        uv_rect: [0, 0, 0.125, 0.125] as [
          number,
          number,
          number,
          number,
        ],
        width: point.width,
      };
    }),
  };
}

describe("LatentMapViewer", () => {
  it("renders directly as a map surface with prototype fixture data", () => {
    const html = renderToString(<LatentMapViewer data={latentMapFixture} />)
      .replaceAll("<!-- -->", "");

    expect(html).toContain("Anacronia");
    expect(html).not.toContain("Latent Map");
    expect(html).toContain("data-slot=\"sidebar-inset\"");
    expect(html).not.toContain("Display");
    expect(html).toContain("data-testid=\"latent-map-display-controls\"");
    expect(html).toContain("data-testid=\"latent-map-canvas\"");
    expect(html).toContain("data-testid=\"latent-map-fps-counter\"");
    expect(html).toContain("bottom-3 right-3");
    expect(html).toContain("-- fps");
    expect(html).not.toContain("-- ms");
    expect(html).toContain("data-render-mode=\"points\"");
    expect(html).toContain("data-point-count=\"8\"");
    expect(html).toContain("data-runtime-average-frame-ms=\"0\"");
    expect(html).toContain("data-runtime-average-render-ms=\"0\"");
    expect(html).toContain("data-runtime-atlas-page-count=\"0\"");
    expect(html).toContain("data-runtime-draw-calls=\"0\"");
    expect(html).toContain("data-runtime-estimated-fps=\"0\"");
    expect(html).toContain("data-runtime-geometries=\"0\"");
    expect(html).toContain("data-runtime-last-render-ms=\"0\"");
    expect(html).toContain("data-runtime-loaded-thumbnails=\"0\"");
    expect(html).toContain("data-runtime-textures=\"0\"");
    expect(html).toContain("data-map-theme=\"dark\"");
    expect(html).toContain("data-neighborhood-active=\"false\"");
    expect(html).toContain("data-neighborhood-active-count=\"0\"");
    expect(html).toContain("data-neighborhood-mode=\"false\"");
    expect(html).toContain("data-neighborhood-row-count=\"0\"");
    expect(html).toContain("data-neighborhood-status=\"empty\"");
    expect(html).toContain("data-faiss-neighbor-count=\"20\"");
    expect(html).toContain("data-faiss-relation=\"closest\"");
    expect(html).toContain("data-ui-overlay-hidden=\"false\"");
    expect(html).toContain("data-thumbnail-count=\"0\"");
    expect(html).toContain("data-thumbnail-renderer=\"instanced-atlas\"");
    expect(html).toContain("data-thumbnail-sprite-baseline-draw-calls=\"0\"");
    expect(html).toContain("data-thumbnail-instanced-draw-calls=\"0\"");
    expect(html).not.toContain("data-selected-image-id=");
    expect(html).not.toContain("8 images");
    expect(html).toContain("DINOv3 · ViT-S · 256px");
    expect(html).toContain("UMAP · n=4 · min=0.05");
    expect(html).toContain("K-means · 3 clusters");
    expect(html).toContain("name=\"latent-map-recipe\"");
    expect(html).toContain("name=\"latent-map-layout\"");
    expect(html).toContain("name=\"latent-map-cluster-result\"");
    expect(html).toContain("name=\"latent-map-faiss-neighbor-count\"");
    expect(html).toContain("name=\"latent-map-faiss-relation\"");
    expect(html).toContain("name=\"latent-map-thumbnail-size\"");
    expect(html).toContain("aria-label=\"Points\"");
    expect(html).toContain("aria-label=\"Thumbnails\"");
    expect(html).toContain("aria-label=\"Cluster colors\"");
    expect(html).toContain("aria-label=\"Reset view\"");
    expect(html).toContain("value=\"dinov3_vits_256\"");
    expect(html).toContain("value=\"umap_n4_mindist0p05_seed42\"");
    expect(html).toContain("value=\"kmeans_k3_seed42\"");
    expect(html).not.toContain("detail panel");
  });

  it("renders method comparison selectors when alternate outputs are available", () => {
    const html = renderToString(
      <LatentMapViewer
        data={{
          ...latentMapFixture,
          cluster_id: "hierarchy_balanced_k48_average_cosine_l2",
          cluster_result: {
            cluster_count: 48,
            cluster_id: "hierarchy_balanced_k48_average_cosine_l2",
            label: "Hierarchy · Balanced",
            method: "hierarchy",
            params: {
              granularity_rank: 1,
              preset: "balanced",
              target_cluster_count: 48,
            },
            random_state: null,
            unassigned_count: 0,
          },
          available_recipes: [
            {
              family: "dinov3",
              long_edge: 256,
              model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
              recipe_name: "dinov3_vits_256",
            },
            {
              family: "dinov3",
              long_edge: 384,
              model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
              recipe_name: "dinov3_vits_384",
            },
          ],
          available_layouts: [
            {
              layout_id: "umap_n4_mindist0p05_seed42",
              method: "umap",
              params: { n_neighbors: 4 },
            },
          ],
          available_clusters: [
            {
              cluster_count: 48,
              cluster_id: "hierarchy_balanced_k48_average_cosine_l2",
              label: "Hierarchy · Balanced",
              method: "hierarchy",
              params: {
                granularity_rank: 1,
                preset: "balanced",
                target_cluster_count: 48,
              },
              random_state: null,
              unassigned_count: 0,
            },
            {
              cluster_count: 3,
              cluster_id: "kmeans_k3_seed42",
              method: "kmeans",
              random_state: 42,
            },
          ],
        }}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Embedding");
    expect(html).toContain("DINOv3 · ViT-S · 256px");
    expect(html).toContain("Layout");
    expect(html).toContain("UMAP · n=4");
    expect(html).toContain("Clusters");
    expect(html).toContain("Hierarchy · Balanced");
  });

  it("can render the map surface in thumbnail mode without originals", () => {
    const html = renderToString(
      <LatentMapViewer
        data={latentMapFixture}
        initialRenderMode="thumbnails"
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-render-mode=\"thumbnails\"");
    expect(html).toContain("data-runtime-atlas-page-count=\"1\"");
    expect(html).toContain("data-thumbnail-count=\"8\"");
    expect(html).toContain("data-thumbnail-instanced-draw-calls=\"1\"");
    expect(html).toContain("data-thumbnail-instanced-textures=\"1\"");
    expect(html).toContain("data-thumbnail-recommendation=\"keep-capped-sprites-for-mvp\"");
    expect(html).toContain("data-thumbnail-sprite-baseline-draw-calls=\"8\"");
    expect(html).toContain("data-thumbnail-sprite-baseline-textures=\"8\"");
    expect(html).toContain("data-thumbnail-source-kind=\"generated\"");
    expect(html).toContain("name=\"latent-map-thumbnail-size\"");
    expect(html).not.toContain("8 thumbnails");
    expect(html).not.toContain("fixture/a1.jpg");
  });

  it("can server-render URL-derived thumbnail state with a matching atlas size", () => {
    const html = renderToString(
      <LatentMapViewer
        data={{
          ...latentMapFixture,
          thumbnail_atlases: [
            createFixtureAtlas(32),
            createFixtureAtlas(64),
            createFixtureAtlas(96),
          ],
        }}
        initialState={{
          clusterFilter: "all",
          faissNeighborCount: 20,
          faissRelationMode: "closest",
          renderMode: "thumbnails",
          selectedImageId: null,
          sourceFilter: "all",
          textureDetail: "auto",
          thumbnailSize: 96,
          view: {
            offsetX: 0,
            offsetY: 0,
            zoom: 1,
          },
        }}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-render-mode=\"thumbnails\"");
    expect(html).toContain("data-thumbnail-size=\"96\"");
    expect(html).toContain("data-thumbnail-display-size=\"96\"");
    expect(html).toContain("data-thumbnail-atlas-tile-size=\"96\"");
    expect(html).toContain("data-thumbnail-resolved-texture-detail=\"96\"");
    expect(html).toContain("data-thumbnail-texture-detail=\"auto\"");
    expect(html).toContain("data-thumbnail-strategy=\"generated-atlas\"");
    expect(html).toContain("name=\"latent-map-texture-detail\"");
    expect(html).not.toContain("Display");
    expect(html).toContain("Size");
    expect(html).toContain("Detail");
    expect(html).toContain("96px");
  });

  it("can server-render visual thumbnail size separately from texture detail", () => {
    const html = renderToString(
      <LatentMapViewer
        data={{
          ...latentMapFixture,
          thumbnail_atlases: [
            createFixtureAtlas(32),
            createFixtureAtlas(64),
            createFixtureAtlas(96),
          ],
        }}
        initialState={{
          clusterFilter: "all",
          faissNeighborCount: 20,
          faissRelationMode: "closest",
          renderMode: "thumbnails",
          selectedImageId: null,
          sourceFilter: "all",
          textureDetail: 96,
          thumbnailSize: 32,
          view: {
            offsetX: 0,
            offsetY: 0,
            zoom: 1,
          },
        }}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-thumbnail-size=\"32\"");
    expect(html).toContain("data-thumbnail-display-size=\"32\"");
    expect(html).toContain("data-thumbnail-atlas-tile-size=\"96\"");
    expect(html).toContain("data-thumbnail-resolved-texture-detail=\"96\"");
    expect(html).toContain("data-thumbnail-texture-detail=\"96\"");
    expect(html).toContain("name=\"latent-map-thumbnail-size\"");
    expect(html).toContain("name=\"latent-map-texture-detail\"");
  });

  it("renders FAISS focus thumbnails over small background points", () => {
    const html = renderToString(
      <LatentMapViewer
        data={latentMapFixture}
        initialRenderMode="thumbnails"
        initialSelectedImageId="img_saffron"
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-render-mode=\"thumbnails\"");
    expect(html).toContain("data-selected-image-id=\"img_saffron\"");
    expect(html).toContain("data-neighborhood-active=\"false\"");
    expect(html).toContain("data-neighborhood-active-count=\"4\"");
    expect(html).toContain("data-neighborhood-row-count=\"3\"");
    expect(html).toContain("data-neighborhood-status=\"ready\"");
    expect(html).toContain("data-thumbnail-count=\"4\"");
    expect(html).toContain("data-point-layer-visible=\"true\"");
    expect(html).toContain("data-point-layer-size=\"3\"");
    expect(html).not.toContain("4 thumbnails");
  });
});
