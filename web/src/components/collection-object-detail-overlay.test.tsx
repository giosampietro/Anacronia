import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CollectionObjectDetail } from "@/lib/collection-objects";
import { CollectionObjectDetailOverlay } from "./collection-object-detail-overlay";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function createDetail(
  overrides: Partial<CollectionObjectDetail> = {},
): CollectionObjectDetail {
  const detail: CollectionObjectDetail = {
    object: {
      provider: "met",
      object_id: "40",
      title: "Coiled Snake Bowl",
      object_name: "Bowl",
      artist_display_name: "Known maker",
      artist_display_bio: "American, 1900-1970",
      artist_nationality: "",
      department: "Greek and Roman Art",
      object_date: "ca. 1890",
      medium: "Terracotta",
      dimensions: "H. 4 in. (10.2 cm)",
      classification: "Ceramics",
      credit_line: "Gift of Anacronia",
      accession_number: "40.1",
      repository: "Metropolitan Museum of Art, New York, NY",
      tags: ["Snake"],
      object_url: "https://www.metmuseum.org/art/collection/search/40",
      is_public_domain: true,
      rights_and_reproduction: "",
      metadata_date: "2026-01-02",
      is_favorite: false,
    },
    images: [
      {
        image_asset_id: 7,
        source_image_url: "https://images.metmuseum.org/40-primary.jpg",
        source_file_url: null,
        sensitive_image: null,
        image_role: "primary",
        image_index: null,
        original_width: 1600,
        original_height: 800,
        thumb_url: "/image-assets/7/thumb",
        standard_url: "/image-assets/7/standard",
        is_favorite: false,
      },
      {
        image_asset_id: 8,
        source_image_url: "https://images.metmuseum.org/40-detail-a.jpg",
        source_file_url: null,
        sensitive_image: null,
        image_role: "additional",
        image_index: 1,
        original_width: 1600,
        original_height: 800,
        thumb_url: "/image-assets/8/thumb",
        standard_url: "/image-assets/8/standard",
        is_favorite: false,
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
  };

  return {
    ...detail,
    ...overrides,
    object: {
      ...detail.object,
      ...overrides.object,
    },
    images: overrides.images ?? detail.images,
    matches: overrides.matches ?? detail.matches,
    skipped_image_references:
      overrides.skipped_image_references ?? detail.skipped_image_references,
  };
}

describe("CollectionObjectDetailOverlay", () => {
  it("renders carousel images, source metadata, matches, and skipped image notes", () => {
    const html = renderToString(
      <CollectionObjectDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?search_set=snake"
        collectionLabels={["sNaKe STUDIES"]}
        initialImageAssetId={8}
        returnFocusId="collection-object-met-40"
        detail={createDetail()}
      />,
    );
    const normalizedHtml = html.replace(/<!-- -->/g, "");

    expect(normalizedHtml).toContain("Coiled Snake Bowl");
    expect(normalizedHtml).toContain("left-16");
    expect(normalizedHtml).not.toContain("class=\"fixed inset-0 z-50");
    expect(normalizedHtml).toContain("aria-label=\"Close object detail\"");
    expect(normalizedHtml).toContain("href=\"/?search_set=snake\"");
    expect(normalizedHtml).toContain("http://127.0.0.1:18670/image-assets/8/thumb");
    expect(normalizedHtml).toContain("http://127.0.0.1:18670/image-assets/8/standard");
    expect(normalizedHtml).toContain("2 / 2");
    expect(normalizedHtml).toContain("Show next image");
    expect(normalizedHtml).toContain("Object facts");
    expect(normalizedHtml).toContain("Active image");
    expect(normalizedHtml).toContain("Image Asset ID");
    expect(normalizedHtml).toContain(">8<");
    expect(normalizedHtml).toContain("Image number");
    expect(normalizedHtml).toContain("2");
    expect(normalizedHtml).toContain("Role");
    expect(normalizedHtml).toContain("additional");
    expect(normalizedHtml).toContain("Provider index");
    expect(normalizedHtml).toContain("Provider record");
    expect(normalizedHtml).toContain("Collections");
    expect(normalizedHtml).toContain("Snake Studies");
    expect(normalizedHtml).not.toContain("sNaKe STUDIES");
    expect(normalizedHtml).toContain("Greek and Roman Art");
    expect(normalizedHtml).toContain("Unknown");
    expect(normalizedHtml).toContain("Terracotta");
    expect(normalizedHtml).toContain("H. 4 in. (10.2 cm)");
    expect(normalizedHtml).toContain("40.1");
    expect(normalizedHtml).toContain("Gift of Anacronia");
    expect(normalizedHtml).toContain("Metropolitan Museum of Art");
    expect(normalizedHtml).toContain("Public domain");
    expect(normalizedHtml).toContain("snake");
    expect(normalizedHtml).toContain("Verified");
    expect(normalizedHtml).toContain("tags, title");
    expect(normalizedHtml).toContain("Previous image");
    expect(normalizedHtml).toContain("Next image");
    expect(normalizedHtml).toContain("Favorite object");
    expect(normalizedHtml).toContain("Delete object");
    expect(normalizedHtml).toContain("1 related provider image was not imported");
    expect(normalizedHtml).toContain("Open provider record");
    expect(normalizedHtml).toContain("Source image");
    expect(normalizedHtml).toContain("Provider metadata");
    expect(normalizedHtml).toContain("Provider image references");
    expect(normalizedHtml).toContain("https://images.metmuseum.org/40-skipped.jpg");
  });

  it("renders the active image favorite action on image detail", () => {
    const detail = createDetail({
      images: createDetail().images.map((image) =>
        image.image_asset_id === 8 ? { ...image, is_favorite: true } : image,
      ),
    });

    const html = renderToString(
      <CollectionObjectDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?search_set=snake&view=images"
        detail={detail}
        detailKind="image"
        initialImageAssetId={8}
        returnFocusId="collection-image-8"
      />,
    ).replace(/<!-- -->/g, "");

    expect(html).toContain("Unfavorite image");
    expect(html).not.toContain("Favorite object");
  });

  it("renders V&A public-domain status as not checked", () => {
    const html = renderToString(
      <CollectionObjectDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?search_set=bed"
        collectionLabels={["Bed Studies"]}
        detail={createDetail({
          object: {
            provider: "vam",
            object_id: "O9138",
            title: "Great Bed of Ware",
            object_name: "Bed",
            is_public_domain: false,
            rights_and_reproduction: "© Victoria and Albert Museum, London",
            object_url: "https://collections.vam.ac.uk/item/O9138/",
          },
          images: [
            {
              image_asset_id: 9,
              source_image_url:
                "https://framemark.vam.ac.uk/collections/2006AL3614/full/full/0/default.jpg",
              source_file_url: null,
              sensitive_image: true,
              image_role: "primary",
              image_index: null,
              original_width: 2500,
              original_height: 1971,
              thumb_url: "/image-assets/9/thumb",
              standard_url: "/image-assets/9/standard",
              is_favorite: false,
            },
          ],
        })}
        returnFocusId="collection-object-vam-O9138"
      />,
    ).replace(/<!-- -->/g, "");

    expect(html).toContain("V&amp;A");
    expect(html).toContain("Not checked");
    expect(html).toContain("Sensitive image");
    expect(html).toContain(">Yes</dd>");
    expect(html).not.toContain("<dd>No</dd>");
  });

  it("renders local folder detail as private material without source links", () => {
    const html = renderToString(
      <CollectionObjectDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?search_set=studio-folder"
        collectionLabels={["Studio Folder"]}
        detail={createDetail({
          object: {
            provider: "local-folder",
            object_id:
              "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            title: "sketch",
            object_name: "Local image",
            is_public_domain: false,
            rights_and_reproduction: "",
            object_url: "",
          },
          images: [
            {
              image_asset_id: 10,
              source_image_url:
                "local-folder:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              source_file_url: null,
              sensitive_image: null,
              image_role: "primary",
              image_index: null,
              original_width: 640,
              original_height: 320,
              thumb_url: "/image-assets/10/thumb",
              standard_url: "/image-assets/10/standard",
              is_favorite: false,
            },
          ],
          skipped_image_references: [],
        })}
        returnFocusId="collection-object-local-folder-sketch"
      />,
    ).replace(/<!-- -->/g, "");

    expect(html).toContain("Local folder");
    expect(html).toContain("Private local material");
    expect(html).toContain("Private local image");
    expect(html).toContain("Not checked");
    expect(html).not.toContain("Open provider record");
    expect(html).not.toContain("Source image");
    expect(html).not.toContain("local-folder:sha256");
    expect(html).not.toContain("Object ID");
    expect(html).not.toContain("sha256-aaaaaaaa");
  });

  it("renders a local folder original file link when one is stored", () => {
    const html = renderToString(
      <CollectionObjectDetailOverlay
        apiBaseUrl="http://127.0.0.1:18670"
        closeHref="/?search_set=studio-folder"
        detail={createDetail({
          object: {
            provider: "local-folder",
            object_id:
              "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            title: "render",
            object_name: "Local image",
            is_public_domain: false,
            rights_and_reproduction: "",
            object_url: "",
          },
          images: [
            {
              image_asset_id: 11,
              source_image_url:
                "local-folder:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              source_file_url: "/image-assets/11/source",
              sensitive_image: null,
              image_role: "primary",
              image_index: null,
              original_width: 640,
              original_height: 320,
              thumb_url: "/image-assets/11/thumb",
              standard_url: "/image-assets/11/standard",
              is_favorite: false,
            },
          ],
          skipped_image_references: [],
        })}
        returnFocusId="collection-object-local-folder-render"
      />,
    ).replace(/<!-- -->/g, "");

    expect(html).toContain("Original file");
    expect(html).toContain("Open original file");
    expect(html).toContain(
      "href=\"http://127.0.0.1:18670/image-assets/11/source\"",
    );
    expect(html).not.toContain("local-folder:sha256");
  });
});
