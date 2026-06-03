import type {
  CollectionObjectSummary,
  LibraryImageAssetCollection,
  LibraryImageAssetSummary,
  LibraryObjectSummary,
} from "@/lib/collection-objects";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import {
  createObjectRouteKey,
  parseObjectRouteKey,
  type GridViewMode,
} from "@/lib/grid-view";

type LocalResultObjectSummary = CollectionObjectSummary | LibraryObjectSummary;
type SelectionAction = "delete" | "remove";

export type SelectionActionSummary = {
  bodyLines: string[];
  confirmLabel: string;
  description: string;
  title: string;
};

function objectSelectionId(collectionObject: LocalResultObjectSummary): string {
  return `object:${createObjectRouteKey(
    collectionObject.provider,
    collectionObject.object_id,
  )}`;
}

function imageSelectionId(imageAsset: LibraryImageAssetSummary): string {
  return `image:${imageAsset.image_asset_id}`;
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function selectionNoun(viewMode: GridViewMode, count: number): string {
  return pluralize(count, viewMode === "images" ? "image" : "object");
}

function hasCollections(
  value: LocalResultObjectSummary,
): value is LibraryObjectSummary {
  return "collections" in value;
}

function formattedCollectionLabels(
  collections: LibraryImageAssetCollection[],
): string[] {
  return collections
    .map((collection) => formatCollectionDisplayName(collection.display_name))
    .filter((label) => label.trim() !== "");
}

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels));
}

function collectionSummaryLine(labels: string[]): string | null {
  const uniqueCollectionLabels = uniqueLabels(labels);
  if (uniqueCollectionLabels.length === 0) {
    return null;
  }

  return `Present in ${uniqueCollectionLabels.length} ${pluralize(
    uniqueCollectionLabels.length,
    "Collection",
  )}: ${uniqueCollectionLabels.join(", ")}.`;
}

function selectedObjectsById(
  objects: LocalResultObjectSummary[],
): Map<string, LocalResultObjectSummary> {
  return new Map(objects.map((object) => [objectSelectionId(object), object]));
}

function selectedImagesById(
  imageAssets: LibraryImageAssetSummary[],
): Map<string, LibraryImageAssetSummary> {
  return new Map(imageAssets.map((image) => [imageSelectionId(image), image]));
}

function selectedObjectSummaries({
  objects,
  selectedIds,
}: {
  objects: LocalResultObjectSummary[];
  selectedIds: string[];
}): LocalResultObjectSummary[] {
  const objectById = selectedObjectsById(objects);
  return selectedIds.flatMap((selectedId) => {
    if (parseObjectRouteKey(selectedId.slice("object:".length)) === null) {
      return [];
    }

    const object = objectById.get(selectedId);
    return object === undefined ? [] : [object];
  });
}

function selectedImageSummaries({
  imageAssets,
  selectedIds,
}: {
  imageAssets: LibraryImageAssetSummary[];
  selectedIds: string[];
}): LibraryImageAssetSummary[] {
  const imageById = selectedImagesById(imageAssets);
  return selectedIds.flatMap((selectedId) => {
    const image = imageById.get(selectedId);
    return image === undefined ? [] : [image];
  });
}

function affectedImageCount({
  selectedCount,
  selectedObjects,
  viewMode,
}: {
  selectedCount: number;
  selectedObjects: LocalResultObjectSummary[];
  viewMode: GridViewMode;
}): number {
  if (viewMode === "images") {
    return selectedCount;
  }

  return selectedObjects.reduce(
    (totalImages, object) => totalImages + object.image_count,
    0,
  );
}

function actionTitle({
  action,
  imageCount,
  selectedCount,
  viewMode,
}: {
  action: SelectionAction;
  imageCount: number;
  selectedCount: number;
  viewMode: GridViewMode;
}): string {
  const verb = action === "remove" ? "Remove" : "Delete";
  const suffix =
    action === "remove" ? " from this Collection?" : "?";

  if (viewMode === "images") {
    return `${verb} ${selectedCount} ${pluralize(selectedCount, "image")}${suffix}`;
  }

  const objectText = `${selectedCount} ${pluralize(selectedCount, "object")}`;
  const imageText =
    imageCount > 0
      ? ` and ${imageCount} ${pluralize(imageCount, "image")}`
      : "";
  return `${verb} ${objectText}${imageText}${suffix}`;
}

function favoriteWarningLine({
  favoriteCount,
  selectedCount,
  viewMode,
}: {
  favoriteCount: number;
  selectedCount: number;
  viewMode: GridViewMode;
}): string | null {
  if (favoriteCount === 0) {
    return null;
  }

  const noun = selectionNoun(viewMode, favoriteCount);
  const verb = favoriteCount === 1 ? "is" : "are";
  return `${favoriteCount} favorited ${noun} ${verb} included.`;
}

export function selectionActionSummary({
  action,
  imageAssets,
  objects,
  scopeDisplayName,
  selectedIds,
  viewMode,
}: {
  action: SelectionAction;
  imageAssets: LibraryImageAssetSummary[];
  objects: LocalResultObjectSummary[];
  scopeDisplayName: string;
  selectedIds: string[];
  viewMode: GridViewMode;
}): SelectionActionSummary {
  const selectedCount = selectedIds.length;
  const noun = selectionNoun(viewMode, selectedCount);
  const selectedObjects = selectedObjectSummaries({ objects, selectedIds });
  const selectedImages = selectedImageSummaries({ imageAssets, selectedIds });
  const imageCount = affectedImageCount({
    selectedCount,
    selectedObjects,
    viewMode,
  });
  const knownFavoriteCount =
    viewMode === "images"
      ? selectedImages.filter((image) => image.is_favorite).length
      : selectedObjects.filter((object) => object.is_favorite).length;
  const allCollectionLabels =
    viewMode === "images"
      ? selectedImages.flatMap((image) => formattedCollectionLabels(image.collections))
      : selectedObjects.flatMap((object) =>
          hasCollections(object) ? formattedCollectionLabels(object.collections) : [],
        );
  const scopeLabel = formatCollectionDisplayName(scopeDisplayName);
  const otherCollectionLabels = allCollectionLabels.filter(
    (label) => label !== scopeLabel,
  );
  const favoriteLine = favoriteWarningLine({
    favoriteCount: knownFavoriteCount,
    selectedCount,
    viewMode,
  });

  if (action === "remove") {
    const sharedLine = collectionSummaryLine(otherCollectionLabels);
    return {
      bodyLines: [
        `The selected ${noun} will stay in My Library.`,
        `Other Collections keep ${selectedCount === 1 ? "it" : "them"}.`,
        "Future searches in this Collection will not download, import, reactivate, or add it again.",
        ...(sharedLine === null ? [] : [sharedLine]),
      ],
      confirmLabel: "Remove from Collection",
      description: `Remove selected ${selectionNoun(viewMode, selectedCount)} from ${scopeLabel}.`,
      title: actionTitle({
        action,
        imageCount,
        selectedCount,
        viewMode,
      }),
    };
  }

  const collectionLine = collectionSummaryLine(allCollectionLabels);
  return {
    bodyLines: [
      `The selected ${noun} leaves My Library and all Collections.`,
      ...(collectionLine === null ? [] : [collectionLine]),
      ...(favoriteLine === null ? [] : [favoriteLine]),
      "Local files will be deleted.",
      "Exports are not deleted.",
      "Future searches may import the same material again.",
    ],
    confirmLabel: "Delete",
    description: `Delete selected ${noun}.`,
    title: actionTitle({
      action,
      imageCount,
      selectedCount,
      viewMode,
    }),
  };
}
