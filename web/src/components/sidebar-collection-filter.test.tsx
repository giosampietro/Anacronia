import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SidebarCollectionFilter } from "./sidebar-collection-filter";
import { SidebarProvider } from "./ui/sidebar";
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
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="masks"
          initialFilterText="snake"
          searchSets={[snakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(html).toContain("Snake Study");
    expect(html).not.toContain("Masks");
    expect(html).not.toContain("type=\"submit\"");
    expect(html).not.toContain("Search Collections");
  });

  it("does not render unused hover actions beside Collection image counts", () => {
    const html = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="masks"
          initialFilterText=""
          searchSets={[snakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(html).toContain("5");
    expect(html).toContain("1");
    expect(html).not.toContain("More actions for");
  });
});
