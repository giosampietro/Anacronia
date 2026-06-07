"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Bookmark, Database, ListFilter, Search } from "lucide-react";

import { LocalResultSelectionSurface } from "@/components/local-result-selection-surface";
import { LocalResultSetSearchForm } from "@/components/collection-result-set-search-form";
import { GridViewSwitch } from "@/components/grid-view-switch";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";
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
  headerActionControls?: ReactNode;
  hasLocalMaterial?: boolean;
  libraryCollectionFilter?: LibraryCollectionFilter;
  noCollectionCounts?: CollectionResultCounts;
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

type HeaderControlDensity = "default" | "with-actions";

function objectProviderDisplayLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }
  if (provider === "vam") {
    return "V&A";
  }

  return provider.trim() || "Unknown";
}

function viewNoun(viewMode: GridViewMode): string {
  return viewMode === "objects" ? "Objects" : "Image Assets";
}

function viewCountLabel(viewMode: GridViewMode, counts: CollectionResultCounts): number {
  return viewMode === "objects" ? counts.objects : counts.images;
}

type ProviderOption = {
  count: number;
  label: string;
  provider: string;
};

function createProviderOptions({
  providerFacets,
  providerFilter,
  resultCounts,
  viewMode,
}: {
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resultCounts: CollectionResultCounts;
  viewMode: GridViewMode;
}): ProviderOption[] {
  const facetOptions = providerFacets.map((facet) => ({
    count: viewMode === "objects" ? facet.objectCount : facet.imageCount,
    label: objectProviderDisplayLabel(facet.provider),
    provider: facet.provider,
  }));
  const options = [
    {
      count: viewCountLabel(viewMode, resultCounts),
      label: "All Providers",
      provider: "all",
    },
    ...facetOptions,
  ];

  if (
    providerFilter !== "all" &&
    !options.some((option) => option.provider === providerFilter)
  ) {
    options.push({
      count: viewCountLabel(viewMode, resultCounts),
      label: objectProviderDisplayLabel(providerFilter),
      provider: providerFilter,
    });
  }

  return options;
}

function ProviderCount({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      {count}
    </span>
  );
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
  density,
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
  density?: HeaderControlDensity;
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
      labelClassName={
        density === "with-actions"
          ? "@min-[960px]/topbar:inline"
          : undefined
      }
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
  density,
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
  density?: HeaderControlDensity;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const options = createProviderOptions({
    providerFacets,
    providerFilter,
    resultCounts,
    viewMode,
  });
  const value = options.some((option) => option.provider === providerFilter)
    ? providerFilter
    : "all";

  return (
    <Select
      disabled={isPending}
      onValueChange={(nextProvider) => {
        if (typeof nextProvider !== "string") {
          return;
        }

        startTransition(() => {
          router.replace(
            createGridStateHref({
              collectionFilterText,
              favoriteOnly,
              libraryCollectionFilter,
              localQueryText,
              provider: nextProvider,
              searchSetSlug,
              viewMode,
              workspaceMode,
            }),
            { scroll: false },
          );
        });
      }}
      value={value}
    >
      <SelectTrigger
        aria-label="Provider"
        className={cn(
          "w-32 shrink-0 justify-between @min-[900px]/topbar:w-40 @min-[1060px]/topbar:w-44",
          density === "with-actions"
            ? "@max-[1039px]/topbar:hidden"
            : "@max-[759px]/topbar:hidden",
        )}
        size="sm"
      >
        <SelectValue>
          {(selectedProvider) => {
            const option =
              options.find((candidate) => candidate.provider === selectedProvider) ??
              options[0];

            return (
              <>
                <span className="truncate">{option.label}</span>
                <ProviderCount
                  className="hidden @min-[820px]/topbar:inline"
                  count={option.count}
                />
              </>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-48">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.provider}
              label={option.label}
              value={option.provider}
            >
              <span className="truncate">{option.label}</span>
              <ProviderCount count={option.count} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
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
  density,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  providerFilter: string;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
  density?: HeaderControlDensity;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            aria-current={favoriteOnly ? "page" : undefined}
            aria-label="Favorites"
            className={buttonVariants({
              className: cn(
                "px-2 @min-[960px]/topbar:px-3",
                density === "with-actions"
                  ? "@max-[1039px]/topbar:hidden @min-[1040px]/topbar:inline-flex"
                  : "@max-[759px]/topbar:hidden @min-[760px]/topbar:inline-flex",
              ),
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
          />
        }
      >
        <Bookmark
          className={favoriteOnly ? "fill-current text-white" : undefined}
          data-icon="inline-start"
          fill={favoriteOnly ? "currentColor" : "none"}
        />
        <span className="hidden @min-[960px]/topbar:inline">Favorites</span>
      </TooltipTrigger>
      <TooltipContent className="@min-[960px]/topbar:hidden" side="bottom">
        Favorites
      </TooltipContent>
    </Tooltip>
  );
}

function NoCollectionFilter({
  collectionFilterText,
  favoriteOnly,
  libraryCollectionFilter,
  localQueryText,
  noCollectionCount,
  providerFilter,
  viewMode,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  noCollectionCount: number;
  providerFilter: string;
  viewMode: GridViewMode;
}) {
  const isActive = libraryCollectionFilter === "none";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            aria-current={isActive ? "page" : undefined}
            aria-label="No Collection"
            className={buttonVariants({
              className:
                "@max-[759px]/topbar:hidden px-2 @min-[760px]/topbar:inline-flex @min-[1120px]/topbar:px-3",
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
          />
        }
      >
        <Database data-icon="inline-start" />
        <span className="hidden @min-[1120px]/topbar:inline">No Collection</span>
        <ProviderCount
          className="hidden @min-[1120px]/topbar:inline"
          count={noCollectionCount}
        />
      </TooltipTrigger>
      <TooltipContent className="@min-[1120px]/topbar:hidden" side="bottom">
        No Collection
      </TooltipContent>
    </Tooltip>
  );
}

function MobileFiltersMenu({
  collectionFilterText,
  favoriteOnly,
  libraryCollectionFilter,
  localQueryText,
  noCollectionCount,
  providerFacets,
  providerFilter,
  resultCounts,
  searchSetSlug,
  viewMode,
  workspaceMode,
  density,
}: {
  collectionFilterText: string;
  favoriteOnly: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  noCollectionCount: number;
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resultCounts: CollectionResultCounts;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
  density?: HeaderControlDensity;
}) {
  const options = createProviderOptions({
    providerFacets,
    providerFilter,
    resultCounts,
    viewMode,
  });
  const noCollectionActive =
    workspaceMode === "user-library" && libraryCollectionFilter === "none";
  const activeFilterCount =
    (providerFilter === "all" ? 0 : 1) +
    (favoriteOnly ? 1 : 0) +
    (noCollectionActive ? 1 : 0);

  return (
    <div
      className={cn(
        "shrink-0",
        density === "with-actions"
          ? "@min-[1040px]/topbar:hidden"
          : "@min-[760px]/topbar:hidden",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Filters"
              size="sm"
              variant={activeFilterCount > 0 ? "secondary" : "outline"}
            />
          }
        >
          <ListFilter data-icon="inline-start" />
          <span className="@max-[459px]/topbar:hidden">Filters</span>
          {activeFilterCount > 0 ? <ProviderCount count={activeFilterCount} /> : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Provider</DropdownMenuLabel>
          <DropdownMenuGroup>
            {options.map((option) => (
              <DropdownMenuItem
                aria-current={
                  providerFilter === option.provider ? "page" : undefined
                }
                key={option.provider}
                render={
                  <Link
                    href={createGridStateHref({
                      collectionFilterText,
                      favoriteOnly,
                      libraryCollectionFilter,
                      localQueryText,
                      provider: option.provider,
                      searchSetSlug,
                      viewMode,
                      workspaceMode,
                    })}
                    scroll={false}
                  />
                }
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <ProviderCount count={option.count} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              aria-current={favoriteOnly ? "page" : undefined}
              render={
                <Link
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
                />
              }
            >
              <Bookmark
                className={favoriteOnly ? "fill-current text-white" : undefined}
                data-icon="inline-start"
                fill={favoriteOnly ? "currentColor" : "none"}
              />
              <span className="min-w-0 flex-1 truncate">Favorites</span>
              <span className="text-xs text-muted-foreground">
                {favoriteOnly ? "On" : "Off"}
              </span>
            </DropdownMenuItem>
            {workspaceMode === "user-library" ? (
              <DropdownMenuItem
                aria-current={noCollectionActive ? "page" : undefined}
                render={
                  <Link
                    href={createGridStateHref({
                      collectionFilterText,
                      favoriteOnly,
                      libraryCollectionFilter: noCollectionActive ? "all" : "none",
                      localQueryText,
                      provider: providerFilter,
                      viewMode,
                      workspaceMode: "user-library",
                    })}
                    scroll={false}
                  />
                }
              >
                <Database data-icon="inline-start" />
                <span className="min-w-0 flex-1 truncate">No Collection</span>
                <ProviderCount count={noCollectionCount} />
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmptyResults({
  favoriteOnly,
  hasLocalMaterial,
  libraryCollectionFilter,
  localQueryText,
  providerFilter,
  viewMode,
  workspaceMode,
}: {
  favoriteOnly: boolean;
  hasLocalMaterial: boolean;
  libraryCollectionFilter: LibraryCollectionFilter;
  localQueryText: string;
  providerFilter: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
}) {
  const noun = viewNoun(viewMode);
  const trimmedQuery = localQueryText.trim();
  const hasNoCollectionFilter =
    workspaceMode === "user-library" && libraryCollectionFilter === "none";
  const hasActiveFilter =
    trimmedQuery !== "" ||
    providerFilter !== "all" ||
    favoriteOnly ||
    hasNoCollectionFilter;
  const title = (() => {
    if (hasNoCollectionFilter && favoriteOnly) {
      return `No favorite ${noun} without a Collection`;
    }
    if (hasNoCollectionFilter) {
      return `No ${noun} without a Collection`;
    }
    if (favoriteOnly) {
      return `No favorite ${noun}`;
    }

    return hasLocalMaterial && hasActiveFilter
      ? `No matching ${noun}`
      : `No ${noun} yet`;
  })();
  const description = (() => {
    if (hasLocalMaterial && trimmedQuery !== "") {
      return `No ${noun.toLowerCase()} matched "${trimmedQuery}".`;
    }
    if (hasNoCollectionFilter && favoriteOnly) {
      return `Bookmarked ${noun.toLowerCase()} outside Collections will appear here.`;
    }
    if (hasNoCollectionFilter) {
      return `Everything in My Library currently belongs to at least one Collection.`;
    }
    if (favoriteOnly) {
      return `Bookmarked ${noun.toLowerCase()} will appear here.`;
    }
    if (hasLocalMaterial) {
      return `No ${noun.toLowerCase()} matched this Provider.`;
    }

    return workspaceMode === "user-library"
      ? "Start a Collection search to add local Image Assets to My Library."
      : "Start search to add local Museum Objects and Image Assets to this Collection.";
  })();

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {hasLocalMaterial && hasActiveFilter ? <Search /> : <Database />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
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
  headerActionControls,
  hasLocalMaterial = false,
  libraryCollectionFilter = "all",
  noCollectionCounts,
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
  const headerControlDensity: HeaderControlDensity =
    headerActionControls === undefined ? "default" : "with-actions";
  const shownCount = viewMode === "objects" ? objects.length : imageAssets.length;
  const deleteCompletionHref =
    workspaceMode === "user-library" && libraryCollectionFilter === "none"
      ? createGridStateHref({
          collectionFilterText,
          favoriteOnly,
          libraryCollectionFilter: "all",
          localQueryText,
          provider: providerFilter,
          viewMode,
          workspaceMode: "user-library",
        })
      : undefined;
  const noCollectionCount =
    noCollectionCounts === undefined
      ? viewCountLabel(viewMode, resultCounts)
      : viewCountLabel(viewMode, noCollectionCounts);
  const searchPlaceholder =
    workspaceMode === "user-library" ? "Search Library" : `Search ${scopeDisplayName}`;
  const emptyState = (
    <EmptyResults
      favoriteOnly={favoriteOnly}
      hasLocalMaterial={hasLocalMaterial}
      libraryCollectionFilter={libraryCollectionFilter}
      localQueryText={localQueryText}
      providerFilter={providerFilter}
      viewMode={viewMode}
      workspaceMode={workspaceMode}
    />
  );
  const headerControls = (
    <>
      <LocalResultSetSearchForm
        ariaLabel={searchAriaLabel}
        className={cn(
          "flex-none",
          headerControlDensity === "with-actions"
            ? "w-28 @min-[390px]/topbar:w-36 @min-[520px]/topbar:w-44 @min-[960px]/topbar:w-52 @min-[1180px]/topbar:w-60"
            : "w-36 @min-[520px]/topbar:w-44 @min-[700px]/topbar:w-52 @min-[900px]/topbar:w-60 @min-[1120px]/topbar:w-72",
        )}
        collectionFilterText={collectionFilterText}
        favoriteOnly={favoriteOnly}
        libraryCollectionFilter={libraryCollectionFilter}
        localQueryText={localQueryText}
        placeholder={searchPlaceholder}
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
        density={headerControlDensity}
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
        density={headerControlDensity}
      />
      <MobileFiltersMenu
        collectionFilterText={collectionFilterText}
        favoriteOnly={favoriteOnly}
        libraryCollectionFilter={libraryCollectionFilter}
        localQueryText={localQueryText}
        noCollectionCount={noCollectionCount}
        providerFacets={providerFacets}
        providerFilter={providerFilter}
        resultCounts={resultCounts}
        searchSetSlug={searchSetSlug}
        viewMode={viewMode}
        workspaceMode={workspaceMode}
        density={headerControlDensity}
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
        density={headerControlDensity}
      />
      {headerActionControls}
      {workspaceMode === "user-library" ? (
        <NoCollectionFilter
          collectionFilterText={collectionFilterText}
          favoriteOnly={favoriteOnly}
          libraryCollectionFilter={libraryCollectionFilter}
          localQueryText={localQueryText}
          noCollectionCount={noCollectionCount}
          providerFilter={providerFilter}
          viewMode={viewMode}
        />
      ) : null}
    </>
  );

  return (
    <Card className="min-w-0">
      <CardContent>
        <LocalResultSelectionSurface
          apiBaseUrl={apiBaseUrl}
          closeImageHref={closeImageHref}
          closeObjectHref={closeObjectHref}
          curationActionsDisabled={curationActionsDisabled}
          deleteCompletionHref={deleteCompletionHref}
          deleteEndpoint={deleteEndpoint}
          emptyState={shownCount === 0 ? emptyState : undefined}
          exportEndpoint={exportEndpoint}
          headerControls={headerControls}
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
