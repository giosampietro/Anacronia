import { describe, expect, it } from "vitest";

import { getLatentMapHoverPreviewSources } from "@/lib/latent-map-hover-preview";

describe("getLatentMapHoverPreviewSources", () => {
  it("uses the preview source first and keeps the thumbnail as a fallback", () => {
    expect(
      getLatentMapHoverPreviewSources({
        preview_path: "/api/preview.jpg",
        thumbnail_path: "/api/thumb.jpg",
      }),
    ).toEqual({
      fallbackSource: "/api/thumb.jpg",
      primarySource: "/api/preview.jpg",
    });
  });

  it("falls back to the thumbnail when the preview source is blank", () => {
    expect(
      getLatentMapHoverPreviewSources({
        preview_path: "",
        thumbnail_path: "/api/thumb.jpg",
      }),
    ).toEqual({
      fallbackSource: null,
      primarySource: "/api/thumb.jpg",
    });
  });
});
