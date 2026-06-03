import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UserLibraryWorkspace } from "./user-library-workspace";
import type {
  LibraryImageAssetSummary,
  LibraryObjectSummary,
} from "@/lib/collection-objects";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

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
    collections: [
      { slug: "snake-study", display_name: "sNaKe STUDY" },
      { slug: "serpent-study", display_name: "SERPENT study" },
    ],
  },
  {
    image_asset_id: 4,
    provider: "met",
    object_id: 20,
    title: "Snake Vessel",
    object_name: "Vessel",
    artist_display_name: "Met Workshop",
    image_role: "primary",
    image_index: null,
    original_width: 1200,
    original_height: 1600,
    image_count: 1,
    has_sibling_images: false,
    thumb_url: "/image-assets/4/thumb",
    standard_url: "/image-assets/4/standard",
    is_favorite: false,
    collections: [{ slug: "snake-study", display_name: "sNaKe STUDY" }],
  },
];

const objects: LibraryObjectSummary[] = [
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
    is_favorite: true,
    collections: [
      { slug: "snake-study", display_name: "sNaKe STUDY" },
      { slug: "serpent-study", display_name: "SERPENT study" },
    ],
  },
  {
    provider: "met",
    object_id: 20,
    title: "Snake Vessel",
    object_name: "Vessel",
    artist_display_name: "Met Workshop",
    image_count: 1,
    cover_image_asset_id: 4,
    cover_original_width: 1200,
    cover_original_height: 1600,
    cover_thumb_url: "/image-assets/4/thumb",
    has_sibling_images: false,
    is_favorite: false,
    collections: [{ slug: "snake-study", display_name: "sNaKe STUDY" }],
  },
];

function createImageAsset(index: number): LibraryImageAssetSummary {
  return {
    image_asset_id: index,
    provider: "met",
    object_id: 1000 + index,
    title: `Library Image ${index}`,
    object_name: "Object",
    artist_display_name: "Unknown maker",
    image_role: "primary",
    image_index: null,
    original_width: 1200,
    original_height: 1600,
    image_count: 1,
    has_sibling_images: false,
    thumb_url: `/image-assets/${index}/thumb`,
    standard_url: `/image-assets/${index}/standard`,
    is_favorite: false,
    collections: [{ slug: "snake-study", display_name: "Snake Study" }],
  };
}

describe("UserLibraryWorkspace", () => {
  it("renders image mode as one tile per Image Asset without sibling carousel badges", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        imageAssets={imageAssets}
        localQueryText=""
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 2, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 2, images: 2 }}
        viewMode="images"
      />,
    );

    expect(html).toContain("aria-label=\"Search local My Library results\"");
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("placeholder=\"\"");
    expect(html).toContain("data-slot=\"toggle-group\"");
    expect(html).toContain("aria-label=\"Object and Image result views\"");
    expect(html).toContain("All Providers");
    expect(html).toContain("Select");
    expect(html).toContain("Favorites");
    expect(html).toContain("lucide-bookmark");
    expect(html).not.toContain("lucide-heart");
    expect(html).toContain("Snake Study");
    expect(html).toContain("Serpent Study");
    expect(html).not.toContain("sNaKe STUDY");
    expect(html).not.toContain("SERPENT study");
    expect(html).not.toContain(">3</");
    expect(html).toContain("Met");
    expect(html).toContain("/?mode=user-library&amp;image=9");
    expect(html).toContain("/?mode=user-library&amp;image=4");
    expect(html).toContain("http://127.0.0.1:18670/image-assets/9/thumb");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).not.toContain("collected Image Assets across all Collections");
    expect(html).not.toContain(">Library<");
    expect(html).not.toContain(">User Library<");
    expect(html).not.toContain("No library grid yet");
  });

  it("renders object mode as unique Museum Object tiles with carousel indicators", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        imageAssets={imageAssets}
        initialSelectedIds={["object:met:40"]}
        initialSelectionMode
        localQueryText="snake"
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 2, imageCount: 2 }]}
        providerFilter="met"
        resultCounts={{ objects: 2, images: 2 }}
        viewMode="objects"
      />,
    );

    expect(html).toContain("value=\"snake\"");
    expect(html).toContain("Clear local search");
    expect(html).toContain("1 selected");
    expect(html).toContain("Export selected");
    expect(html).not.toContain("Remove from collection");
    expect(html).toContain("Delete selected");
    expect(html).not.toContain("Favorite selected");
    expect(html).not.toContain("Unfavorite selected");
    expect(html).toContain("/?mode=user-library&amp;search_set=snake-study&amp;view=objects&amp;object=met%3A40&amp;q=snake&amp;provider=met");
    expect(html).toContain("/?mode=user-library&amp;search_set=snake-study&amp;view=objects&amp;object=met%3A20&amp;q=snake&amp;provider=met");
    expect(html).toContain("3 images");
    expect(html).toContain("Coiled Snake Bowl");
  });

  it("renders a visible No Collection filter and preserves it in User Library links", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        imageAssets={imageAssets}
        libraryCollectionFilter="none"
        localQueryText="snake"
        objects={objects}
        providerFacets={[{ provider: "met", objectCount: 2, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 2, images: 2 }}
        viewMode="images"
      />,
    );

    expect(html).toContain("No Collection");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("/?mode=user-library&amp;collection=none&amp;q=snake");
    expect(html).toContain("/?mode=user-library&amp;image=9&amp;collection=none&amp;q=snake");
  });

  it("renders the true empty library state only when no Image Assets exist", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        imageAssets={[]}
        localQueryText=""
        objects={[]}
        providerFacets={[]}
        providerFilter="all"
        resultCounts={{ objects: 0, images: 0 }}
        viewMode="images"
      />,
    );

    expect(html).toContain("No Image Assets yet");
    expect(html).not.toContain("No matching Image Assets");
  });

  it("renders a filtered empty state when the library has no matching Image Assets", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        imageAssets={[]}
        localQueryText="cobra"
        objects={[]}
        providerFacets={[{ provider: "met", objectCount: 1, imageCount: 2 }]}
        providerFilter="all"
        resultCounts={{ objects: 1, images: 2 }}
        viewMode="images"
      />,
    );

    expect(html).toContain("No matching Image Assets");
    expect(html).toContain("cobra");
    expect(html).not.toContain("No Image Assets yet");
  });

  it("does not server-render every thumbnail in large library grids", () => {
    const largeImageAssets = Array.from({ length: 1000 }, (_, index) =>
      createImageAsset(index + 1),
    );
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        imageAssets={largeImageAssets}
        initialSelectedIds={["image:1000"]}
        initialSelectionMode
        localQueryText=""
        objects={[]}
        providerFacets={[{ provider: "met", objectCount: 0, imageCount: 1000 }]}
        providerFilter="all"
        resultCounts={{ objects: 0, images: 1000 }}
        viewMode="images"
      />,
    );

    const renderedImageCount = (html.match(/loading="lazy"/g) ?? []).length;

    expect(html).toContain("1 selected");
    expect(renderedImageCount).toBeGreaterThan(0);
    expect(renderedImageCount).toBeLessThan(200);
  });
});
