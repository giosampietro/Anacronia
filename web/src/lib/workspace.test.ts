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
  importedImageCount: 0,
};

describe("workspace navigation helpers", () => {
  it("builds navigation hrefs that preserve Search Set filters", () => {
    expect(createNewSearchSetHref("snake")).toBe("/?mode=new-search-set&filter=snake");
    expect(createSearchSetHref("snake-studies", "snake")).toBe(
      "/?search_set=snake-studies&filter=snake",
    );
    expect(createUserLibraryHref("snake")).toBe("/?mode=user-library&filter=snake");
  });

  it("selects the New Search Set workspace when requested or no Search Set exists", () => {
    expect(createWorkspaceMode("new-search-set", snakeStudy)).toBe("new-search-set");
    expect(createWorkspaceMode("user-library", snakeStudy)).toBe("user-library");
    expect(createWorkspaceMode(undefined, null)).toBe("new-search-set");
    expect(createWorkspaceMode(undefined, snakeStudy)).toBe("search-set");
  });

  it("filters Search Sets by title, slug, or term summary", () => {
    expect(filterSearchSets([snakeStudy, masks], "anaconda").map((searchSet) => searchSet.slug)).toEqual([
      "snake-studies",
    ]);
    expect(filterSearchSets([snakeStudy, masks], "mask").map((searchSet) => searchSet.slug)).toEqual([
      "masks",
    ]);
  });
});
