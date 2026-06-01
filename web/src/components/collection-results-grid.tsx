import Link from "next/link";
import { Database, Search } from "lucide-react";

import { CollectionResultSelectionSurface } from "@/components/collection-result-selection-surface";
import { CollectionResultSetSearchForm } from "@/components/collection-result-set-search-form";
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
  type CollectionProviderFacet,
  type CollectionResultCounts,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
} from "@/lib/collection-objects";
import { createGridStateHref, type GridViewMode, type ObjectRouteRef } from "@/lib/grid-view";

type CollectionResultsGridProps = {
  apiBaseUrl: string;
  closeImageHref: string;
  closeObjectHref: string;
  collectionDisplayName: string;
  collectionFilterText: string;
  hasLocalMaterial?: boolean;
  imageAssets: LibraryImageAssetSummary[];
  initialSelectedIds?: string[];
  initialSelectionMode?: boolean;
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
  collectionDisplayName,
  collectionFilterText,
  hasLocalMaterial = false,
  imageAssets,
  initialSelectedIds = [],
  initialSelectionMode = false,
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
        ) : (
          <CollectionResultSelectionSurface
            apiBaseUrl={apiBaseUrl}
            closeImageHref={closeImageHref}
            closeObjectHref={closeObjectHref}
            collectionDisplayName={collectionDisplayName}
            collectionFilterText={collectionFilterText}
            imageAssets={imageAssets}
            initialSelectedIds={initialSelectedIds}
            initialSelectionMode={initialSelectionMode}
            key={`${searchSetSlug}:${viewMode}`}
            localQueryText={localQueryText}
            objects={objects}
            providerFilter={providerFilter}
            resolvedImageAssetId={resolvedImageAssetId}
            resolvedObject={resolvedObject}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
          />
        )}
      </CardContent>
    </Card>
  );
}
