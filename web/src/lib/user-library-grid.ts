import type {
  LibraryImageAssetSummary,
  LibraryObjectSummary,
} from "@/lib/collection-objects";
import { createGridStateHref, type GridViewMode } from "@/lib/grid-view";

export function createLibraryObjectHref(
  libraryObject: LibraryObjectSummary | LibraryImageAssetSummary,
  localQueryText: string,
  providerFilter: string = "all",
  viewMode: GridViewMode = "objects",
): string {
  return createGridStateHref({
    localQueryText,
    object: {
      objectId: libraryObject.object_id,
      provider: libraryObject.provider,
    },
    provider: providerFilter,
    searchSetSlug: libraryObject.collections[0]?.slug,
    viewMode,
    workspaceMode: "user-library",
  });
}

export function createLibraryImageAssetHref(
  imageAsset: LibraryImageAssetSummary,
  localQueryText: string,
  providerFilter: string = "all",
): string {
  return createGridStateHref({
    imageAssetId: imageAsset.image_asset_id,
    localQueryText,
    provider: providerFilter,
    viewMode: "images",
    workspaceMode: "user-library",
  });
}
