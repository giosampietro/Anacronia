"use client";

import type { MouseEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRightFromLine,
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  Images,
  Trash2,
} from "lucide-react";

import { ImageAssetDetailPendingLink } from "@/components/image-asset-detail-overlay";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import {
  imageUrl,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
  type LibraryObjectSummary,
} from "@/lib/collection-objects";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import {
  createObjectRouteKey,
  type GridViewMode,
  type ObjectRouteRef,
} from "@/lib/grid-view";
import {
  COLLECTION_EXPORT_FORMAT_OPTIONS,
  createSelectedCollectionExportRequest,
  exportActionLabel,
  exportArtifactSummary,
  exportPendingLabel,
  exportSuccessLabel,
  type CollectionExportFormat,
} from "@/lib/export-workflow";
import {
  IMAGE_GRID_BADGE_CLASS_NAME,
  IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
  IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME,
  IMAGE_GRID_TILE_CLASS_NAME,
} from "@/lib/image-grid-style";
import { cn } from "@/lib/utils";

type LocalResultObjectSummary = CollectionObjectSummary | LibraryObjectSummary;

type LocalResultSelectionSurfaceProps = {
  apiBaseUrl: string;
  closeImageHref: string;
  closeObjectHref: string;
  emptyState?: ReactNode;
  exportEndpoint?: string;
  imageAssetHref: (imageAsset: LibraryImageAssetSummary) => string;
  imageAssetTileId: (imageAsset: LibraryImageAssetSummary) => string;
  imageAssets: LibraryImageAssetSummary[];
  imageCollectionsLabel?: (imageAsset: LibraryImageAssetSummary) => string;
  imageTopBadgeLabel?: (imageAsset: LibraryImageAssetSummary) => string;
  initialSelectedIds?: string[];
  initialSelectionMode?: boolean;
  objectCollectionLabel: (collectionObject: LocalResultObjectSummary) => string;
  objectHref: (collectionObject: LocalResultObjectSummary) => string;
  objectTileId: (collectionObject: LocalResultObjectSummary) => string;
  objects: LocalResultObjectSummary[];
  resolvedImageAssetId?: number | null;
  resolvedObject?: ObjectRouteRef | null;
  scopeDisplayName: string;
  viewMode: GridViewMode;
};

type SelectionDialogKind = "delete" | "export";

type SelectionExportResponse = {
  format: CollectionExportFormat;
  export_path: string;
  row_count: number;
  skipped_image_asset_count: number;
};

type SelectionExportStatus =
  | { state: "idle" }
  | { format: CollectionExportFormat; state: "pending" }
  | { result: SelectionExportResponse; state: "success" }
  | { message: string; state: "error" };

function selectionExportErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    payload.detail &&
    typeof payload.detail === "object" &&
    "message" in payload.detail &&
    typeof payload.detail.message === "string"
  ) {
    return payload.detail.message;
  }

  return "Export failed.";
}

function objectProviderDisplayLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
}

function objectSelectionId(collectionObject: LocalResultObjectSummary): string {
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
          disabled={selectedTotalCount === 0}
          onClick={() => onOpenSelectionDialog("export")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowRightFromLine />
        </Button>
        <Button
          aria-label="Delete selected"
          disabled={selectedTotalCount === 0}
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
  dialogKind,
  exportEndpoint,
  onClose,
  open,
  scopeDisplayName,
  selectedCount,
  selectedIds,
  viewMode,
}: {
  dialogKind: SelectionDialogKind;
  exportEndpoint?: string;
  onClose: () => void;
  open: boolean;
  scopeDisplayName: string;
  selectedCount: number;
  selectedIds: string[];
  viewMode: GridViewMode;
}) {
  const [exportStatus, setExportStatus] = useState<SelectionExportStatus>({
    state: "idle",
  });
  const noun = selectionNoun(viewMode, selectedCount);
  const scopeLabel = formatCollectionDisplayName(scopeDisplayName);
  const canExport = exportEndpoint !== undefined;
  const deleteActionLabel = `Delete ${noun}`;
  const title =
    dialogKind === "delete"
      ? `Delete ${selectedCount} ${noun}?`
      : `Export ${selectedCount} ${noun}`;

  function closeDialog() {
    onClose();
  }

  async function exportSelected(format: CollectionExportFormat) {
    if (exportEndpoint === undefined) {
      return;
    }

    setExportStatus({ format, state: "pending" });
    try {
      const response = await fetch(
        exportEndpoint,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            createSelectedCollectionExportRequest({
              format,
              selectedIds,
              viewMode,
            }),
          ),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | SelectionExportResponse
        | unknown;

      if (!response.ok) {
        setExportStatus({
          message: selectionExportErrorMessage(payload),
          state: "error",
        });
        return;
      }

      setExportStatus({
        result: payload as SelectionExportResponse,
        state: "success",
      });
    } catch {
      setExportStatus({
        message: "Export failed.",
        state: "error",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && exportStatus.state !== "pending") {
          closeDialog();
        }
      }}
    >
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {dialogKind === "delete"
              ? "This prototype does not delete data. It shows the decision point before a destructive action."
              : canExport
                ? `Export selected ${noun} from ${scopeLabel}.`
                : `Selected export from ${scopeLabel} is reserved for the shared result-set workflow.`}
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
        ) : canExport ? (
          <div className="grid gap-4 text-sm">
            {exportStatus.state === "success" ? null : (
              <ItemGroup className="gap-2">
                {COLLECTION_EXPORT_FORMAT_OPTIONS.map((option) => {
                  const pending =
                    exportStatus.state === "pending" &&
                    exportStatus.format === option.format;

                  return (
                    <Item
                      className={cn(
                        "cursor-pointer items-start text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
                        pending && "border-ring bg-muted/50 shadow-xs",
                      )}
                      key={option.format}
                      render={
                        <button
                          aria-label={exportActionLabel(option.format)}
                          disabled={exportStatus.state === "pending"}
                          onClick={() => exportSelected(option.format)}
                          type="button"
                        />
                      }
                      variant="outline"
                    >
                      <ItemMedia variant="icon">
                        {pending ? <Spinner /> : <Download />}
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          {pending ? exportPendingLabel(option.format) : option.title}
                        </ItemTitle>
                        <ItemDescription>{option.description}</ItemDescription>
                      </ItemContent>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}

            {exportStatus.state === "success" ? (
              <Alert>
                <CircleCheck />
                <AlertTitle>
                  {exportSuccessLabel(exportStatus.result.format)}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    {exportArtifactSummary({
                      format: exportStatus.result.format,
                      rowCount: String(exportStatus.result.row_count),
                    })}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs">
                    {exportStatus.result.export_path}
                  </p>
                  {exportStatus.result.skipped_image_asset_count > 0 ? (
                    <p className="mt-2 text-xs">
                      {exportStatus.result.skipped_image_asset_count} Image Asset
                      {exportStatus.result.skipped_image_asset_count === 1 ? "" : "s"} skipped.
                      See export-warnings.json in the export folder.
                    </p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {exportStatus.state === "error" ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Export failed</AlertTitle>
                <AlertDescription>{exportStatus.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <Alert>
            <CircleAlert />
            <AlertTitle>Export not wired for this scope yet</AlertTitle>
            <AlertDescription>
              This uses the same selected export entry point as Collections, but User
              Library export still needs a backend destination contract before it can
              write files.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {dialogKind === "delete" ? (
            <>
              <Button onClick={closeDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button onClick={closeDialog} type="button" variant="destructive">
                {deleteActionLabel}
              </Button>
            </>
          ) : (
            <Button
              disabled={exportStatus.state === "pending"}
              onClick={closeDialog}
              type="button"
              variant={exportStatus.state === "success" ? "default" : "outline"}
            >
              {exportStatus.state === "success" ? "Done" : "Cancel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LocalResultSelectionSurface({
  apiBaseUrl,
  closeImageHref,
  closeObjectHref,
  emptyState,
  exportEndpoint,
  imageAssetHref,
  imageAssetTileId,
  imageAssets,
  imageCollectionsLabel,
  imageTopBadgeLabel,
  initialSelectedIds = [],
  initialSelectionMode = false,
  objectCollectionLabel,
  objectHref,
  objectTileId,
  objects,
  resolvedImageAssetId = null,
  resolvedObject = null,
  scopeDisplayName,
  viewMode,
}: LocalResultSelectionSurfaceProps) {
  const [selectionMode, setSelectionMode] = useState(initialSelectionMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(uniqueSelectedIds(initialSelectedIds)),
  );
  const [lastSelectionAnchorId, setLastSelectionAnchorId] = useState<string | null>(
    null,
  );
  const [selectionDialogKind, setSelectionDialogKind] =
    useState<SelectionDialogKind>("export");
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [selectionDialogSession, setSelectionDialogSession] = useState(0);
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
    setSelectionDialogOpen(false);
  }

  function openSelectionDialog(dialogKind: SelectionDialogKind) {
    setSelectionDialogKind(dialogKind);
    setSelectionDialogSession((currentSession) => currentSession + 1);
    setSelectionDialogOpen(true);
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
        onOpenSelectionDialog={openSelectionDialog}
        onToggleVisible={toggleVisibleSelection}
        selectedTotalCount={selectedTotalCount}
        selectedVisibleCount={selectedVisibleCount}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        visibleCount={visibleIds.length}
        visibleSelectionComplete={visibleSelectionComplete}
      />
      {visibleIds.length === 0 ? emptyState : null}
      {visibleIds.length > 0 ? viewMode === "objects" ? (
        <div className={cn(IMAGE_GRID_CLASS_NAME, "content-start items-start")}>
          {objects.map((collectionObject) => {
            const collectionObjectProviderLabel = objectProviderDisplayLabel(
              collectionObject.provider,
            );
            const tileId = objectTileId(collectionObject);
            const selectionId = objectSelectionId(collectionObject);
            const isSelected = selectedIds.has(selectionId);
            const href = objectHref(collectionObject);
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
                  collectionLabel: objectCollectionLabel(collectionObject),
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
            const tileId = imageAssetTileId(imageAsset);
            const selectionId = imageSelectionId(imageAsset);
            const isSelected = selectedIds.has(selectionId);
            const href = imageAssetHref(imageAsset);
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
                ) : imageTopBadgeLabel ? (
                  <div className="absolute inset-x-2 top-2 flex translate-y-1 items-start justify-between gap-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    <Badge
                      className={cn(
                        "min-w-0 max-w-[70%] truncate",
                        IMAGE_GRID_BADGE_CLASS_NAME,
                      )}
                      variant="secondary"
                    >
                      {imageTopBadgeLabel(imageAsset)}
                    </Badge>
                  </div>
                ) : (
                  <Badge
                    className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                    variant="secondary"
                  >
                    {imageAssetProviderLabel}
                  </Badge>
                )}
                <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                  {imageTopBadgeLabel ? (
                    <>
                      <Badge
                        className={IMAGE_GRID_BADGE_CLASS_NAME}
                        variant="secondary"
                      >
                        {imageAssetProviderLabel}
                      </Badge>
                      {imageCollectionsLabel ? (
                        <p className="sr-only">
                          {imageCollectionsLabel(imageAsset)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                      {title}
                    </p>
                  )}
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
      ) : null}
      <SelectionActionDialog
        dialogKind={selectionDialogKind}
        exportEndpoint={exportEndpoint}
        key={selectionDialogSession}
        onClose={() => setSelectionDialogOpen(false)}
        open={selectionDialogOpen}
        scopeDisplayName={scopeDisplayName}
        selectedCount={selectedTotalCount}
        selectedIds={Array.from(selectedIds)}
        viewMode={viewMode}
      />
    </div>
  );
}
