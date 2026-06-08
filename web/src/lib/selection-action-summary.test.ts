import { describe, expect, it } from "vitest";

import type {
  CollectionObjectSummary,
  LibraryImageAssetSummary,
  LibraryObjectSummary,
} from "@/lib/collection-objects";
import { selectionActionSummary } from "./selection-action-summary";

const collectionObject: CollectionObjectSummary = {
  provider: "met",
  object_id: "40",
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
};

const libraryObject: LibraryObjectSummary = {
  ...collectionObject,
  is_favorite: true,
  collections: [
    { slug: "snake-study", display_name: "sNaKe STUDY" },
    { slug: "serpent-study", display_name: "SERPENT study" },
  ],
};

const orphanImage: LibraryImageAssetSummary = {
  image_asset_id: 8,
  provider: "met",
  object_id: "40",
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
  is_favorite: false,
  collections: [],
};

describe("selectionActionSummary", () => {
  it("summarizes object removal scope and affected images", () => {
    const summary = selectionActionSummary({
      action: "remove",
      imageAssets: [],
      objects: [collectionObject],
      scopeDisplayName: "sNaKe STUDY",
      selectedIds: ["object:met:40"],
      viewMode: "objects",
    });

    expect(summary.title).toBe("Remove 1 object and 3 images from this Collection?");
    expect(summary.description).toBe("Remove selected object from Snake Study.");
    expect(summary.bodyLines).toContain("The selected object will stay in My Library.");
    expect(summary.bodyLines).toContain("Other Collections keep it.");
    expect(summary.bodyLines).toContain(
      "Future searches in this Collection will not download, import, reactivate, or add it again.",
    );
  });

  it("warns when global deletion includes shared and favorited material", () => {
    const summary = selectionActionSummary({
      action: "delete",
      imageAssets: [],
      objects: [libraryObject],
      scopeDisplayName: "My Library",
      selectedIds: ["object:met:40"],
      viewMode: "objects",
    });

    expect(summary.title).toBe("Delete 1 object and 3 images?");
    expect(summary.description).toBe("Delete selected object.");
    expect(summary.bodyLines).toContain(
      "The selected object leaves My Library and all Collections.",
    );
    expect(summary.bodyLines).toContain(
      "Present in 2 Collections: Snake Study, Serpent Study.",
    );
    expect(summary.bodyLines).toContain("1 favorited object is included.");
    expect(summary.bodyLines).toContain("Local files will be deleted.");
    expect(summary.bodyLines).toContain("Exports are not deleted.");
    expect(summary.bodyLines).toContain(
      "Future searches may import the same material again.",
    );
  });

  it("keeps orphan image deletion copy simple", () => {
    const summary = selectionActionSummary({
      action: "delete",
      imageAssets: [orphanImage],
      objects: [],
      scopeDisplayName: "My Library",
      selectedIds: ["image:8"],
      viewMode: "images",
    });

    expect(summary.title).toBe("Delete 1 image?");
    expect(summary.bodyLines).toContain("Local files will be deleted.");
    expect(summary.bodyLines).not.toContain("Present in 0 Collections.");
  });
});
