export type CollectionExportAvailability = {
  available: boolean;
  reason: string;
};

export type CollectionExportFormat = "jsonl" | "csv" | "package";

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
  if (format === "package") {
    return "Build package";
  }

  return `Export ${format.toUpperCase()}`;
}

export function exportPendingLabel(format: CollectionExportFormat): string {
  if (format === "package") {
    return "Building package...";
  }

  return `Exporting ${format.toUpperCase()}...`;
}

export function exportSuccessLabel(format: CollectionExportFormat): string {
  if (format === "package") {
    return "Package export ready";
  }

  return `${format.toUpperCase()} export ready`;
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

  return `${imageAssetLabel} packaged with manifest.jsonl, metadata.csv, standard-1024 images, and thumb-256 images.`;
}
