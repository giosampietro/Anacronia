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
    expect(html).toContain("data-point-count=\"8\"");
    expect(html).toContain("data-selected-image-id=\"img_saffron\"");
    expect(html).toContain("8 images");
    expect(html).toContain("3 clusters");
    expect(html).toContain("dinov3_vits_256");
    expect(html).not.toContain("detail panel");
  });
});
