import { Database, Images, Search } from "lucide-react";

import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import { imageUrl, type LibraryImageAssetSummary } from "@/lib/collection-objects";
import {
  IMAGE_GRID_BADGE_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_IMAGE_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
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
import { createUserLibraryHref } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type UserLibraryWorkspaceProps = {
  apiBaseUrl: string;
  filterText: string;
  imageAssets: LibraryImageAssetSummary[];
  imageCount: number;
  resolvedImageAssetId?: number | null;
};

export function createLibraryImageAssetTileId(imageAssetId: number): string {
  return `library-image-asset-${imageAssetId}`;
}

export function createLibraryImageAssetHref(
  imageAsset: LibraryImageAssetSummary,
  filterText: string,
): string {
  const params = new URLSearchParams({
    mode: "user-library",
    image_asset_id: String(imageAsset.image_asset_id),
    object_provider: imageAsset.provider,
    object_id: String(imageAsset.object_id),
  });
  const firstCollection = imageAsset.collections[0];
  if (firstCollection !== undefined) {
    params.set("search_set", firstCollection.slug);
  }
  if (filterText.trim() !== "") {
    params.set("filter", filterText.trim());
  }

  return `/?${params.toString()}`;
}

function providerLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider;
}

function collectionLabel(imageAsset: LibraryImageAssetSummary): string {
  if (imageAsset.collections.length === 0) {
    return "No Collection";
  }

  const [firstCollection, ...extraCollections] = imageAsset.collections;
  return extraCollections.length === 0
    ? firstCollection.display_name
    : `${firstCollection.display_name} +${extraCollections.length}`;
}

function EmptyLibraryState({
  filterText,
  imageCount,
}: {
  filterText: string;
  imageCount: number;
}) {
  const hasFilter = filterText.trim() !== "";
  const isFilteredEmpty = imageCount > 0 && hasFilter;

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {isFilteredEmpty ? <Search /> : <Database />}
        </EmptyMedia>
        <EmptyTitle>
          {isFilteredEmpty ? "No matching Image Assets" : "No Image Assets yet"}
        </EmptyTitle>
        <EmptyDescription>
          {isFilteredEmpty
            ? `No Image Assets matched "${filterText.trim()}".`
            : "Start a Collection search to add local Image Assets to the User Library."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function UserLibraryWorkspace({
  apiBaseUrl,
  filterText,
  imageAssets,
  imageCount,
  resolvedImageAssetId = null,
}: UserLibraryWorkspaceProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-7">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Library</p>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
          User Library
        </h1>
        <p className="text-sm text-muted-foreground">
          {`${imageCount} collected Image Asset${imageCount === 1 ? "" : "s"} across all Collections.`}
        </p>
      </header>

      {imageAssets.length === 0 ? (
        <EmptyLibraryState filterText={filterText} imageCount={imageCount} />
      ) : (
        <div className={IMAGE_GRID_CLASS_NAME}>
          {imageAssets.map((imageAsset) => {
            const imageAssetProviderLabel = providerLabel(imageAsset.provider);
            const thumbSrc = imageUrl(apiBaseUrl, imageAsset.thumb_url);
            const imageAssetAlt = `${imageAssetProviderLabel} Image Asset ${imageAsset.image_asset_id}`;
            const tileStateKey =
              resolvedImageAssetId === imageAsset.image_asset_id ? "resolved" : "grid";

            return (
              <ObjectDetailPendingLink
                ariaLabel={`Open ${imageAssetAlt}`}
                className={IMAGE_GRID_TILE_CLASS_NAME}
                closeHref={createUserLibraryHref(filterText)}
                href={createLibraryImageAssetHref(imageAsset, filterText)}
                id={createLibraryImageAssetTileId(imageAsset.image_asset_id)}
                key={`${imageAsset.image_asset_id}-${tileStateKey}`}
                preview={{
                  alt: imageAssetAlt,
                  collectionLabel: collectionLabel(imageAsset),
                  imageCount: imageAsset.image_count,
                  providerLabel: imageAssetProviderLabel,
                  src: thumbSrc,
                }}
              >
                <AspectRatio ratio={4 / 5}>
                  {/* Anacronia serves already-sized local derivatives from FastAPI. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={imageAssetAlt}
                    className={IMAGE_GRID_IMAGE_CLASS_NAME}
                    src={thumbSrc}
                  />
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
                    {imageAsset.has_sibling_images ? (
                      <Badge
                        className={cn("shrink-0", IMAGE_GRID_BADGE_CLASS_NAME)}
                        variant="secondary"
                      >
                        <Images data-icon="inline-start" />
                        {imageAsset.image_count}
                      </Badge>
                    ) : null}
                  </div>
                  <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                    <Badge className={IMAGE_GRID_BADGE_CLASS_NAME} variant="secondary">
                      {imageAssetProviderLabel}
                    </Badge>
                    <p className="sr-only">
                      {imageAsset.collections
                        .map((collection) => collection.display_name)
                        .join(", ")}
                    </p>
                  </div>
                </AspectRatio>
              </ObjectDetailPendingLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
