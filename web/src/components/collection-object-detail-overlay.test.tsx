import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CollectionObjectDetailOverlay } from "./collection-object-detail-overlay";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("CollectionObjectDetailOverlay", () => {
  it("renders carousel images, source metadata, matches, and skipped image notes", () => {
    const html = renderToString(
      <CollectionObjectDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?search_set=snake"
        returnFocusId="collection-object-met-40"
        detail={{
          object: {
            provider: "met",
            object_id: 40,
            title: "Coiled Snake Bowl",
            object_name: "Bowl",
            artist_display_name: "Unknown maker",
            object_url: "https://www.metmuseum.org/art/collection/search/40",
            rights_and_reproduction: "Public domain",
            metadata_date: "2026-01-02",
          },
          images: [
            {
              image_asset_id: 7,
              source_image_url: "https://images.metmuseum.org/40-primary.jpg",
              image_role: "primary",
              image_index: null,
              original_width: 1600,
              original_height: 800,
              thumb_url: "/image-assets/7/thumb",
              standard_url: "/image-assets/7/standard",
            },
            {
              image_asset_id: 8,
              source_image_url: "https://images.metmuseum.org/40-detail-a.jpg",
              image_role: "additional",
              image_index: 1,
              original_width: 1600,
              original_height: 800,
              thumb_url: "/image-assets/8/thumb",
              standard_url: "/image-assets/8/standard",
            },
          ],
          matches: [
            {
              search_term: "snake",
              verified: true,
              matched_fields: ["tags", "title"],
            },
          ],
          skipped_image_references: [
            {
              source_image_url: "https://images.metmuseum.org/40-skipped.jpg",
              image_role: "additional",
              image_index: 3,
              reason: "beyond_max_images_per_object",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Coiled Snake Bowl");
    expect(html).toContain("image 1 of 2");
    expect(html).toContain("Public domain");
    expect(html).toContain("snake");
    expect(html).toContain("verified");
    expect(html).toContain("tags, title");
    expect(html).toContain("Previous image");
    expect(html).toContain("Next image");
    expect(html).not.toContain("disabled=\"\"");
    expect(html).toContain("1 related image skipped");
    expect(html).toContain("Open Met object");
  });
});
