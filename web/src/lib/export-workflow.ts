import { parseObjectRouteKey, type GridViewMode } from "./grid-view";

export type CollectionExportAvailability = {
  available: boolean;
  reason: string;
};

export type CollectionExportFormat = "jsonl" | "csv" | "package";

export const COLLECTION_EXPORT_FORMAT_OPTIONS: Array<{
  format: CollectionExportFormat;
  title: string;
  description: string;
}> = [
  {
    format: "jsonl",
    title: "Export metadata JSONL",
    description: "For Python and AI workflows.",
  },
  {
    format: "csv",
    title: "Export spreadsheet CSV",
    description: "For spreadsheet review.",
  },
  {
    format: "package",
    title: "Export images + metadata",
    description: "Includes metadata, 1024 images, and thumbnails.",
  },
];

export type CollectionExportObjectSelection = {
  provider: string;
  object_id: number;
};

export type SelectedCollectionExportRequest = {
  format: CollectionExportFormat;
  selection: {
    image_asset_ids: number[];
    objects: CollectionExportObjectSelection[];
  };
};

export function collectionExportAvailability({
  importedImageCount,
  providerStatuses,
}: {
  importedImageCount: number;
  providerStatuses: string[];
}): CollectionExportAvailability {
  if (providerStatuses.some((status) => status === "running" || status === "stopping")) {
    return {
      available: false,
      reason: "Export is available after the active Provider Search stops.",
    };
  }

  if (importedImageCount <= 0) {
    return {
      available: false,
      reason: "Export is available after this Collection has Image Assets.",
    };
  }

  return {
    available: true,
    reason: "",
  };
}

export function exportActionLabel(format: CollectionExportFormat): string {
  switch (format) {
    case "jsonl":
      return "Export metadata JSONL";
    case "csv":
      return "Export spreadsheet CSV";
    case "package":
      return "Export images + metadata";
  }
}

export function exportPendingLabel(format: CollectionExportFormat): string {
  switch (format) {
    case "jsonl":
      return "Exporting metadata JSONL...";
    case "csv":
      return "Exporting spreadsheet CSV...";
    case "package":
      return "Exporting images + metadata...";
  }
}

export function exportSuccessLabel(format: CollectionExportFormat): string {
  switch (format) {
    case "jsonl":
      return "Metadata JSONL export ready";
    case "csv":
      return "Spreadsheet CSV export ready";
    case "package":
      return "Images + metadata export ready";
  }
}

export function exportArtifactSummary({
  format,
  rowCount,
}: {
  format: CollectionExportFormat;
  rowCount: string;
}): string {
  const imageAssetLabel = `${rowCount} Image Asset${rowCount === "1" ? "" : "s"}`;

  if (format === "jsonl") {
    return `${imageAssetLabel} written to manifest.jsonl.`;
  }

  if (format === "csv") {
    return `${imageAssetLabel} written to metadata.csv.`;
  }

  return `${imageAssetLabel} exported with metadata, 1024 images, and thumbnails.`;
}

function parseImageSelectionId(value: string): number | null {
  if (!value.startsWith("image:")) {
    return null;
  }

  const imageAssetId = Number.parseInt(value.slice("image:".length), 10);
  return Number.isFinite(imageAssetId) ? imageAssetId : null;
}

function parseObjectSelectionId(value: string): CollectionExportObjectSelection | null {
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

export function createSelectedCollectionExportRequest({
  format,
  selectedIds,
  viewMode,
}: {
  format: CollectionExportFormat;
  selectedIds: string[];
  viewMode: GridViewMode;
}): SelectedCollectionExportRequest {
  if (viewMode === "images") {
    return {
      format,
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
    format,
    selection: {
      image_asset_ids: [],
      objects: selectedIds.flatMap((selectedId) => {
        const selectedObject = parseObjectSelectionId(selectedId);
        return selectedObject === null ? [] : [selectedObject];
      }),
    },
  };
}
