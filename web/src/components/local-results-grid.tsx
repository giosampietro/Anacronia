"use client";

import Link from "next/link";
import { Bookmark, Database, Search } from "lucide-react";

import { LocalResultSelectionSurface } from "@/components/local-result-selection-surface";
import { LocalResultSetSearchForm } from "@/components/collection-result-set-search-form";
import { GridViewSwitch } from "@/components/grid-view-switch";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
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
  type LibraryObjectSummary,
} from "@/lib/collection-objects";
import {
  createGridStateHref,
  type GridViewMode,
  type LibraryCollectionFilter,
  type ObjectRouteRef,
} from "@/lib/grid-view";
import type { WorkspaceMode } from "@/lib/workspace";

type LocalResultObjectSummary = CollectionObjectSummary | LibraryObjectSummary;

type LocalResultsGridProps = {
  apiBaseUrl: string;
  closeImageHref: string;
  closeObjectHref: string;
  collectionFilterText?: string;
  curationActionsDisabled?: boolean;
  deleteEndpoint?: string;
  exportEndpoint?: string;
  favoriteOnly?: boolean;
  hasLocalMaterial?: boolean;
  libraryCollectionFilter?: LibraryCollectionFilter;
  imageAssetHref: (imageAsset: LibraryImageAssetSummary) => string;
  imageAssetTileId: (imageAsset: LibraryImageAssetSummary) => string;
  imageAssets: LibraryImageAssetSummary[];
  imageCollectionsLabel?: (imageAsset: LibraryImageAssetSummary) => string;
  imageTopBadgeLabel?: (imageAsset: LibraryImageAssetSummary) => string;
  initialSelectedIds?: string[];
  initialSelectionMode?: boolean;
  localQueryText: string;
  objectCollectionLabel: (collectionObject: LocalResultObjectSummary) => string;
  objectHref: (collectionObject: LocalResultObjectSummary) => string;
  objectTileId: (collectionObject: LocalResultObjectSummary) => string;
  objects: LocalResultObjectSummary[];
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
  resultCounts: CollectionResultCounts;
  scopeDisplayName: string;
  searchAriaLabel: string;
  searchSetSlug?: string;
  removeFromCollectionEndpoint?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
};

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
  favoriteOnly,
  libraryCollectionFilter,
  localQueryText,
  providerFilter,
  resultCounts,
  searchSetSlug,
  viewMode,
  workspaceMode,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  providerFilter: string;
  resultCounts: CollectionResultCounts;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
}) {
  const objectHref = createGridStateHref({
    collectionFilterText,
    favoriteOnly,
    libraryCollectionFilter,
    localQueryText,
    provider: providerFilter,
    searchSetSlug,
    viewMode: "objects",
    workspaceMode,
  });
  const imageHref = createGridStateHref({
    collectionFilterText,
    favoriteOnly,
    libraryCollectionFilter,
    localQueryText,
    provider: providerFilter,
    searchSetSlug,
    viewMode: "images",
    workspaceMode,
  });

  return (
    <GridViewSwitch
      ariaLabel="Object and Image result views"
      className="shrink-0"
      imageCount={resultCounts.images}
      imageHref={imageHref}
      objectCount={resultCounts.objects}
      objectHref={objectHref}
      viewMode={viewMode}
    />
  );
}

function ProviderFacets({
  collectionFilterText,
  favoriteOnly,
  libraryCollectionFilter,
  localQueryText,
  providerFacets,
  providerFilter,
  resultCounts,
  searchSetSlug,
  viewMode,
  workspaceMode,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resultCounts: CollectionResultCounts;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
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
          favoriteOnly,
          libraryCollectionFilter,
          localQueryText,
          provider: "all",
          searchSetSlug,
          viewMode,
          workspaceMode,
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
              favoriteOnly,
              libraryCollectionFilter,
              localQueryText,
              provider: facet.provider,
              searchSetSlug,
              viewMode,
              workspaceMode,
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

function FavoriteFilter({
  collectionFilterText,
  favoriteOnly,
  libraryCollectionFilter,
  localQueryText,
  providerFilter,
  searchSetSlug,
  viewMode,
  workspaceMode,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  providerFilter: string;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
}) {
  return (
    <Link
      aria-current={favoriteOnly ? "page" : undefined}
      className={buttonVariants({
        size: "sm",
        variant: favoriteOnly ? "secondary" : "outline",
      })}
      href={createGridStateHref({
        collectionFilterText,
        favoriteOnly: !favoriteOnly,
        libraryCollectionFilter,
        localQueryText,
        provider: providerFilter,
        searchSetSlug,
        viewMode,
        workspaceMode,
      })}
      scroll={false}
    >
      <Bookmark data-icon="inline-start" />
      Favorites
    </Link>
  );
}

function NoCollectionFilter({
  collectionFilterText,
  favoriteOnly,
  libraryCollectionFilter,
  localQueryText,
  providerFilter,
  viewMode,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  providerFilter: string;
  viewMode: GridViewMode;
}) {
  const isActive = libraryCollectionFilter === "none";

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={buttonVariants({
        size: "sm",
        variant: isActive ? "secondary" : "outline",
      })}
      href={createGridStateHref({
        collectionFilterText,
        favoriteOnly,
        libraryCollectionFilter: isActive ? "all" : "none",
        localQueryText,
        provider: providerFilter,
        viewMode,
        workspaceMode: "user-library",
      })}
      scroll={false}
    >
      <Database data-icon="inline-start" />
      No Collection
    </Link>
  );
}

function EmptyResults({
  hasLocalMaterial,
  localQueryText,
  providerFilter,
  viewMode,
  workspaceMode,
}: {
  hasLocalMaterial: boolean;
  localQueryText: string;
  providerFilter: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
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
              : workspaceMode === "user-library"
                ? "Start a Collection search to add local Image Assets to My Library."
                : "Start search to add local Museum Objects and Image Assets to this Collection."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function LocalResultsGrid({
  apiBaseUrl,
  closeImageHref,
  closeObjectHref,
  collectionFilterText = "",
  curationActionsDisabled = false,
  deleteEndpoint,
  exportEndpoint,
  favoriteOnly = false,
  hasLocalMaterial = false,
  libraryCollectionFilter = "all",
  imageAssetHref,
  imageAssetTileId,
  imageAssets,
  imageCollectionsLabel,
  imageTopBadgeLabel,
  initialSelectedIds = [],
  initialSelectionMode = false,
  localQueryText,
  objectCollectionLabel,
  objectHref,
  objectTileId,
  objects,
  providerFacets,
  providerFilter,
  resolvedImageAssetId = null,
  resolvedObject = null,
  resultCounts,
  scopeDisplayName,
  searchAriaLabel,
  searchSetSlug,
  removeFromCollectionEndpoint,
  viewMode,
  workspaceMode,
}: LocalResultsGridProps) {
  const shownCount = viewMode === "objects" ? objects.length : imageAssets.length;
  const emptyState = (
    <EmptyResults
      hasLocalMaterial={hasLocalMaterial}
      localQueryText={localQueryText}
      providerFilter={providerFilter}
      viewMode={viewMode}
      workspaceMode={workspaceMode}
    />
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <LocalResultSetSearchForm
            ariaLabel={searchAriaLabel}
            collectionFilterText={collectionFilterText}
            favoriteOnly={favoriteOnly}
            libraryCollectionFilter={libraryCollectionFilter}
            localQueryText={localQueryText}
            providerFilter={providerFilter}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
            workspaceMode={workspaceMode}
          />
          <ProjectionControls
            collectionFilterText={collectionFilterText}
            favoriteOnly={favoriteOnly}
            libraryCollectionFilter={libraryCollectionFilter}
            localQueryText={localQueryText}
            providerFilter={providerFilter}
            resultCounts={resultCounts}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
            workspaceMode={workspaceMode}
          />
          <ProviderFacets
            collectionFilterText={collectionFilterText}
            favoriteOnly={favoriteOnly}
            libraryCollectionFilter={libraryCollectionFilter}
            localQueryText={localQueryText}
            providerFacets={providerFacets}
            providerFilter={providerFilter}
            resultCounts={resultCounts}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
            workspaceMode={workspaceMode}
          />
          <FavoriteFilter
            collectionFilterText={collectionFilterText}
            favoriteOnly={favoriteOnly}
            libraryCollectionFilter={libraryCollectionFilter}
            localQueryText={localQueryText}
            providerFilter={providerFilter}
            searchSetSlug={searchSetSlug}
            viewMode={viewMode}
            workspaceMode={workspaceMode}
          />
          {workspaceMode === "user-library" ? (
            <NoCollectionFilter
              collectionFilterText={collectionFilterText}
              favoriteOnly={favoriteOnly}
              libraryCollectionFilter={libraryCollectionFilter}
              localQueryText={localQueryText}
              providerFilter={providerFilter}
              viewMode={viewMode}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <LocalResultSelectionSurface
            apiBaseUrl={apiBaseUrl}
            closeImageHref={closeImageHref}
            closeObjectHref={closeObjectHref}
            curationActionsDisabled={curationActionsDisabled}
            deleteEndpoint={deleteEndpoint}
            emptyState={shownCount === 0 ? emptyState : undefined}
            exportEndpoint={exportEndpoint}
            imageAssetHref={imageAssetHref}
            imageAssetTileId={imageAssetTileId}
            imageAssets={imageAssets}
            imageCollectionsLabel={imageCollectionsLabel}
            imageTopBadgeLabel={imageTopBadgeLabel}
            initialSelectedIds={initialSelectedIds}
            initialSelectionMode={initialSelectionMode}
            key={`${workspaceMode}:${searchSetSlug ?? "library"}:${viewMode}:${providerFilter}:${localQueryText}:${collectionFilterText}:${favoriteOnly ? "favorite" : "all"}:${libraryCollectionFilter}`}
            objectCollectionLabel={objectCollectionLabel}
            objectHref={objectHref}
            objectTileId={objectTileId}
            objects={objects}
            resolvedImageAssetId={resolvedImageAssetId}
            resolvedObject={resolvedObject}
            scopeDisplayName={scopeDisplayName}
            removeFromCollectionEndpoint={removeFromCollectionEndpoint}
            viewMode={viewMode}
          />
      </CardContent>
    </Card>
  );
}
