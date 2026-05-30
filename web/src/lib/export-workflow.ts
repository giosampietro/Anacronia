export type CollectionExportAvailability = {
  available: boolean;
  reason: string;
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
