"use client";

import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { ArrowRightFromLine, Check, Images, Trash2 } from "lucide-react";

import { ImageAssetDetailPendingLink } from "@/components/image-asset-detail-overlay";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  imageUrl,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
} from "@/lib/collection-objects";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import {
  createGridStateHref,
  createObjectRouteKey,
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
import { cn } from "@/lib/utils";

type CollectionResultSelectionSurfaceProps = {
  apiBaseUrl: string;
  closeImageHref: string;
  closeObjectHref: string;
  collectionDisplayName: string;
  collectionFilterText: string;
  imageAssets: LibraryImageAssetSummary[];
  initialSelectedIds?: string[];
  initialSelectionMode?: boolean;
  localQueryText: string;
  objects: CollectionObjectSummary[];
  providerFilter: string;
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
  searchSetSlug: string;
  viewMode: GridViewMode;
};

type SelectionDialogKind = "delete" | "export";

function objectProviderDisplayLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
}

function createCollectionObjectTileId(provider: string, objectId: number): string {
  return `collection-object-${provider}-${objectId}`;
}

function createCollectionImageAssetTileId(imageAssetId: number): string {
  return `collection-image-asset-${imageAssetId}`;
}

function objectSelectionId(collectionObject: CollectionObjectSummary): string {
  return `object:${createObjectRouteKey(
    collectionObject.provider,
    collectionObject.object_id,
  )}`;
}

function imageSelectionId(imageAsset: LibraryImageAssetSummary): string {
  return `image:${imageAsset.image_asset_id}`;
}

function uniqueSelectedIds(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== "")));
}

function selectionCountLabel({
  selectedTotalCount,
  selectedVisibleCount,
}: {
  selectedTotalCount: number;
  selectedVisibleCount: number;
}): string {
  if (selectedTotalCount === selectedVisibleCount) {
    return `${selectedTotalCount} selected`;
  }

  return `${selectedVisibleCount} shown selected / ${selectedTotalCount} total selected`;
}

function selectionNoun(viewMode: GridViewMode, count: number): string {
  const singular = viewMode === "images" ? "image" : "object";
  return count === 1 ? singular : `${singular}s`;
}

function SelectionToolbar({
  onCancel,
  onOpenSelectionDialog,
  onToggleVisible,
  selectedTotalCount,
  selectedVisibleCount,
  selectionMode,
  setSelectionMode,
  visibleCount,
  visibleSelectionComplete,
}: {
  onCancel: () => void;
  onOpenSelectionDialog: (dialogKind: SelectionDialogKind) => void;
  onToggleVisible: () => void;
  selectedTotalCount: number;
  selectedVisibleCount: number;
  selectionMode: boolean;
  setSelectionMode: (selectionMode: boolean) => void;
  visibleCount: number;
  visibleSelectionComplete: boolean;
}) {
  if (!selectionMode) {
    return (
      <div className="flex w-full justify-end">
        <Button
          onClick={() => setSelectionMode(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Select
        </Button>
      </div>
    );
  }

  return (
    <div
      aria-label="Selection controls"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-label="Export selected"
          disabled={selectedVisibleCount === 0}
          onClick={() => onOpenSelectionDialog("export")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowRightFromLine />
        </Button>
        <Button
          aria-label="Delete selected"
          disabled={selectedVisibleCount === 0}
          onClick={() => onOpenSelectionDialog("delete")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
        <p className="text-sm text-muted-foreground">
          {selectionCountLabel({ selectedTotalCount, selectedVisibleCount })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          disabled={visibleCount === 0}
          onClick={onToggleVisible}
          size="sm"
          type="button"
          variant="outline"
        >
          {visibleSelectionComplete ? "Deselect all" : "Select all"}
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SelectionActionDialog({
  collectionDisplayName,
  dialogKind,
  onClose,
  selectedCount,
  viewMode,
}: {
  collectionDisplayName: string;
  dialogKind: SelectionDialogKind | null;
  onClose: () => void;
  selectedCount: number;
  viewMode: GridViewMode;
}) {
  const noun = selectionNoun(viewMode, selectedCount);
  const scopeLabel = formatCollectionDisplayName(collectionDisplayName);
  const deleteActionLabel = `Delete ${noun}`;
  const title =
    dialogKind === "delete"
      ? `Delete ${selectedCount} ${noun}?`
      : `Export ${selectedCount} ${noun}`;

  return (
    <Dialog open={dialogKind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {dialogKind === "delete"
              ? "This prototype does not delete data. It shows the decision point before a destructive action."
              : "This prototype does not export files. It shows where export choices would live."}
          </DialogDescription>
        </DialogHeader>

        {dialogKind === "delete" ? (
          <div className="grid gap-4 text-sm">
            <p>
              The selected {noun} would be removed from {scopeLabel}. We still need
              to triage whether delete means removing from this collection only, or
              deleting from all collections and the user library.
            </p>
            <div className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">
              Open product question: collection-scoped removal vs global library
              deletion.
            </div>
          </div>
        ) : (
          <div className="grid gap-3 text-sm">
            {[
              "Export selected image files",
              "Export metadata as CSV",
              "Export object records with image references",
            ].map((option) => (
              <div
                className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                key={option}
              >
                <span>{option}</span>
                <Badge variant="secondary">prototype</Badge>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          {dialogKind === "delete" ? (
            <Button onClick={onClose} type="button" variant="destructive">
              {deleteActionLabel}
            </Button>
          ) : (
            <Button onClick={onClose} type="button">
              Export options
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CollectionResultSelectionSurface({
  apiBaseUrl,
  closeImageHref,
  closeObjectHref,
  collectionDisplayName,
  collectionFilterText,
  imageAssets,
  initialSelectedIds = [],
  initialSelectionMode = false,
  localQueryText,
  objects,
  providerFilter,
  resolvedImageAssetId = null,
  resolvedObject = null,
  searchSetSlug,
  viewMode,
}: CollectionResultSelectionSurfaceProps) {
  const [selectionMode, setSelectionMode] = useState(initialSelectionMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(uniqueSelectedIds(initialSelectedIds)),
  );
  const [lastSelectionAnchorId, setLastSelectionAnchorId] = useState<string | null>(
    null,
  );
  const [selectionDialog, setSelectionDialog] = useState<SelectionDialogKind | null>(
    null,
  );
  const formattedCollectionDisplayName = formatCollectionDisplayName(
    collectionDisplayName,
  );
  const visibleIds = useMemo(
    () =>
      viewMode === "objects"
        ? objects.map(objectSelectionId)
        : imageAssets.map(imageSelectionId),
    [imageAssets, objects, viewMode],
  );
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const selectedTotalCount = selectedIds.size;
  const visibleSelectionComplete =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  function resetSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setLastSelectionAnchorId(null);
    setSelectionDialog(null);
  }

  function toggleVisibleSelection() {
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds);

      if (visibleSelectionComplete) {
        visibleIds.forEach((id) => nextSelectedIds.delete(id));
      } else {
        visibleIds.forEach((id) => nextSelectedIds.add(id));
      }

      return nextSelectedIds;
    });
    setLastSelectionAnchorId(null);
  }

  function toggleSelected(
    id: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds);
      const anchorIndex =
        lastSelectionAnchorId === null
          ? -1
          : visibleIds.indexOf(lastSelectionAnchorId);
      const itemIndex = visibleIds.indexOf(id);

      if (event.shiftKey && anchorIndex !== -1 && itemIndex !== -1) {
        const [start, end] =
          anchorIndex < itemIndex
            ? [anchorIndex, itemIndex]
            : [itemIndex, anchorIndex];
        visibleIds.slice(start, end + 1).forEach((visibleId) => {
          nextSelectedIds.add(visibleId);
        });
      } else if (nextSelectedIds.has(id)) {
        nextSelectedIds.delete(id);
      } else {
        nextSelectedIds.add(id);
      }

      return nextSelectedIds;
    });
    setLastSelectionAnchorId(id);
  }

  return (
    <div className="grid gap-3">
      <SelectionToolbar
        onCancel={resetSelection}
        onOpenSelectionDialog={setSelectionDialog}
        onToggleVisible={toggleVisibleSelection}
        selectedTotalCount={selectedTotalCount}
        selectedVisibleCount={selectedVisibleCount}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        visibleCount={visibleIds.length}
        visibleSelectionComplete={visibleSelectionComplete}
      />
      {viewMode === "objects" ? (
        <div className={cn(IMAGE_GRID_CLASS_NAME, "content-start items-start")}>
          {objects.map((collectionObject) => {
            const collectionObjectProviderLabel = objectProviderDisplayLabel(
              collectionObject.provider,
            );
            const tileId = createCollectionObjectTileId(
              collectionObject.provider,
              collectionObject.object_id,
            );
            const selectionId = objectSelectionId(collectionObject);
            const isSelected = selectedIds.has(selectionId);
            const href = createGridStateHref({
              collectionFilterText,
              localQueryText,
              object: {
                objectId: collectionObject.object_id,
                provider: collectionObject.provider,
              },
              provider: providerFilter,
              searchSetSlug,
              viewMode,
              workspaceMode: "search-set",
            });
            const thumbSrc = imageUrl(apiBaseUrl, collectionObject.cover_thumb_url);
            const title = collectionObject.title || "Untitled object";
            const objectAlt =
              collectionObject.title ||
              `${collectionObjectProviderLabel} object ${collectionObject.object_id}`;
            const tileStateKey =
              resolvedObject !== null &&
              resolvedObject.provider === collectionObject.provider &&
              resolvedObject.objectId === collectionObject.object_id
                ? "resolved"
                : "grid";
            const tileContents = (
              <AspectRatio ratio={4 / 5}>
                <ImageGridThumbnail alt={objectAlt} src={thumbSrc} />
                {selectionMode && isSelected ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[8] rounded-lg border-2 border-white"
                  />
                ) : null}
                {collectionObject.has_sibling_images ? (
                  <span
                    aria-label={`${collectionObject.image_count} images`}
                    className={IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME}
                  >
                    <Images data-icon="inline-start" />
                    {collectionObject.image_count}
                  </span>
                ) : null}
                {selectionMode ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-white/90 bg-background/45 text-transparent shadow-sm backdrop-blur-sm",
                      isSelected && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {isSelected ? <Check className="size-4" /> : null}
                  </span>
                ) : (
                  <Badge
                    className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                    variant="secondary"
                  >
                    {collectionObjectProviderLabel}
                  </Badge>
                )}
                <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                    {title}
                  </p>
                </div>
              </AspectRatio>
            );

            return selectionMode ? (
              <a
                aria-label={`${isSelected ? "Deselect" : "Select"} ${title}`}
                className={cn(IMAGE_GRID_TILE_CLASS_NAME, "self-start")}
                href={href}
                key={`${collectionObject.provider}-${collectionObject.object_id}-${tileStateKey}`}
                onClick={(event) => {
                  event.preventDefault();
                  toggleSelected(selectionId, event);
                }}
              >
                {tileContents}
              </a>
            ) : (
              <ObjectDetailPendingLink
                ariaLabel={`Open ${collectionObjectProviderLabel} object ${collectionObject.object_id}`}
                className={cn(IMAGE_GRID_TILE_CLASS_NAME, "self-start")}
                closeHref={closeObjectHref}
                href={href}
                id={tileId}
                key={`${collectionObject.provider}-${collectionObject.object_id}-${tileStateKey}`}
                preview={{
                  alt: objectAlt,
                  collectionLabel: formattedCollectionDisplayName,
                  height: collectionObject.cover_original_height,
                  imageCount: collectionObject.image_count,
                  providerLabel: collectionObjectProviderLabel,
                  src: thumbSrc,
                  title,
                  width: collectionObject.cover_original_width,
                }}
              >
                {tileContents}
              </ObjectDetailPendingLink>
            );
          })}
        </div>
      ) : (
        <div className={cn(IMAGE_GRID_CLASS_NAME, "content-start items-start")}>
          {imageAssets.map((imageAsset) => {
            const imageAssetProviderLabel = objectProviderDisplayLabel(
              imageAsset.provider,
            );
            const tileId = createCollectionImageAssetTileId(
              imageAsset.image_asset_id,
            );
            const selectionId = imageSelectionId(imageAsset);
            const isSelected = selectedIds.has(selectionId);
            const href = createGridStateHref({
              collectionFilterText,
              imageAssetId: imageAsset.image_asset_id,
              localQueryText,
              provider: providerFilter,
              searchSetSlug,
              viewMode: "images",
              workspaceMode: "search-set",
            });
            const thumbSrc = imageUrl(apiBaseUrl, imageAsset.thumb_url);
            const title = imageAsset.title || "Untitled object";
            const imageAssetLabel = `Image Asset ${imageAsset.image_asset_id}`;
            const imageAssetAlt =
              imageAsset.title ||
              `${imageAssetProviderLabel} ${imageAssetLabel}`;
            const tileStateKey =
              resolvedImageAssetId === imageAsset.image_asset_id ? "resolved" : "grid";
            const tileContents = (
              <AspectRatio ratio={4 / 5}>
                <ImageGridThumbnail alt={imageAssetAlt} src={thumbSrc} />
                {selectionMode && isSelected ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[8] rounded-lg border-2 border-white"
                  />
                ) : null}
                {selectionMode ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-white/90 bg-background/45 text-transparent shadow-sm backdrop-blur-sm",
                      isSelected && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {isSelected ? <Check className="size-4" /> : null}
                  </span>
                ) : (
                  <Badge
                    className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                    variant="secondary"
                  >
                    {imageAssetProviderLabel}
                  </Badge>
                )}
                <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                    {title}
                  </p>
                </div>
              </AspectRatio>
            );

            return selectionMode ? (
              <a
                aria-label={`${isSelected ? "Deselect" : "Select"} ${imageAssetLabel}`}
                className={cn(IMAGE_GRID_TILE_CLASS_NAME, "self-start")}
                href={href}
                key={`${imageAsset.image_asset_id}-${tileStateKey}`}
                onClick={(event) => {
                  event.preventDefault();
                  toggleSelected(selectionId, event);
                }}
              >
                {tileContents}
              </a>
            ) : (
              <ImageAssetDetailPendingLink
                ariaLabel={`Open ${imageAssetProviderLabel} ${imageAssetLabel}`}
                className={cn(IMAGE_GRID_TILE_CLASS_NAME, "self-start")}
                closeHref={closeImageHref}
                href={href}
                id={tileId}
                key={`${imageAsset.image_asset_id}-${tileStateKey}`}
                preview={{
                  alt: imageAssetAlt,
                  height: imageAsset.original_height,
                  parentTitle: title,
                  providerLabel: imageAssetProviderLabel,
                  src: thumbSrc,
                  title: "Image Asset",
                  width: imageAsset.original_width,
                }}
              >
                {tileContents}
              </ImageAssetDetailPendingLink>
            );
          })}
        </div>
      )}
      <SelectionActionDialog
        collectionDisplayName={collectionDisplayName}
        dialogKind={selectionDialog}
        onClose={() => setSelectionDialog(null)}
        selectedCount={selectedVisibleCount}
        viewMode={viewMode}
      />
    </div>
  );
}
