import { describe, expect, it } from "vitest";

import {
  createNewSearchSetHref,
  createSearchSetHref,
  createUserLibraryHref,
  createWorkspaceMode,
  filterSearchSets,
} from "./workspace";
import type { DashboardSearchSetView } from "./dashboard";

const snakeStudy: DashboardSearchSetView = {
  displayName: "Snake Studies",
  slug: "snake-studies",
  activeTerms: ["snake", "anaconda"],
  inactiveTerms: [],
  termSummary: "snake, anaconda",
  isActive: true,
  providerCollections: [],
  importedObjectCount: 0,
  importedImageCount: 0,
};

const masks: DashboardSearchSetView = {
  displayName: "Masks",
  slug: "masks",
  activeTerms: ["mask", "face"],
  inactiveTerms: [],
  termSummary: "mask, face",
  isActive: false,
  providerCollections: [],
  importedObjectCount: 0,
  importedImageCount: 0,
};

describe("workspace navigation helpers", () => {
  it("builds navigation hrefs that preserve Collection filters", () => {
    expect(createNewSearchSetHref("snake")).toBe(
      "/?mode=new-search-set&collection_filter=snake",
    );
    expect(createSearchSetHref("snake-studies", "snake")).toBe(
      "/?search_set=snake-studies&collection_filter=snake",
    );
    expect(createUserLibraryHref("snake")).toBe(
      "/?mode=user-library&collection_filter=snake",
    );
  });

  it("selects explicit workspaces and defaults bare loads to the User Library", () => {
    expect(createWorkspaceMode("new-search-set", snakeStudy)).toBe("new-search-set");
    expect(createWorkspaceMode("user-library", snakeStudy)).toBe("user-library");
    expect(createWorkspaceMode(undefined, null)).toBe("user-library");
    expect(createWorkspaceMode(undefined, snakeStudy)).toBe("search-set");
  });

  it("filters Collections by title, slug, or term summary", () => {
    expect(filterSearchSets([snakeStudy, masks], "anaconda").map((searchSet) => searchSet.slug)).toEqual([
      "snake-studies",
    ]);
    expect(filterSearchSets([snakeStudy, masks], "mask").map((searchSet) => searchSet.slug)).toEqual([
      "masks",
    ]);
  });
});
