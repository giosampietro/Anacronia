import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SidebarCollectionFilter } from "./sidebar-collection-filter";
import type { DashboardSearchSetView } from "@/lib/dashboard";

const snakeStudy: DashboardSearchSetView = {
  displayName: "Snake Study",
  slug: "snake-study",
  activeTerms: ["snake"],
  inactiveTerms: [],
  termSummary: "snake",
  isActive: false,
  providerCollections: [],
  importedObjectCount: 2,
  importedImageCount: 5,
};

const masks: DashboardSearchSetView = {
  displayName: "Masks",
  slug: "masks",
  activeTerms: ["mask"],
  inactiveTerms: [],
  termSummary: "mask",
  isActive: true,
  providerCollections: [],
  importedObjectCount: 1,
  importedImageCount: 1,
};

describe("SidebarCollectionFilter", () => {
  it("renders the filtered Collection list without a submit button", () => {
    const html = renderToString(
      <SidebarCollectionFilter
        activeSearchSetSlug="masks"
        initialFilterText="snake"
        searchSets={[snakeStudy, masks]}
        workspaceMode="search-set"
      />,
    );

    expect(html).toContain("Snake Study");
    expect(html).not.toContain("Masks");
    expect(html).not.toContain("type=\"submit\"");
    expect(html).not.toContain("Search Collections");
  });
});
