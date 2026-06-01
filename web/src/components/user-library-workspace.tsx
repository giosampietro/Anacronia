import { Database, Images, Search } from "lucide-react";

import {
  ImageAssetDetailPendingLink,
} from "@/components/image-asset-detail-overlay";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import {
  imageUrl,
  type LibraryImageAssetSummary,
  type LibraryObjectSummary,
} from "@/lib/collection-objects";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import {
  createGridStateHref,
  type GridViewMode,
  type ObjectRouteRef,
} from "@/lib/grid-view";
import {
  IMAGE_GRID_BADGE_CLASS_NAME,
  IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
  IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME,
  IMAGE_GRID_TILE_CLASS_NAME,
} from "@/lib/image-grid-style";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type UserLibraryWorkspaceProps = {
  apiBaseUrl: string;
  filterText: string;
  gridViewMode: GridViewMode;
  imageAssets: LibraryImageAssetSummary[];
  imageCount: number;
  objects: LibraryObjectSummary[];
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
};

export function createLibraryObjectTileId(provider: string, objectId: number): string {
  return `library-object-${provider}-${objectId}`;
}

export function createLibraryImageAssetTileId(imageAssetId: number): string {
  return `library-image-asset-${imageAssetId}`;
}

export function createLibraryObjectHref(
  libraryObject: LibraryObjectSummary | LibraryImageAssetSummary,
  filterText: string,
  viewMode: GridViewMode = "objects",
): string {
  return createGridStateHref({
    filterText,
    object: {
      objectId: libraryObject.object_id,
      provider: libraryObject.provider,
    },
    searchSetSlug: libraryObject.collections[0]?.slug,
    viewMode,
    workspaceMode: "user-library",
  });
}

export function createLibraryImageAssetHref(
  imageAsset: LibraryImageAssetSummary,
  filterText: string,
): string {
  return createGridStateHref({
    filterText,
    imageAssetId: imageAsset.image_asset_id,
    viewMode: "images",
    workspaceMode: "user-library",
  });
}

function providerLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider;
}

function collectionLabel(item: { collections: { display_name: string }[] }): string {
  if (item.collections.length === 0) {
    return "No Collection";
  }

  const [firstCollection, ...extraCollections] = item.collections;
  const firstCollectionName = formatCollectionDisplayName(
    firstCollection.display_name,
  );

  return extraCollections.length === 0
    ? firstCollectionName
    : `${firstCollectionName} +${extraCollections.length}`;
}

function EmptyLibraryState({
  filterText,
  imageCount,
  viewMode,
}: {
  filterText: string;
  imageCount: number;
  viewMode: GridViewMode;
}) {
  const hasFilter = filterText.trim() !== "";
  const isFilteredEmpty = imageCount > 0 && hasFilter;
  const noun = viewMode === "objects" ? "Objects" : "Image Assets";

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {isFilteredEmpty ? <Search /> : <Database />}
        </EmptyMedia>
        <EmptyTitle>
          {isFilteredEmpty ? `No matching ${noun}` : `No ${noun} yet`}
        </EmptyTitle>
        <EmptyDescription>
          {isFilteredEmpty
            ? `No ${noun} matched "${filterText.trim()}".`
            : "Start a Collection search to add local Image Assets to the User Library."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function UserLibraryWorkspace({
  apiBaseUrl,
  filterText,
  gridViewMode,
  imageAssets,
  imageCount,
  objects,
  resolvedImageAssetId = null,
  resolvedObject = null,
}: UserLibraryWorkspaceProps) {
  const closeHref = createGridStateHref({
    filterText,
    viewMode: gridViewMode,
    workspaceMode: "user-library",
  });
  const shownCount = gridViewMode === "objects" ? objects.length : imageAssets.length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-7">
      {shownCount === 0 ? (
        <EmptyLibraryState
          filterText={filterText}
          imageCount={imageCount}
          viewMode={gridViewMode}
        />
      ) : gridViewMode === "objects" ? (
        <div className={IMAGE_GRID_CLASS_NAME}>
          {objects.map((libraryObject) => {
            const libraryObjectProviderLabel = providerLabel(libraryObject.provider);
            const thumbSrc = imageUrl(apiBaseUrl, libraryObject.cover_thumb_url);
            const objectAlt =
              libraryObject.title ||
              `${libraryObjectProviderLabel} object ${libraryObject.object_id}`;
            const tileStateKey =
              resolvedObject !== null &&
              resolvedObject.provider === libraryObject.provider &&
              resolvedObject.objectId === libraryObject.object_id
                ? "resolved"
                : "grid";

            return (
              <ObjectDetailPendingLink
                ariaLabel={`Open ${libraryObjectProviderLabel} object ${libraryObject.object_id}`}
                className={IMAGE_GRID_TILE_CLASS_NAME}
                closeHref={closeHref}
                href={createLibraryObjectHref(libraryObject, filterText)}
                id={createLibraryObjectTileId(
                  libraryObject.provider,
                  libraryObject.object_id,
                )}
                key={`${libraryObject.provider}-${libraryObject.object_id}-${tileStateKey}`}
                preview={{
                  alt: objectAlt,
                  collectionLabel: collectionLabel(libraryObject),
                  height: libraryObject.cover_original_height,
                  imageCount: libraryObject.image_count,
                  providerLabel: libraryObjectProviderLabel,
                  src: thumbSrc,
                  title: libraryObject.title || "Untitled object",
                  width: libraryObject.cover_original_width,
                }}
              >
                <AspectRatio ratio={4 / 5}>
                  <ImageGridThumbnail alt={objectAlt} src={thumbSrc} />
                  {libraryObject.has_sibling_images ? (
                    <span
                      aria-label={`${libraryObject.image_count} images`}
                      className={IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME}
                    >
                      <Images data-icon="inline-start" />
                      {libraryObject.image_count}
                    </span>
                  ) : null}
                  <Badge
                    className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                    variant="secondary"
                  >
                    {libraryObjectProviderLabel}
                  </Badge>
                  <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                      {libraryObject.title || "Untitled object"}
                    </p>
                  </div>
                </AspectRatio>
              </ObjectDetailPendingLink>
            );
          })}
        </div>
      ) : (
        <div className={IMAGE_GRID_CLASS_NAME}>
          {imageAssets.map((imageAsset) => {
            const imageAssetProviderLabel = providerLabel(imageAsset.provider);
            const thumbSrc = imageUrl(apiBaseUrl, imageAsset.thumb_url);
            const imageAssetAlt = `${imageAssetProviderLabel} Image Asset ${imageAsset.image_asset_id}`;
            const tileStateKey =
              resolvedImageAssetId === imageAsset.image_asset_id ? "resolved" : "grid";

            return (
              <ImageAssetDetailPendingLink
                ariaLabel={`Open ${imageAssetAlt}`}
                className={IMAGE_GRID_TILE_CLASS_NAME}
                closeHref={closeHref}
                href={createLibraryImageAssetHref(imageAsset, filterText)}
                id={createLibraryImageAssetTileId(imageAsset.image_asset_id)}
                key={`${imageAsset.image_asset_id}-${tileStateKey}`}
                preview={{
                  alt: imageAssetAlt,
                  height: imageAsset.original_height,
                  parentTitle: imageAsset.title || "Untitled object",
                  providerLabel: imageAssetProviderLabel,
                  src: thumbSrc,
                  title: "Image Asset",
                  width: imageAsset.original_width,
                }}
              >
                <AspectRatio ratio={4 / 5}>
                  <ImageGridThumbnail alt={imageAssetAlt} src={thumbSrc} />
                  <div className="absolute inset-x-2 top-2 flex translate-y-1 items-start justify-between gap-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    <Badge
                      className={cn(
                        "min-w-0 max-w-[70%] truncate",
                        IMAGE_GRID_BADGE_CLASS_NAME,
                      )}
                      variant="secondary"
                    >
                      {collectionLabel(imageAsset)}
                    </Badge>
                  </div>
                  <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                    <Badge className={IMAGE_GRID_BADGE_CLASS_NAME} variant="secondary">
                      {imageAssetProviderLabel}
                    </Badge>
                    <p className="sr-only">
                      {imageAsset.collections
                        .map((collection) =>
                          formatCollectionDisplayName(collection.display_name),
                        )
                        .join(", ")}
                    </p>
                  </div>
                </AspectRatio>
              </ImageAssetDetailPendingLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
