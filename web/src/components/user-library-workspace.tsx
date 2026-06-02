"use client";

import { LocalResultsGrid } from "@/components/local-results-grid";
import {
  type CollectionProviderFacet,
  type CollectionResultCounts,
  type LibraryImageAssetSummary,
  type LibraryObjectSummary,
} from "@/lib/collection-objects";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import { createGridStateHref, type GridViewMode, type ObjectRouteRef } from "@/lib/grid-view";
import {
  createLibraryImageAssetTileId,
  createLibraryObjectTileId,
} from "@/lib/grid-tile-ids";
import {
  createLibraryImageAssetHref,
  createLibraryObjectHref,
} from "@/lib/user-library-grid";

type UserLibraryWorkspaceProps = {
  apiBaseUrl: string;
  imageAssets: LibraryImageAssetSummary[];
  initialSelectedIds?: string[];
  initialSelectionMode?: boolean;
  localQueryText: string;
  objects: LibraryObjectSummary[];
  providerFacets: CollectionProviderFacet[];
  providerFilter: string;
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
  resultCounts: CollectionResultCounts;
  viewMode: GridViewMode;
};

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

function collectionListLabel(item: { collections: { display_name: string }[] }): string {
  return item.collections
    .map((collection) => formatCollectionDisplayName(collection.display_name))
    .join(", ");
}

export function UserLibraryWorkspace({
  apiBaseUrl,
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
  viewMode,
}: UserLibraryWorkspaceProps) {
  const closeHref = createGridStateHref({
    localQueryText,
    provider: providerFilter,
    viewMode,
    workspaceMode: "user-library",
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-7">
      <LocalResultsGrid
        apiBaseUrl={apiBaseUrl}
        closeImageHref={closeHref}
        closeObjectHref={closeHref}
        hasLocalMaterial={resultCounts.images > 0}
        imageAssetHref={(imageAsset) =>
          createLibraryImageAssetHref(imageAsset, localQueryText, providerFilter)
        }
        imageAssetTileId={(imageAsset) =>
          createLibraryImageAssetTileId(imageAsset.image_asset_id)
        }
        imageAssets={imageAssets}
        imageCollectionsLabel={collectionListLabel}
        imageTopBadgeLabel={collectionLabel}
        initialSelectedIds={initialSelectedIds}
        initialSelectionMode={initialSelectionMode}
        localQueryText={localQueryText}
        objectCollectionLabel={(libraryObject) =>
          collectionLabel(libraryObject as LibraryObjectSummary)
        }
        objectHref={(libraryObject) =>
          createLibraryObjectHref(
            libraryObject as LibraryObjectSummary,
            localQueryText,
            providerFilter,
            viewMode,
          )
        }
        objectTileId={(libraryObject) =>
          createLibraryObjectTileId(
            libraryObject.provider,
            libraryObject.object_id,
          )
        }
        objects={objects}
        providerFacets={providerFacets}
        providerFilter={providerFilter}
        resolvedImageAssetId={resolvedImageAssetId}
        resolvedObject={resolvedObject}
        resultCounts={resultCounts}
        scopeDisplayName="My Library"
        searchAriaLabel="Search local My Library results"
        viewMode={viewMode}
        workspaceMode="user-library"
      />
    </div>
  );
}
