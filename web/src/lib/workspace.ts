import type { DashboardSearchSetView } from "./dashboard";

export type WorkspaceMode = "search-set" | "new-search-set" | "user-library";

export function getFirstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function createSearchSetHref(slug: string, filterText: string): string {
  return createWorkspaceHref({ collectionFilterText: filterText, searchSetSlug: slug });
}

export function createNewSearchSetHref(filterText: string): string {
  return createWorkspaceHref({ collectionFilterText: filterText, mode: "new-search-set" });
}

export function createUserLibraryHref(filterText: string): string {
  return createWorkspaceHref({ collectionFilterText: filterText, mode: "user-library" });
}

export function createWorkspaceMode(
  modeParam: string | undefined,
  activeSearchSet: DashboardSearchSetView | null,
): WorkspaceMode {
  if (modeParam === "new-search-set") {
    return "new-search-set";
  }
  if (modeParam === "user-library") {
    return "user-library";
  }
  if (activeSearchSet === null) {
    return "new-search-set";
  }

  return "search-set";
}

export function filterSearchSets(
  searchSets: DashboardSearchSetView[],
  filterText: string,
): DashboardSearchSetView[] {
  const normalizedFilter = filterText.trim().toLowerCase();

  if (normalizedFilter === "") {
    return searchSets;
  }

  return searchSets.filter((searchSet) =>
    [searchSet.displayName, searchSet.termSummary, searchSet.slug]
      .join(" ")
      .toLowerCase()
      .includes(normalizedFilter),
  );
}

function createWorkspaceHref({
  collectionFilterText,
  mode,
  searchSetSlug,
}: {
  collectionFilterText: string;
  mode?: WorkspaceMode;
  searchSetSlug?: string;
}): string {
  const params = new URLSearchParams();

  if (mode !== undefined && mode !== "search-set") {
    params.set("mode", mode);
  }
  if (searchSetSlug !== undefined) {
    params.set("search_set", searchSetSlug);
  }
  if (collectionFilterText.trim() !== "") {
    params.set("collection_filter", collectionFilterText.trim());
  }

  const query = params.toString();
  return query === "" ? "/" : `/?${query}`;
}
