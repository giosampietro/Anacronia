import { Database, Images } from "lucide-react";

import {
  ImageAssetDetailPendingLink,
} from "@/components/image-asset-detail-overlay";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  imageUrl,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
} from "@/lib/collection-objects";
import type { GridViewMode, ObjectRouteRef } from "@/lib/grid-view";
import {
  IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
  IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME,
  IMAGE_GRID_TILE_CLASS_NAME,
} from "@/lib/image-grid-style";

type CollectionResultsGridProps = {
  apiBaseUrl: string;
  closeImageHref: string;
  closeObjectHref: string;
  collectionDisplayName: string;
  createImageAssetHref: (imageAsset: LibraryImageAssetSummary) => string;
  createObjectHref: (collectionObject: CollectionObjectSummary) => string;
  imageAssets: LibraryImageAssetSummary[];
  objects: CollectionObjectSummary[];
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
  viewMode: GridViewMode;
};

export function createCollectionObjectTileId(
  provider: string,
  objectId: number,
): string {
  return `collection-object-${provider}-${objectId}`;
}

export function createCollectionImageAssetTileId(imageAssetId: number): string {
  return `collection-image-asset-${imageAssetId}`;
}

function objectProviderDisplayLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
}

function EmptyResults({ viewMode }: { viewMode: GridViewMode }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Database />
        </EmptyMedia>
        <EmptyTitle>
          {viewMode === "objects" ? "No Objects yet" : "No Image Assets yet"}
        </EmptyTitle>
        <EmptyDescription>
          Start search to add local Museum Objects and Image Assets to this Collection.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function CollectionResultsGrid({
  apiBaseUrl,
  closeImageHref,
  closeObjectHref,
  collectionDisplayName,
  createImageAssetHref,
  createObjectHref,
  imageAssets,
  objects,
  resolvedImageAssetId = null,
  resolvedObject = null,
  viewMode,
}: CollectionResultsGridProps) {
  const shownCount = viewMode === "objects" ? objects.length : imageAssets.length;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Results</CardTitle>
          <CardDescription>
            {viewMode === "objects"
              ? "Local Museum Objects in this Collection"
              : "Local Image Assets in this Collection"}
          </CardDescription>
        </div>
        <CardAction>
          <Badge variant="secondary">{shownCount} shown</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {shownCount === 0 ? (
          <EmptyResults viewMode={viewMode} />
        ) : viewMode === "objects" ? (
          <div className={IMAGE_GRID_CLASS_NAME}>
            {objects.map((collectionObject) => {
              const collectionObjectProviderLabel = objectProviderDisplayLabel(
                collectionObject.provider,
              );
              const tileId = createCollectionObjectTileId(
                collectionObject.provider,
                collectionObject.object_id,
              );
              const thumbSrc = imageUrl(apiBaseUrl, collectionObject.cover_thumb_url);
              const objectAlt =
                collectionObject.title ||
                `${collectionObjectProviderLabel} object ${collectionObject.object_id}`;
              const tileStateKey =
                resolvedObject !== null &&
                resolvedObject.provider === collectionObject.provider &&
                resolvedObject.objectId === collectionObject.object_id
                  ? "resolved"
                  : "grid";

              return (
                <ObjectDetailPendingLink
                  ariaLabel={`Open ${collectionObjectProviderLabel} object ${collectionObject.object_id}`}
                  className={IMAGE_GRID_TILE_CLASS_NAME}
                  closeHref={closeObjectHref}
                  href={createObjectHref(collectionObject)}
                  id={tileId}
                  key={`${collectionObject.provider}-${collectionObject.object_id}-${tileStateKey}`}
                  preview={{
                    alt: objectAlt,
                    collectionLabel: collectionDisplayName,
                    height: collectionObject.cover_original_height,
                    imageCount: collectionObject.image_count,
                    providerLabel: collectionObjectProviderLabel,
                    src: thumbSrc,
                    title: collectionObject.title || "Untitled object",
                    width: collectionObject.cover_original_width,
                  }}
                >
                  <AspectRatio ratio={4 / 5}>
                    <ImageGridThumbnail alt={objectAlt} src={thumbSrc} />
                    {collectionObject.has_sibling_images ? (
                      <span
                        aria-label={`${collectionObject.image_count} images`}
                        className={IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME}
                      >
                        <Images data-icon="inline-start" />
                        {collectionObject.image_count}
                      </span>
                    ) : null}
                    <Badge
                      className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                      variant="secondary"
                    >
                      {collectionObjectProviderLabel}
                    </Badge>
                    <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                      <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                        {collectionObject.title || "Untitled object"}
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
              const imageAssetProviderLabel = objectProviderDisplayLabel(
                imageAsset.provider,
              );
              const tileId = createCollectionImageAssetTileId(
                imageAsset.image_asset_id,
              );
              const thumbSrc = imageUrl(apiBaseUrl, imageAsset.thumb_url);
              const imageAssetAlt =
                imageAsset.title ||
                `${imageAssetProviderLabel} Image Asset ${imageAsset.image_asset_id}`;
              const tileStateKey =
                resolvedImageAssetId === imageAsset.image_asset_id ? "resolved" : "grid";

              return (
                <ImageAssetDetailPendingLink
                  ariaLabel={`Open ${imageAssetProviderLabel} Image Asset ${imageAsset.image_asset_id}`}
                  className={IMAGE_GRID_TILE_CLASS_NAME}
                  closeHref={closeImageHref}
                  href={createImageAssetHref(imageAsset)}
                  id={tileId}
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
                    <Badge
                      className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                      variant="secondary"
                    >
                      {imageAssetProviderLabel}
                    </Badge>
                    <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                      <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                        {imageAsset.title || "Untitled object"}
                      </p>
                    </div>
                  </AspectRatio>
                </ImageAssetDetailPendingLink>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
