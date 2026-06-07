"use client";

import type { FocusEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  FolderMinus,
  Images,
  Trash2,
} from "lucide-react";

import { AppTopBarPortal } from "@/components/app-top-bar-portal";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { ObjectDetailPendingLink } from "@/components/object-detail-pending-link";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { VirtualizedImageGrid } from "@/components/virtualized-image-grid";
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
  parseObjectRouteKey,
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
import { selectionActionSummary } from "@/lib/selection-action-summary";
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
  curationActionsDisabled?: boolean;
  deleteCompletionHref?: string;
  deleteEndpoint?: string;
  emptyState?: ReactNode;
  exportEndpoint?: string;
  headerControls?: ReactNode;
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
  removeFromCollectionEndpoint?: string;
  viewMode: GridViewMode;
};

type SelectionDialogKind = "delete" | "export" | "remove";

type CollectionCurationObjectSelection = {
  provider: string;
  object_id: string;
};

type CollectionCurationSelection = {
  image_asset_ids: number[];
  objects: CollectionCurationObjectSelection[];
};

type CollectionCurationRequest = {
  selection: CollectionCurationSelection;
};

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

type SelectionCurationStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { message: string; state: "error" };

type GridShortcutTarget = {
  href: string;
  id: string;
  kind: "image" | "object";
  selectionId: string;
};

function parseImageSelectionId(value: string): number | null {
  if (!value.startsWith("image:")) {
    return null;
  }

  const imageAssetId = Number.parseInt(value.slice("image:".length), 10);
  return Number.isFinite(imageAssetId) ? imageAssetId : null;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null ||
    target.matches("input, textarea, select")
  );
}

function gridShortcutTargetData(kind: "image" | "object") {
  return {
    "data-grid-shortcut-keys": "b v",
    "data-grid-shortcut-target": kind,
  };
}

function parseObjectSelectionId(
  value: string,
): CollectionCurationObjectSelection | null {
  if (!value.startsWith("object:")) {
    return null;
  }

  const objectRouteRef = parseObjectRouteKey(value.slice("object:".length));
  if (objectRouteRef === null) {
    return null;
  }

  return {
    provider: objectRouteRef.provider,
    object_id: objectRouteRef.objectId,
  };
}

function createSelectedCollectionCurationRequest({
  selectedIds,
  viewMode,
}: {
  selectedIds: string[];
  viewMode: GridViewMode;
}): CollectionCurationRequest {
  if (viewMode === "images") {
    return {
      selection: {
        image_asset_ids: selectedIds.flatMap((selectedId) => {
          const imageAssetId = parseImageSelectionId(selectedId);
          return imageAssetId === null ? [] : [imageAssetId];
        }),
        objects: [],
      },
    };
  }

  return {
    selection: {
      image_asset_ids: [],
      objects: selectedIds.flatMap((selectedId) => {
        const selectedObject = parseObjectSelectionId(selectedId);
        return selectedObject === null ? [] : [selectedObject];
      }),
    },
  };
}

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
  if (provider === "vam") {
    return "V&A";
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

function FavoriteTileButton({
  floating = true,
  isFavorite,
  label,
  onToggle,
}: {
  floating?: boolean;
  isFavorite: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(
        "z-10 rounded-full bg-transparent text-white hover:bg-white/12 hover:text-white focus-visible:bg-white/12",
        floating && "absolute left-1.5 top-1.5",
        isFavorite && "[&_svg]:fill-current",
      )}
      onClick={onToggle}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      <Bookmark />
    </Button>
  );
}

function ObjectTileMarkers({
  favoriteLabel,
  imageCount,
  isFavorite,
  onToggleFavorite,
}: {
  favoriteLabel: string;
  imageCount: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <>
      <FavoriteTileButton
        isFavorite={isFavorite}
        label={favoriteLabel}
        onToggle={onToggleFavorite}
      />
      {imageCount > 1 ? (
        <span
          aria-label={`${imageCount} images`}
          className={IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME}
        >
          <Images data-icon="inline-start" />
          {imageCount}
        </span>
      ) : null}
    </>
  );
}

function SelectionToolbar({
  canDelete,
  canRemoveFromCollection,
  curationActionsDisabled,
  inline = false,
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
  canDelete: boolean;
  canRemoveFromCollection: boolean;
  curationActionsDisabled: boolean;
  inline?: boolean;
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
    if (inline) {
      return (
        <Button
          onClick={() => setSelectionMode(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Select
        </Button>
      );
    }

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
      className={cn(
        "flex min-w-0 items-center",
        inline ? "flex-nowrap gap-1.5" : "flex-wrap justify-between gap-3",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          aria-label="Export selected"
          disabled={selectedTotalCount === 0 || curationActionsDisabled}
          onClick={() => onOpenSelectionDialog("export")}
          size="icon-sm"
          title="Export selected"
          type="button"
          variant="ghost"
        >
          <Download />
        </Button>
        {canRemoveFromCollection ? (
          <Button
            aria-label="Remove from collection"
            disabled={selectedTotalCount === 0 || curationActionsDisabled}
            onClick={() => onOpenSelectionDialog("remove")}
            size="icon-sm"
            title="Remove from collection"
            type="button"
            variant="ghost"
          >
            <FolderMinus />
          </Button>
        ) : null}
        <Button
          aria-label="Delete selected"
          disabled={selectedTotalCount === 0 || curationActionsDisabled || !canDelete}
          onClick={() => onOpenSelectionDialog("delete")}
          size="icon-sm"
          title="Delete selected"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
        <p
          className={cn(
            "text-sm text-muted-foreground",
            inline && "hidden whitespace-nowrap @min-[760px]/topbar:block",
          )}
        >
          {selectionCountLabel({ selectedTotalCount, selectedVisibleCount })}
        </p>
      </div>
      <div className={cn("flex items-center", inline ? "gap-1.5" : "gap-3")}>
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
  deleteEndpoint,
  dialogKind,
  exportEndpoint,
  imageAssets,
  onActionComplete,
  onClose,
  open,
  objects,
  removeFromCollectionEndpoint,
  scopeDisplayName,
  selectedCount,
  selectedIds,
  viewMode,
}: {
  deleteEndpoint?: string;
  dialogKind: SelectionDialogKind;
  exportEndpoint?: string;
  imageAssets: LibraryImageAssetSummary[];
  onActionComplete: () => void;
  onClose: () => void;
  objects: LocalResultObjectSummary[];
  open: boolean;
  removeFromCollectionEndpoint?: string;
  scopeDisplayName: string;
  selectedCount: number;
  selectedIds: string[];
  viewMode: GridViewMode;
}) {
  const [exportStatus, setExportStatus] = useState<SelectionExportStatus>({
    state: "idle",
  });
  const [curationStatus, setCurationStatus] = useState<SelectionCurationStatus>({
    state: "idle",
  });
  const noun = selectionNoun(viewMode, selectedCount);
  const scopeLabel = formatCollectionDisplayName(scopeDisplayName);
  const canExport = exportEndpoint !== undefined;
  const curationEndpoint =
    dialogKind === "remove"
      ? removeFromCollectionEndpoint
      : dialogKind === "delete"
        ? deleteEndpoint
        : undefined;
  const canRunCurationAction = curationEndpoint !== undefined;
  const curationSummary =
    dialogKind === "remove" || dialogKind === "delete"
      ? selectionActionSummary({
          action: dialogKind,
          imageAssets,
          objects,
          scopeDisplayName,
          selectedIds,
          viewMode,
        })
      : null;
  const curationActionLabel = curationSummary?.confirmLabel ?? `Delete ${noun}`;
  const title =
    curationSummary?.title ?? `Export ${selectedCount} ${noun}`;

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

  async function runCurationAction() {
    if (curationEndpoint === undefined) {
      return;
    }

    setCurationStatus({ state: "pending" });
    try {
      const response = await fetch(curationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          createSelectedCollectionCurationRequest({
            selectedIds,
            viewMode,
          }),
        ),
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        setCurationStatus({
          message: selectionExportErrorMessage(payload),
          state: "error",
        });
        return;
      }

      onActionComplete();
    } catch {
      setCurationStatus({
        message:
          dialogKind === "remove"
            ? "Remove from collection failed."
            : "Delete failed.",
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
            {curationSummary !== null
              ? curationSummary.description
              : canExport
                ? `Export selected ${noun} from ${scopeLabel}.`
                : `Selected export from ${scopeLabel} is reserved for the shared result-set workflow.`}
          </DialogDescription>
        </DialogHeader>

        {dialogKind === "delete" || dialogKind === "remove" ? (
          <div className="grid gap-4 text-sm">
            {canRunCurationAction ? (
              curationSummary?.bodyLines.map((line) => (
                <p key={line}>{line}</p>
              ))
            ) : (
              <Alert>
                <CircleAlert />
                <AlertTitle>Action not available</AlertTitle>
                <AlertDescription>
                  This action is not wired for the current scope.
                </AlertDescription>
              </Alert>
            )}
            {curationStatus.state === "error" ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>
                  {dialogKind === "remove" ? "Remove failed" : "Delete failed"}
                </AlertTitle>
                <AlertDescription>{curationStatus.message}</AlertDescription>
              </Alert>
            ) : null}
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
          {dialogKind === "delete" || dialogKind === "remove" ? (
            <>
              <Button onClick={closeDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={
                  !canRunCurationAction || curationStatus.state === "pending"
                }
                onClick={runCurationAction}
                type="button"
                variant={dialogKind === "delete" ? "destructive" : "default"}
              >
                {curationStatus.state === "pending" ? (
                  <>
                    <Spinner />
                    {dialogKind === "remove" ? "Removing..." : "Deleting..."}
                  </>
                ) : (
                  curationActionLabel
                )}
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
  curationActionsDisabled = false,
  deleteCompletionHref,
  deleteEndpoint,
  emptyState,
  exportEndpoint,
  headerControls,
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
  removeFromCollectionEndpoint,
  viewMode,
}: LocalResultSelectionSurfaceProps) {
  const router = useRouter();
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
  const [shortcutTarget, setShortcutTarget] =
    useState<GridShortcutTarget | null>(null);
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

  const toggleObjectFavorite = useCallback(
    async (collectionObject: LocalResultObjectSummary) => {
      await fetch(
        `/api/objects/${encodeURIComponent(collectionObject.provider)}/${collectionObject.object_id}/favorite`,
        { method: collectionObject.is_favorite ? "DELETE" : "PUT" },
      );
      router.refresh();
    },
    [router],
  );

  const toggleImageFavorite = useCallback(
    async (imageAsset: LibraryImageAssetSummary) => {
      await fetch(`/api/image-assets/${imageAsset.image_asset_id}/favorite`, {
        method: imageAsset.is_favorite ? "DELETE" : "PUT",
      });
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        shortcutTarget === null ||
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        selectionDialogOpen ||
        isEditableShortcutTarget(event.target) ||
        document.querySelector("[aria-modal='true'], [role='dialog']") !== null
      ) {
        return;
      }

      const shortcutKey = event.key.toLowerCase();
      if (shortcutKey === "b") {
        event.preventDefault();
        if (shortcutTarget.kind === "image") {
          const imageAsset = imageAssets.find(
            (candidate) =>
              imageSelectionId(candidate) === shortcutTarget.selectionId,
          );
          if (imageAsset) {
            void toggleImageFavorite(imageAsset);
          }
          return;
        }

        const collectionObject = objects.find(
          (candidate) =>
            objectSelectionId(candidate) === shortcutTarget.selectionId,
        );
        if (collectionObject) {
          void toggleObjectFavorite(collectionObject);
        }
        return;
      }

      if (shortcutKey === "v") {
        event.preventDefault();
        router.push(shortcutTarget.href, { scroll: false });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    imageAssets,
    objects,
    router,
    selectionDialogOpen,
    shortcutTarget,
    toggleImageFavorite,
    toggleObjectFavorite,
  ]);

  function resetSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setLastSelectionAnchorId(null);
    setSelectionDialogOpen(false);
  }

  function completeCurationAction() {
    const shouldRedirectAfterDelete =
      selectionDialogKind === "delete" &&
      deleteCompletionHref !== undefined &&
      visibleIds.length > 0 &&
      selectedVisibleCount === visibleIds.length;

    resetSelection();
    if (shouldRedirectAfterDelete) {
      router.push(deleteCompletionHref, { scroll: false });
    } else {
      router.refresh();
    }
  }

  function openSelectionDialog(dialogKind: SelectionDialogKind) {
    setSelectionDialogKind(dialogKind);
    setSelectionDialogSession((currentSession) => currentSession + 1);
    setSelectionDialogOpen(true);
  }

  function activateShortcutTarget(target: GridShortcutTarget) {
    setShortcutTarget(target);
  }

  function clearShortcutTarget(targetId: string) {
    setShortcutTarget((currentTarget) =>
      currentTarget?.id === targetId ? null : currentTarget,
    );
  }

  function handleShortcutBlur(
    event: FocusEvent<HTMLElement>,
    targetId: string,
  ) {
    const relatedTarget = event.relatedTarget;
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
      clearShortcutTarget(targetId);
    }
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

  const selectionToolbar = (
    <SelectionToolbar
      canDelete={deleteEndpoint !== undefined}
      canRemoveFromCollection={removeFromCollectionEndpoint !== undefined}
      curationActionsDisabled={curationActionsDisabled}
      inline={headerControls !== undefined}
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
  );
  const resultSurface = (
    <>
      {visibleIds.length === 0 ? emptyState : null}
      {visibleIds.length > 0 ? viewMode === "objects" ? (
        <VirtualizedImageGrid
          className={cn(IMAGE_GRID_CLASS_NAME, "content-start items-start")}
          items={objects}
          renderItem={(collectionObject) => {
            const collectionObjectProviderLabel = objectProviderDisplayLabel(
              collectionObject.provider,
            );
            const tileId = objectTileId(collectionObject);
            const selectionId = objectSelectionId(collectionObject);
            const isSelected = selectedIds.has(selectionId);
            const href = objectHref(collectionObject);
            const shortcutTargetId = `object:${selectionId}`;
            const thumbSrc = imageUrl(apiBaseUrl, collectionObject.cover_thumb_url);
            const title = collectionObject.title || "Untitled object";
            const favoriteLabel = `${collectionObject.is_favorite ? "Unfavorite" : "Favorite"} ${title}`;
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
                {collectionObject.has_sibling_images && selectionMode ? (
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
                ) : null}
                <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                  <Badge
                    className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                    variant="secondary"
                  >
                    {collectionObjectProviderLabel}
                  </Badge>
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
              <div
                className="relative self-start"
                {...gridShortcutTargetData("object")}
                key={`${collectionObject.provider}-${collectionObject.object_id}-${tileStateKey}`}
                onBlur={(event) => handleShortcutBlur(event, shortcutTargetId)}
                onFocus={() =>
                  activateShortcutTarget({
                    href,
                    id: shortcutTargetId,
                    kind: "object",
                    selectionId,
                  })
                }
                onMouseEnter={() =>
                  activateShortcutTarget({
                    href,
                    id: shortcutTargetId,
                    kind: "object",
                    selectionId,
                  })
                }
                onMouseLeave={() => clearShortcutTarget(shortcutTargetId)}
              >
                <ObjectDetailPendingLink
                  ariaLabel={`Open ${collectionObjectProviderLabel} object ${collectionObject.object_id}`}
                  className={IMAGE_GRID_TILE_CLASS_NAME}
                  closeHref={closeObjectHref}
                  href={href}
                  id={tileId}
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
                <ObjectTileMarkers
                  favoriteLabel={favoriteLabel}
                  imageCount={collectionObject.image_count}
                  isFavorite={collectionObject.is_favorite}
                  onToggleFavorite={() => toggleObjectFavorite(collectionObject)}
                />
              </div>
            );
          }}
        />
      ) : (
        <VirtualizedImageGrid
          className={cn(IMAGE_GRID_CLASS_NAME, "content-start items-start")}
          items={imageAssets}
          renderItem={(imageAsset) => {
            const imageAssetProviderLabel = objectProviderDisplayLabel(
              imageAsset.provider,
            );
            const tileId = imageAssetTileId(imageAsset);
            const selectionId = imageSelectionId(imageAsset);
            const isSelected = selectedIds.has(selectionId);
            const href = imageAssetHref(imageAsset);
            const shortcutTargetId = `image:${selectionId}`;
            const thumbSrc = imageUrl(apiBaseUrl, imageAsset.thumb_url);
            const title = imageAsset.title || "Untitled object";
            const imageAssetLabel = `Image Asset ${imageAsset.image_asset_id}`;
            const favoriteLabel = `${imageAsset.is_favorite ? "Unfavorite" : "Favorite"} ${imageAssetLabel}`;
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
                ) : null}
                <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                  <Badge
                    className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                    variant="secondary"
                  >
                    {imageAssetProviderLabel}
                  </Badge>
                  {imageTopBadgeLabel ? (
                    <>
                      <Badge
                        className={cn(
                          "mt-1 max-w-full truncate",
                          IMAGE_GRID_BADGE_CLASS_NAME,
                        )}
                        variant="secondary"
                      >
                        {imageTopBadgeLabel(imageAsset)}
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
              <div
                className="relative self-start"
                {...gridShortcutTargetData("image")}
                key={`${imageAsset.image_asset_id}-${tileStateKey}`}
                onBlur={(event) => handleShortcutBlur(event, shortcutTargetId)}
                onFocus={() =>
                  activateShortcutTarget({
                    href,
                    id: shortcutTargetId,
                    kind: "image",
                    selectionId,
                  })
                }
                onMouseEnter={() =>
                  activateShortcutTarget({
                    href,
                    id: shortcutTargetId,
                    kind: "image",
                    selectionId,
                  })
                }
                onMouseLeave={() => clearShortcutTarget(shortcutTargetId)}
              >
                <ObjectDetailPendingLink
                  ariaLabel={`Open ${imageAssetProviderLabel} ${imageAssetLabel}`}
                  className={IMAGE_GRID_TILE_CLASS_NAME}
                  closeHref={closeImageHref}
                  href={href}
                  id={tileId}
                  preview={{
                    alt: imageAssetAlt,
                    collectionLabel: imageTopBadgeLabel?.(imageAsset),
                    height: imageAsset.original_height,
                    imageCount: imageAsset.image_count,
                    providerLabel: imageAssetProviderLabel,
                    src: thumbSrc,
                    title,
                    width: imageAsset.original_width,
                  }}
                >
                  {tileContents}
                </ObjectDetailPendingLink>
                <FavoriteTileButton
                  isFavorite={imageAsset.is_favorite}
                  label={favoriteLabel}
                  onToggle={() => toggleImageFavorite(imageAsset)}
                />
              </div>
            );
          }}
        />
      ) : null}
      <SelectionActionDialog
        deleteEndpoint={deleteEndpoint}
        dialogKind={selectionDialogKind}
        exportEndpoint={exportEndpoint}
        imageAssets={imageAssets}
        key={selectionDialogSession}
        onActionComplete={completeCurationAction}
        onClose={() => setSelectionDialogOpen(false)}
        objects={objects}
        open={selectionDialogOpen}
        removeFromCollectionEndpoint={removeFromCollectionEndpoint}
        scopeDisplayName={scopeDisplayName}
        selectedCount={selectedTotalCount}
        selectedIds={Array.from(selectedIds)}
        viewMode={viewMode}
      />
    </>
  );

  if (headerControls !== undefined) {
    return (
      <>
        <AppTopBarPortal>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden @min-[760px]/topbar:gap-1.5 @min-[960px]/topbar:gap-2">
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden @min-[760px]/topbar:gap-1.5 @min-[960px]/topbar:gap-2",
                selectionMode && "@max-[959px]/topbar:hidden",
              )}
            >
              {headerControls}
            </div>
            <div className="ml-auto shrink-0">{selectionToolbar}</div>
          </div>
        </AppTopBarPortal>
        <div className="grid gap-3">{resultSurface}</div>
      </>
    );
  }

  return (
    <div className="grid gap-3">
      {selectionToolbar}
      {resultSurface}
    </div>
  );
}
