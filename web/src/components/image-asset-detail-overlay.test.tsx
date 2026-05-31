import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ImageAssetDetailOverlay,
  ImageAssetDetailPendingLink,
} from "./image-asset-detail-overlay";
import type { LibraryImageAssetSummary } from "@/lib/collection-objects";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const imageAsset: LibraryImageAssetSummary = {
  image_asset_id: 9,
  provider: "met",
  object_id: 40,
  title: "Coiled Snake Bowl",
  object_name: "Bowl",
  artist_display_name: "Unknown maker",
  image_role: "additional",
  image_index: 2,
  original_width: 1600,
  original_height: 800,
  image_count: 3,
  has_sibling_images: true,
  thumb_url: "/image-assets/9/thumb",
  standard_url: "/image-assets/9/standard",
  collections: [{ slug: "snake-study", display_name: "Snake Study" }],
};

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

describe("ImageAssetDetailOverlay", () => {
  it("renders the lightweight Image Asset detail without collection or role/index metadata", () => {
    const html = normalizeServerHtml(renderToString(
      <ImageAssetDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?mode=user-library"
        imageAsset={imageAsset}
        nextImageHref="/?mode=user-library&image=8"
        objectHref="/?mode=user-library&object=met%3A40"
        previousImageHref="/?mode=user-library&image=10"
        returnFocusId="library-image-asset-9"
      />,
    ));

    expect(html).toContain("Image Asset 9");
    expect(html).toContain("Open object");
    expect(html).toContain("Delete image");
    expect(html).toContain("Coiled Snake Bowl");
    expect(html).toContain("1600 x 800");
    expect(html).toContain("http://127.0.0.1:18670/image-assets/9/thumb");
    expect(html).toContain("http://127.0.0.1:18670/image-assets/9/standard");
    expect(html).not.toContain("Snake Study");
    expect(html).not.toContain("additional");
    expect(html).not.toContain("provider index");
  });

  it("renders a lighter pending state with the clicked image preview", () => {
    const html = normalizeServerHtml(renderToString(
      <ImageAssetDetailPendingLink
        ariaLabel="Open Met Image Asset 9"
        closeHref="/?mode=user-library"
        href="/?mode=user-library&image=9"
        id="library-image-asset-9"
        initialPending
        preview={{
          alt: "Met Image Asset 9",
          height: 800,
          parentTitle: "Coiled Snake Bowl",
          providerLabel: "Met",
          src: "http://127.0.0.1:18670/image-assets/9/thumb",
          title: "Image Asset",
          width: 1600,
        }}
      >
        Tile
      </ImageAssetDetailPendingLink>,
    ));

    expect(html).toContain("Tile");
    expect(html).toContain("Loading image detail");
    expect(html).toContain("http://127.0.0.1:18670/image-assets/9/thumb");
  });
});
