import type { WorkspaceMode } from "./workspace";

export type GridViewMode = "objects" | "images";

export type ObjectRouteRef = {
  objectId: number;
  provider: string;
};

export function defaultGridViewMode(workspaceMode: WorkspaceMode): GridViewMode {
  return workspaceMode === "user-library" ? "images" : "objects";
}

export function createGridViewMode(
  viewParam: string | undefined,
  workspaceMode: WorkspaceMode,
): GridViewMode {
  if (viewParam === "objects" || viewParam === "images") {
    return viewParam;
  }

  return defaultGridViewMode(workspaceMode);
}

export function isDefaultGridViewMode(
  viewMode: GridViewMode,
  workspaceMode: WorkspaceMode,
): boolean {
  return viewMode === defaultGridViewMode(workspaceMode);
}

export function createObjectRouteKey(provider: string, objectId: number): string {
  return `${provider}:${objectId}`;
}

export function parseObjectRouteKey(value: string | undefined): ObjectRouteRef | null {
  if (value === undefined) {
    return null;
  }

  const [provider, objectIdText, ...extraParts] = value.split(":");
  const objectId = Number.parseInt(objectIdText ?? "", 10);
  if (
    extraParts.length > 0 ||
    provider.trim() === "" ||
    !Number.isFinite(objectId)
  ) {
    return null;
  }

  return {
    objectId,
    provider,
  };
}

export function createGridStateHref({
  collectionFilterText = "",
  filterText,
  imageAssetId,
  localQueryText = "",
  object,
  provider = "all",
  searchSetSlug,
  viewMode,
  workspaceMode,
}: {
  collectionFilterText?: string;
  filterText?: string;
  imageAssetId?: number;
  localQueryText?: string;
  object?: ObjectRouteRef;
  provider?: string;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
}): string {
  const params = new URLSearchParams();

  if (workspaceMode === "user-library") {
    params.set("mode", "user-library");
  }
  if (searchSetSlug !== undefined) {
    params.set("search_set", searchSetSlug);
  }
  if (!isDefaultGridViewMode(viewMode, workspaceMode)) {
    params.set("view", viewMode);
  }
  if (object !== undefined) {
    params.set("object", createObjectRouteKey(object.provider, object.objectId));
  } else if (imageAssetId !== undefined) {
    params.set("image", String(imageAssetId));
  }
  if (collectionFilterText.trim() !== "") {
    params.set("collection_filter", collectionFilterText.trim());
  }
  if (localQueryText.trim() !== "") {
    params.set("q", localQueryText.trim());
  }
  if (provider.trim() !== "" && provider !== "all") {
    params.set("provider", provider.trim());
  }
  if (filterText !== undefined && filterText.trim() !== "") {
    params.set("filter", filterText.trim());
  }

  const query = params.toString();
  return query === "" ? "/" : `/?${query}`;
}
