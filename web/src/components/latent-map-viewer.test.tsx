import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LatentMapViewer } from "@/components/latent-map-viewer";
import { latentMapFixture } from "@/lib/latent-map-fixture";

describe("LatentMapViewer", () => {
  it("renders directly as a map surface with prototype fixture data", () => {
    const html = renderToString(<LatentMapViewer data={latentMapFixture} />)
      .replaceAll("<!-- -->", "");

    expect(html).toContain("Latent Map");
    expect(html).toContain("data-testid=\"latent-map-canvas\"");
    expect(html).toContain("data-render-mode=\"points\"");
    expect(html).toContain("data-point-count=\"8\"");
    expect(html).toContain("data-runtime-atlas-page-count=\"0\"");
    expect(html).toContain("data-runtime-draw-calls=\"0\"");
    expect(html).toContain("data-runtime-geometries=\"0\"");
    expect(html).toContain("data-runtime-loaded-thumbnails=\"0\"");
    expect(html).toContain("data-runtime-textures=\"0\"");
    expect(html).toContain("data-thumbnail-count=\"0\"");
    expect(html).not.toContain("data-selected-image-id=");
    expect(html).toContain("8 images");
    expect(html).toContain("3 clusters");
    expect(html).toContain("name=\"latent-map-recipe\"");
    expect(html).toContain("name=\"latent-map-layout\"");
    expect(html).toContain("name=\"latent-map-cluster-result\"");
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
              cluster_count: 3,
              cluster_id: "kmeans_k3_seed42",
              method: "kmeans",
              random_state: 42,
            },
          ],
        }}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Embedding recipe");
    expect(html).toContain("dinov3_vits_384");
    expect(html).toContain("Layout result");
    expect(html).toContain("Cluster result");
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
    expect(html).toContain("data-thumbnail-source-kind=\"generated\"");
    expect(html).toContain("name=\"latent-map-thumbnail-size\"");
    expect(html).toContain("8 thumbnails");
    expect(html).not.toContain("fixture/a1.jpg");
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
    expect(html).toContain("data-thumbnail-count=\"4\"");
    expect(html).toContain("data-point-layer-visible=\"true\"");
    expect(html).toContain("data-point-layer-size=\"3\"");
    expect(html).toContain("4 thumbnails");
  });
});
