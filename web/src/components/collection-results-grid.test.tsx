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
        imageAssets={imageAssets}
        localQueryText="ceramics"
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        initialSelectedIds={["object:met:40"]}
        initialSelectionMode
        viewMode="objects"
      />,
    ));

    expect(html).toContain("Local Museum Objects in this Collection");
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("value=\"ceramics\"");
    expect(html).toContain("Clear local search");
    expect(html).toContain("name=\"collection_filter\"");
    expect(html).toContain("value=\"venice\"");
    expect(html).not.toContain("action=\"/\"");
    expect(html).toContain("Objects");
    expect(html).toContain("1");
    expect(html).toContain("Images");
    expect(html).toContain("2");
    expect(html).toContain("Cancel");
    expect(html).toContain("Deselect all");
    expect(html).toContain("1 selected");
    expect(html).toContain("Export selected");
    expect(html).toContain("Delete selected");
    expect(html).toContain("Deselect Coiled Snake Bowl");
    expect(html).toContain("border-2 border-white");
    expect(html).toContain(
      "rounded-full border shadow-sm backdrop-blur-sm border-primary bg-primary text-primary-foreground",
    );
    expect(html).not.toContain("border-white/90 bg-background/45");
    expect(html).not.toContain("selected_object=");
    expect(html).not.toContain("select=1");
    expect(html).toContain("Met");
    expect(html).not.toContain("1 shown");
    expect(html).toContain("3 images");
    expect(html).toContain("object=met%3A40");
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
        imageAssets={imageAssets}
        localQueryText=""
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="met"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        initialSelectedIds={["image:8"]}
        initialSelectionMode
        viewMode="images"
      />,
    ));

    expect(html).toContain("Local Image Assets in this Collection");
    expect(html).not.toContain("Clear local search");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("1 selected");
    expect(html).toContain("Select Image Asset 9");
    expect(html).toContain("Deselect Image Asset 8");
    expect(html).toContain("rounded-full border border-white/90 bg-background/45");
    expect(html).toContain("border-primary bg-primary text-primary-foreground");
    expect(html).not.toContain("selected_image=");
    expect(html).not.toContain("select=1");
    expect(html).toContain("Images");
    expect(html).toContain("2");
    expect(html).not.toContain("2 shown");
    expect(html).toContain("image=9");
    expect(html).toContain("image=8");
    expect(html).not.toContain("3 images");
  });
});
