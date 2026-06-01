import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CollectionResultsGrid } from "./collection-results-grid";
import type {
  CollectionObjectSummary,
  LibraryImageAssetSummary,
} from "@/lib/collection-objects";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const objects: CollectionObjectSummary[] = [
  {
    provider: "met",
    object_id: 40,
    title: "Coiled Snake Bowl",
    object_name: "Bowl",
    artist_display_name: "Unknown maker",
    image_count: 3,
    cover_image_asset_id: 9,
    cover_original_width: 1600,
    cover_original_height: 800,
    cover_thumb_url: "/image-assets/9/thumb",
    has_sibling_images: true,
  },
];

const imageAssets: LibraryImageAssetSummary[] = [
  {
    image_asset_id: 9,
    provider: "met",
    object_id: 40,
    title: "Coiled Snake Bowl",
    object_name: "Bowl",
    artist_display_name: "Unknown maker",
    image_role: "primary",
    image_index: null,
    original_width: 1600,
    original_height: 800,
    image_count: 3,
    has_sibling_images: true,
    thumb_url: "/image-assets/9/thumb",
    standard_url: "/image-assets/9/standard",
    collections: [{ slug: "snake-study", display_name: "Snake Study" }],
  },
  {
    image_asset_id: 8,
    provider: "met",
    object_id: 40,
    title: "Coiled Snake Bowl",
    object_name: "Bowl",
    artist_display_name: "Unknown maker",
    image_role: "additional",
    image_index: 1,
    original_width: 1600,
    original_height: 800,
    image_count: 3,
    has_sibling_images: true,
    thumb_url: "/image-assets/8/thumb",
    standard_url: "/image-assets/8/standard",
    collections: [{ slug: "snake-study", display_name: "Snake Study" }],
  },
];

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

describe("CollectionResultsGrid", () => {
  it("renders Object mode as one tile per Museum Object with carousel indicators", () => {
    const html = normalizeServerHtml(renderToString(
      <CollectionResultsGrid
        apiBaseUrl="http://127.0.0.1:18670"
        closeImageHref="/?search_set=snake-study&view=images"
        closeObjectHref="/?search_set=snake-study"
        collectionFilterText="venice"
        collectionDisplayName="Snake Study"
        createImageAssetHref={(imageAsset) => `/?image=${imageAsset.image_asset_id}`}
        createObjectHref={(object) => `/?object=met:${object.object_id}`}
        imageAssets={imageAssets}
        localQueryText="ceramics"
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        viewMode="objects"
      />,
    ));

    expect(html).toContain("Local Museum Objects in this Collection");
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("value=\"ceramics\"");
    expect(html).toContain("name=\"collection_filter\"");
    expect(html).toContain("value=\"venice\"");
    expect(html).not.toContain("action=\"/\"");
    expect(html).toContain("Objects");
    expect(html).toContain("1");
    expect(html).toContain("Images");
    expect(html).toContain("2");
    expect(html).toContain("Met");
    expect(html).not.toContain("1 shown");
    expect(html).toContain("3 images");
    expect(html).toContain("/?object=met:40");
    expect(html).not.toContain("/?image=8");
  });

  it("renders Image mode as one tile per Image Asset without carousel indicators", () => {
    const html = normalizeServerHtml(renderToString(
      <CollectionResultsGrid
        apiBaseUrl="http://127.0.0.1:18670"
        closeImageHref="/?search_set=snake-study&view=images"
        closeObjectHref="/?search_set=snake-study"
        collectionFilterText=""
        collectionDisplayName="Snake Study"
        createImageAssetHref={(imageAsset) => `/?image=${imageAsset.image_asset_id}`}
        createObjectHref={(object) => `/?object=met:${object.object_id}`}
        imageAssets={imageAssets}
        localQueryText=""
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="met"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        viewMode="images"
      />,
    ));

    expect(html).toContain("Local Image Assets in this Collection");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("Images");
    expect(html).toContain("2");
    expect(html).not.toContain("2 shown");
    expect(html).toContain("/?image=9");
    expect(html).toContain("/?image=8");
    expect(html).not.toContain("3 images");
  });
});
