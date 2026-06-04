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
    is_favorite: false,
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
    is_favorite: false,
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
    is_favorite: true,
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

    expect(html).not.toContain("Results");
    expect(html).not.toContain("Local Museum Objects in this Collection");
    expect(html).toContain("aria-label=\"Search local Collection results\"");
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("value=\"ceramics\"");
    expect(html).toContain("placeholder=\"\"");
    expect(html).toContain("Clear local search");
    expect(html).toContain("name=\"collection_filter\"");
    expect(html).toContain("value=\"venice\"");
    expect(html).not.toContain("action=\"/\"");
    expect(html).toContain("data-slot=\"toggle-group\"");
    expect(html).toContain("aria-label=\"Object and Image result views\"");
    expect(html).toContain(
      "href=\"/?search_set=snake-study&amp;view=images&amp;collection_filter=venice&amp;q=ceramics\"",
    );
    expect(html).toContain("Objects");
    expect(html).toContain("1");
    expect(html).toContain("Images");
    expect(html).toContain("2");
    expect(html).toContain("Cancel");
    expect(html).toContain("Deselect all");
    expect(html).toContain("1 selected");
    expect(html).toContain("Export selected");
    expect(html).toContain("Remove from collection");
    expect(html).toContain("Delete selected");
    expect(html.indexOf("Export selected")).toBeLessThan(
      html.indexOf("Remove from collection"),
    );
    expect(html.indexOf("Remove from collection")).toBeLessThan(
      html.indexOf("Delete selected"),
    );
    expect(html).toContain("Deselect Coiled Snake Bowl");
    expect(html).not.toContain("Favorite selected");
    expect(html).not.toContain("Unfavorite selected");
    expect(html).not.toContain("Favorite Coiled Snake Bowl");
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

    expect(html).not.toContain("Results");
    expect(html).not.toContain("Local Image Assets in this Collection");
    expect(html).toContain("aria-label=\"Search local Collection results\"");
    expect(html).toContain("placeholder=\"\"");
    expect(html).not.toContain("Clear local search");
    expect(html).toContain("data-slot=\"toggle-group\"");
    expect(html).toContain("aria-label=\"Object and Image result views\"");
    expect(html).toContain("href=\"/?search_set=snake-study&amp;provider=met\"");
    expect(html).toContain(
      "href=\"/?search_set=snake-study&amp;view=images&amp;provider=met\"",
    );
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

  it("renders tile favorite markers only outside selection mode", () => {
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
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        viewMode="images"
      />,
    ));

    expect(html).toContain("Favorite Image Asset 9");
    expect(html).toContain("Unfavorite Image Asset 8");
    expect(html).not.toContain("Favorite selected");
  });

  it("does not expose batch favorite actions in selection mode", () => {
    const html = normalizeServerHtml(renderToString(
      <CollectionResultsGrid
        apiBaseUrl="http://127.0.0.1:18670"
        closeImageHref="/?search_set=snake-study&view=images"
        closeObjectHref="/?search_set=snake-study"
        collectionFilterText=""
        collectionDisplayName="Snake Study"
        imageAssets={imageAssets}
        localQueryText=""
        objects={[{ ...objects[0], is_favorite: true }]}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        initialSelectedIds={["object:met:40"]}
        initialSelectionMode
        viewMode="objects"
      />,
    ));

    expect(html).toContain("Export selected");
    expect(html).toContain("Remove from collection");
    expect(html).not.toContain("Favorite selected");
    expect(html).not.toContain("Unfavorite selected");
  });

  it("fills the active Favorites filter bookmark in selection mode", () => {
    const html = normalizeServerHtml(renderToString(
      <CollectionResultsGrid
        apiBaseUrl="http://127.0.0.1:18670"
        closeImageHref="/?search_set=snake-study&view=images"
        closeObjectHref="/?search_set=snake-study"
        collectionFilterText=""
        collectionDisplayName="Snake Study"
        favoriteOnly
        imageAssets={imageAssets}
        localQueryText=""
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        initialSelectedIds={["image:8"]}
        initialSelectionMode
        viewMode="images"
      />,
    ));

    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("fill=\"currentColor\"");
    expect(html).toContain("fill-current text-white");
    expect(html).toContain("Favorites");
    expect(html).toContain("Cancel");
  });

  it("keeps object favorite bookmarks and carousel counts visible together", () => {
    const html = normalizeServerHtml(renderToString(
      <CollectionResultsGrid
        apiBaseUrl="http://127.0.0.1:18670"
        closeImageHref="/?search_set=snake-study&view=images"
        closeObjectHref="/?search_set=snake-study"
        collectionFilterText=""
        collectionDisplayName="Snake Study"
        imageAssets={imageAssets}
        localQueryText=""
        objects={[{ ...objects[0], is_favorite: true }]}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        viewMode="objects"
      />,
    ));

    expect(html).toContain("Unfavorite Coiled Snake Bowl");
    expect(html).toContain("3 images");
    expect(html).toContain("lucide-bookmark");
    expect(html).toContain("data-grid-shortcut-target=\"object\"");
    expect(html).toContain("data-grid-shortcut-keys=\"b v\"");
    expect(html).toContain("absolute left-1.5 top-1.5");
    expect(html).toContain("z-10");
    expect(html).not.toContain("z-20 rounded-full");
    expect(html).toContain("absolute right-1.5 top-1.5");
    expect(html).toContain("text-white");
    expect(html).toContain("fill-current");
    expect(html).not.toContain("drop-shadow");
    expect(html).not.toContain("bg-black/45");
    expect(html).not.toContain("text-rose");
  });

  it("exposes image tile shortcut targets outside selection mode", () => {
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
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        searchSetSlug="snake-study"
        viewMode="images"
      />,
    ));

    expect(html).toContain("data-grid-shortcut-target=\"image\"");
    expect(html).toContain("data-grid-shortcut-keys=\"b v\"");
  });
});
