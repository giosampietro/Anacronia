"use client";

import type { ReactNode } from "react";

import { LocalResultsGrid } from "@/components/local-results-grid";
import { formatCollectionDisplayName } from "@/lib/collection-display";
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
  type ObjectRouteRef,
} from "@/lib/grid-view";
import {
  createCollectionImageAssetTileId,
  createCollectionObjectTileId,
} from "@/lib/grid-tile-ids";

type LocalResultObjectSummary = CollectionObjectSummary | LibraryObjectSummary;

type CollectionResultsGridProps = {
  apiBaseUrl: string;
  closeImageHref: string;
  closeObjectHref: string;
  collectionDisplayName: string;
  collectionFilterText: string;
  curationActionsDisabled?: boolean;
  favoriteOnly?: boolean;
  headerActionControls?: ReactNode;
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

export function CollectionResultsGrid({
  apiBaseUrl,
  closeImageHref,
  closeObjectHref,
  collectionDisplayName,
  collectionFilterText,
  curationActionsDisabled = false,
  favoriteOnly = false,
  headerActionControls,
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
  return (
    <LocalResultsGrid
      apiBaseUrl={apiBaseUrl}
      closeImageHref={closeImageHref}
      closeObjectHref={closeObjectHref}
      collectionFilterText={collectionFilterText}
      curationActionsDisabled={curationActionsDisabled}
      deleteEndpoint="/api/curation/delete"
      exportEndpoint={`/api/search-sets/${encodeURIComponent(searchSetSlug)}/exports`}
      favoriteOnly={favoriteOnly}
      headerActionControls={headerActionControls}
      hasLocalMaterial={hasLocalMaterial}
      imageAssetHref={(imageAsset) =>
        createGridStateHref({
          collectionFilterText,
          favoriteOnly,
          imageAssetId: imageAsset.image_asset_id,
          localQueryText,
          provider: providerFilter,
          searchSetSlug,
          viewMode: "images",
          workspaceMode: "search-set",
        })
      }
      imageAssetTileId={(imageAsset) =>
        createCollectionImageAssetTileId(imageAsset.image_asset_id)
      }
      imageAssets={imageAssets}
      initialSelectedIds={initialSelectedIds}
      initialSelectionMode={initialSelectionMode}
      localQueryText={localQueryText}
      objectCollectionLabel={() =>
        formatCollectionDisplayName(collectionDisplayName)
      }
      objectHref={(collectionObject: LocalResultObjectSummary) =>
        createGridStateHref({
          collectionFilterText,
          favoriteOnly,
          localQueryText,
          object: {
            objectId: collectionObject.object_id,
            provider: collectionObject.provider,
          },
          provider: providerFilter,
          searchSetSlug,
          viewMode,
          workspaceMode: "search-set",
        })
      }
      objectTileId={(collectionObject) =>
        createCollectionObjectTileId(
          collectionObject.provider,
          collectionObject.object_id,
        )
      }
      objects={objects}
      providerFacets={providerFacets}
      providerFilter={providerFilter}
      resolvedImageAssetId={resolvedImageAssetId}
      resolvedObject={resolvedObject}
      resultCounts={resultCounts}
      scopeDisplayName={collectionDisplayName}
      searchAriaLabel="Search local Collection results"
      searchSetSlug={searchSetSlug}
      removeFromCollectionEndpoint={`/api/search-sets/${encodeURIComponent(searchSetSlug)}/remove-from-collection`}
      viewMode={viewMode}
      workspaceMode="search-set"
    />
  );
}
