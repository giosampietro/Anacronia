import Link from "next/link";
import { Database, Images, Search } from "lucide-react";

import {
  ImageAssetDetailPendingLink,
} from "@/components/image-asset-detail-overlay";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  imageUrl,
  type CollectionProviderFacet,
  type CollectionResultCounts,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
} from "@/lib/collection-objects";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import {
  createGridStateHref,
  type GridViewMode,
  type ObjectRouteRef,
} from "@/lib/grid-view";
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
  collectionFilterText: string;
  collectionDisplayName: string;
  createImageAssetHref: (imageAsset: LibraryImageAssetSummary) => string;
  createObjectHref: (collectionObject: CollectionObjectSummary) => string;
  hasLocalMaterial?: boolean;
  imageAssets: LibraryImageAssetSummary[];
  localQueryText: string;
  objects: CollectionObjectSummary[];
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
  resultCounts: CollectionResultCounts;
  searchSetSlug: string;
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

function viewNoun(viewMode: GridViewMode): string {
  return viewMode === "objects" ? "Objects" : "Image Assets";
}

function viewCountLabel(viewMode: GridViewMode, counts: CollectionResultCounts): number {
  return viewMode === "objects" ? counts.objects : counts.images;
}

function CollectionResultSetSearchForm({
  collectionFilterText,
  localQueryText,
  providerFilter,
  searchSetSlug,
  viewMode,
}: {
  collectionFilterText: string;
  localQueryText: string;
  providerFilter: string;
  searchSetSlug: string;
  viewMode: GridViewMode;
}) {
  return (
    <form action="/" className="min-w-[min(100%,20rem)] flex-1">
      <input name="search_set" type="hidden" value={searchSetSlug} />
      {viewMode === "images" ? (
        <input name="view" type="hidden" value="images" />
      ) : null}
      {collectionFilterText.trim() !== "" ? (
        <input
          name="collection_filter"
          type="hidden"
          value={collectionFilterText.trim()}
        />
      ) : null}
      {providerFilter !== "all" ? (
        <input name="provider" type="hidden" value={providerFilter} />
      ) : null}
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search local Collection results"
          defaultValue={localQueryText}
          name="q"
          placeholder="Search local results"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit">Search</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

function ProjectionControls({
  collectionFilterText,
  localQueryText,
  providerFilter,
  resultCounts,
  searchSetSlug,
  viewMode,
}: {
  collectionFilterText: string;
  localQueryText: string;
  providerFilter: string;
  resultCounts: CollectionResultCounts;
  searchSetSlug: string;
  viewMode: GridViewMode;
}) {
  const items: { label: string; mode: GridViewMode; count: number }[] = [
    { label: "Objects", mode: "objects", count: resultCounts.objects },
    { label: "Images", mode: "images", count: resultCounts.images },
  ];

  return (
    <div aria-label="Object and Image result views" className="flex shrink-0 gap-1">
      {items.map((item) => {
        const isActive = viewMode === item.mode;
        const href = createGridStateHref({
          collectionFilterText,
          localQueryText,
          provider: providerFilter,
          searchSetSlug,
          viewMode: item.mode,
          workspaceMode: "search-set",
        });

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={buttonVariants({
              size: "sm",
              variant: isActive ? "secondary" : "outline",
            })}
            href={href}
            key={item.mode}
            scroll={false}
          >
            {item.label}
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {item.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ProviderFacets({
  collectionFilterText,
  localQueryText,
  providerFacets,
  providerFilter,
  resultCounts,
  searchSetSlug,
  viewMode,
}: {
  collectionFilterText: string;
  localQueryText: string;
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resultCounts: CollectionResultCounts;
  searchSetSlug: string;
  viewMode: GridViewMode;
}) {
  const allCount = viewCountLabel(viewMode, resultCounts);

  return (
    <div aria-label="Provider filters" className="flex min-w-0 flex-wrap gap-1">
      <Link
        aria-current={providerFilter === "all" ? "page" : undefined}
        className={buttonVariants({
          size: "sm",
          variant: providerFilter === "all" ? "secondary" : "outline",
        })}
        href={createGridStateHref({
          collectionFilterText,
          localQueryText,
          provider: "all",
          searchSetSlug,
          viewMode,
          workspaceMode: "search-set",
        })}
        scroll={false}
      >
        All Providers
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {allCount}
        </span>
      </Link>
      {providerFacets.map((facet) => {
        const isActive = providerFilter === facet.provider;
        const count = viewMode === "objects" ? facet.objectCount : facet.imageCount;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={buttonVariants({
              size: "sm",
              variant: isActive ? "secondary" : "outline",
            })}
            href={createGridStateHref({
              collectionFilterText,
              localQueryText,
              provider: facet.provider,
              searchSetSlug,
              viewMode,
              workspaceMode: "search-set",
            })}
            key={facet.provider}
            scroll={false}
          >
            {objectProviderDisplayLabel(facet.provider)}
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function EmptyResults({
  hasLocalMaterial,
  localQueryText,
  providerFilter,
  viewMode,
}: {
  hasLocalMaterial: boolean;
  localQueryText: string;
  providerFilter: string;
  viewMode: GridViewMode;
}) {
  const noun = viewNoun(viewMode);
  const trimmedQuery = localQueryText.trim();
  const hasActiveFilter = trimmedQuery !== "" || providerFilter !== "all";

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {hasLocalMaterial && hasActiveFilter ? <Search /> : <Database />}
        </EmptyMedia>
        <EmptyTitle>
          {hasLocalMaterial && hasActiveFilter
            ? `No matching ${noun}`
            : `No ${noun} yet`}
        </EmptyTitle>
        <EmptyDescription>
          {hasLocalMaterial && trimmedQuery !== ""
            ? `No ${noun.toLowerCase()} matched "${trimmedQuery}".`
            : hasLocalMaterial
              ? `No ${noun.toLowerCase()} matched this Provider.`
              : "Start search to add local Museum Objects and Image Assets to this Collection."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function CollectionResultsGrid({
  apiBaseUrl,
  closeImageHref,
  closeObjectHref,
  collectionFilterText,
  collectionDisplayName,
  createImageAssetHref,
  createObjectHref,
  hasLocalMaterial = false,
  imageAssets,
  localQueryText,
  objects,
  providerFacets,
  providerFilter,
  resolvedImageAssetId = null,
  resolvedObject = null,
  resultCounts,
  searchSetSlug,
  viewMode,
}: CollectionResultsGridProps) {
  const shownCount = viewMode === "objects" ? objects.length : imageAssets.length;
  const formattedCollectionDisplayName = formatCollectionDisplayName(
    collectionDisplayName,
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-4">
        <div className="min-w-0">
          <CardTitle>Results</CardTitle>
          <CardDescription>
            {viewMode === "objects"
              ? "Local Museum Objects in this Collection"
              : "Local Image Assets in this Collection"}
          </CardDescription>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CollectionResultSetSearchForm
            collectionFilterText={collectionFilterText}
            localQueryText={localQueryText}
            providerFilter={providerFilter}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
          />
          <ProjectionControls
            collectionFilterText={collectionFilterText}
            localQueryText={localQueryText}
            providerFilter={providerFilter}
            resultCounts={resultCounts}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
          />
          <ProviderFacets
            collectionFilterText={collectionFilterText}
            localQueryText={localQueryText}
            providerFacets={providerFacets}
            providerFilter={providerFilter}
            resultCounts={resultCounts}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
          />
        </div>
      </CardHeader>
      <CardContent>
        {shownCount === 0 ? (
          <EmptyResults
            hasLocalMaterial={hasLocalMaterial}
            localQueryText={localQueryText}
            providerFilter={providerFilter}
            viewMode={viewMode}
          />
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
                    collectionLabel: formattedCollectionDisplayName,
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
