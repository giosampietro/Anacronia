import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UserLibraryWorkspace } from "./user-library-workspace";
import type { LibraryImageAssetSummary } from "@/lib/collection-objects";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
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
    collections: [
      { slug: "snake-study", display_name: "Snake Study" },
      { slug: "serpent-study", display_name: "Serpent Study" },
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
    collections: [{ slug: "snake-study", display_name: "Snake Study" }],
  },
];

describe("UserLibraryWorkspace", () => {
  it("renders a populated image grid when the library has Image Assets", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        filterText=""
        imageAssets={imageAssets}
        imageCount={2}
      />,
    );

    expect(html).toContain("Snake Study");
    expect(html).toContain("Serpent Study");
    expect(html).toContain(">3</");
    expect(html).toContain("Met");
    expect(html).toContain("http://127.0.0.1:18670/image-assets/9/thumb");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).not.toContain("collected Image Assets across all Collections");
    expect(html).not.toContain(">Library<");
    expect(html).not.toContain(">User Library<");
    expect(html).not.toContain("Coiled Snake Bowl");
    expect(html).not.toContain("Bowl");
    expect(html).not.toContain("No library grid yet");
  });

  it("renders the true empty library state only when no Image Assets exist", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        filterText=""
        imageAssets={[]}
        imageCount={0}
      />,
    );

    expect(html).toContain("No Image Assets yet");
    expect(html).not.toContain("No matching Image Assets");
  });

  it("renders a filtered empty state when the library has no matching Image Assets", () => {
    const html = renderToString(
      <UserLibraryWorkspace
        apiBaseUrl="http://127.0.0.1:18670"
        filterText="cobra"
        imageAssets={[]}
        imageCount={2}
      />,
    );

    expect(html).toContain("No matching Image Assets");
    expect(html).toContain("cobra");
    expect(html).not.toContain("No Image Assets yet");
  });
});
