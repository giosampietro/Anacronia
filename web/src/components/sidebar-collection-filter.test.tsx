import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CollectionDeleteDialogBody,
  SidebarCollectionFilter,
} from "./sidebar-collection-filter";
import { AlertDialog } from "./ui/alert-dialog";
import { SidebarProvider } from "./ui/sidebar";
import type { DashboardSearchSetView } from "@/lib/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const snakeStudy: DashboardSearchSetView = {
  displayName: "sNaKe STUDY",
  slug: "snake-study",
  activeTerms: ["snake"],
  inactiveTerms: [],
  termSummary: "snake",
  isActive: false,
  providerCollections: [],
  importedObjectCount: 2,
  importedImageCount: 5,
};

const runningSnakeStudy: DashboardSearchSetView = {
  ...snakeStudy,
  providerCollections: [
    {
      provider: "met",
      providerLabel: "Met",
      status: "running",
      pauseReason: "",
      candidateOffset: 0,
      candidateLimit: 20,
      batchTarget: 5,
      nextCandidateOffset: 20,
      progressLabel: "0/0 candidates",
      progressPercent: 0,
      importedObjectCount: 2,
      importedImageCount: 5,
      continueCandidateOffset: null,
      latestRunLabel: "Collect 1",
    },
  ],
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
    expect(html).not.toContain("sNaKe STUDY");
    expect(html).not.toContain("Masks");
    expect(html).toContain("lucide-list-filter");
    expect(html).not.toContain("type=\"submit\"");
    expect(html).not.toContain("Search Collections");
  });

  it("shows a clear control only when the Collection filter has text", () => {
    const filteredHtml = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="masks"
          initialFilterText="snake"
          searchSets={[snakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );
    const unfilteredHtml = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="masks"
          initialFilterText=""
          searchSets={[snakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(filteredHtml).toContain("Clear Collection filter");
    expect(unfilteredHtml).not.toContain("Clear Collection filter");
  });

  it("renders active Collections as compact linked folders with keyword details", () => {
    const html = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="snake-study"
          initialFilterText=""
          searchSets={[snakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(html).toContain("href=\"/?search_set=snake-study\"");
    expect(html).toContain("lucide-folder-open");
    expect(html).toContain("lucide-folder-closed");
    expect(html).toContain("Snake Study");
    expect(html).not.toContain("sNaKe STUDY");
    expect(html).toContain("snake");
    expect(html).toContain("5 images");
    expect(html).toContain("data-slot=\"context-menu-trigger\"");
    expect(html).not.toContain("lucide-database");
    expect(html).not.toContain("More actions for Snake Study");
  });

  it("keeps the search icon only for the empty Collection filter state", () => {
    const html = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug={null}
          initialFilterText="zzzz"
          searchSets={[snakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(html).toContain("No matching Collections");
    expect(html).toContain("lucide-list-filter");
    expect(html).toContain("lucide-search");
  });

  it("renders a spinner next to the image count for actively searching Collections", () => {
    const html = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="snake-study"
          initialFilterText=""
          searchSets={[runningSnakeStudy, masks]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(html).toContain("Snake Study search in progress");
    expect(html).toContain("lucide-loader");
    expect(html).toContain("5 images");
  });

  it("does not render a spinner for paused Collections", () => {
    const html = renderToString(
      <SidebarProvider>
        <SidebarCollectionFilter
          activeSearchSetSlug="snake-study"
          initialFilterText=""
          searchSets={[
            {
              ...runningSnakeStudy,
              providerCollections: runningSnakeStudy.providerCollections.map(
                (providerCollection) => ({
                  ...providerCollection,
                  status: "paused",
                }),
              ),
            },
          ]}
          workspaceMode="search-set"
        />
      </SidebarProvider>,
    );

    expect(html).not.toContain("search in progress");
    expect(html).not.toContain("lucide-loader");
    expect(html).toContain("5 images");
  });

  it("centers Collection icons in the collapsed sidebar rail", () => {
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

    expect(html).toContain("group-data-[collapsible=icon]:justify-center");
  });

  it("renders Delete Collection confirmation copy for downloaded material", () => {
    const html = renderToString(
      <AlertDialog open>
        <CollectionDeleteDialogBody
          deleteError={null}
          isDeleting={false}
          onDelete={() => undefined}
          searchSet={snakeStudy}
        />
      </AlertDialog>,
    );

    expect(html).toContain("Delete &quot;");
    expect(html).toContain("Snake Study");
    expect(html).toContain("This will remove 2 objects and 5 images from this Collection.");
    expect(html).toContain("Shared material used by other Collections will stay.");
    expect(html).toContain("remain in My Library as No Collection");
    expect(html).toContain("Local files for non-favorite exclusive material will be deleted.");
    expect(html).toContain("Exports will not be deleted.");
    expect(html).toContain("There is no undo.");
    expect(html).toContain("Delete Collection");
  });
});
