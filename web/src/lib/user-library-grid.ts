import type {
  LibraryImageAssetSummary,
  LibraryObjectSummary,
} from "@/lib/collection-objects";
import {
  createGridStateHref,
  type GridViewMode,
  type LibraryCollectionFilter,
} from "@/lib/grid-view";

export function createLibraryObjectHref(
  libraryObject: LibraryObjectSummary | LibraryImageAssetSummary,
  localQueryText: string,
  providerFilter: string = "all",
  viewMode: GridViewMode = "objects",
  favoriteOnly: boolean = false,
  libraryCollectionFilter: LibraryCollectionFilter = "all",
): string {
  return createGridStateHref({
    favoriteOnly,
    libraryCollectionFilter,
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
  favoriteOnly: boolean = false,
  libraryCollectionFilter: LibraryCollectionFilter = "all",
): string {
  return createGridStateHref({
    favoriteOnly,
    imageAssetId: imageAsset.image_asset_id,
    libraryCollectionFilter,
    localQueryText,
    provider: providerFilter,
    viewMode: "images",
    workspaceMode: "user-library",
  });
}
