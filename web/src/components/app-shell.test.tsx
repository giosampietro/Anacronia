import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";
import type { OperationalDashboardView } from "@/lib/dashboard";
import type { StatusRow } from "@/lib/status";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const rows: StatusRow[] = [
  {
    detail: "Listening on localhost:18661",
    displayState: "ok",
    name: "Next.js UI",
    state: "ok",
  },
];

const dashboardView: OperationalDashboardView = {
  activeSearchSet: {
    activeTerms: ["snake"],
    displayName: "inTagLIO rings",
    inactiveTerms: [],
    importedImageCount: 38,
    importedObjectCount: 12,
    isActive: true,
    providerCollections: [],
    slug: "intaglio",
    termSummary: "snake",
  },
  libraryImageCount: 7,
  providerFocus: [],
  searchSets: [],
  workerStatus: "idle",
};

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

describe("AppShell", () => {
  it("renders a shell header target for Collection result controls", () => {
    const html = normalizeServerHtml(renderToString(
      <AppShell
        activeSearchSetSlug="intaglio"
        appVersionStamp={{ display: "v0.1.60", title: "App version v0.1.60" }}
        collectAvailable
        contentHeaderImageCount={38}
        contentHeaderObjectCount={12}
        dashboardView={dashboardView}
        filterText=""
        gridViewImageHref="/?search_set=intaglio&view=images"
        gridViewMode="objects"
        gridViewObjectHref="/?search_set=intaglio"
        rows={rows}
        workspaceMode="search-set"
      >
        <div>Grid</div>
      </AppShell>,
    ));

    expect(html).toContain("aria-label=\"Workspace\"");
    expect(html).toContain("id=\"app-shell-top-bar-controls\"");
    expect(html).toContain("sticky top-0 z-40");
    expect(html).toContain("border-b bg-background");
    expect(html).not.toContain("INTAGLIO RINGS");
    expect(html).not.toContain("bg-background/80");
    expect(html).not.toContain("backdrop-blur");
    expect(html).not.toContain("aria-label=\"Primary grid view controls\"");
    expect(html).not.toContain("aria-label=\"Collection counts\"");
    expect(html).not.toContain("12 objects");
    expect(html).not.toContain("38 images");
  });

  it("renders a shell header target for library result controls", () => {
    const html = normalizeServerHtml(renderToString(
      <AppShell
        activeSearchSetSlug={null}
        appVersionStamp={{ display: "v0.1.60", title: "App version v0.1.60" }}
        collectAvailable
        contentHeaderImageCount={7}
        contentHeaderObjectCount={4}
        dashboardView={{ ...dashboardView, activeSearchSet: null }}
        filterText=""
        gridViewImageHref="/?mode=user-library"
        gridViewMode="images"
        gridViewObjectHref="/?mode=user-library&view=objects"
        rows={rows}
        workspaceMode="user-library"
      >
        <div>Grid</div>
      </AppShell>,
    ));

    expect(html).toContain("id=\"app-shell-top-bar-controls\"");
    expect(html).not.toContain("MY LIBRARY");
    expect(html).toContain(">My Library<");
    expect(html).not.toContain("aria-label=\"Primary grid view controls\"");
    expect(html).not.toContain("aria-label=\"Collection counts\"");
    expect(html).not.toContain("4 objects");
    expect(html).not.toContain("7 images");
  });

  it("renders a collapsed runtime status footer without a local runtime label", () => {
    const html = renderToString(
      <AppShell
        activeSearchSetSlug="intaglio"
        appVersionStamp={{ display: "v0.1.60", title: "App version v0.1.60" }}
        collectAvailable
        contentHeaderImageCount={38}
        contentHeaderObjectCount={12}
        dashboardView={dashboardView}
        filterText=""
        rows={rows}
        workspaceMode="search-set"
      >
        <div>Grid</div>
      </AppShell>,
    );

    expect(html).toContain("Runtime status");
    expect(html).toContain("ok");
    expect(html).not.toContain("Local runtime");
    expect(html).not.toContain("lucide-hard-drive");
  });

  it("renders the project attribution in the sidebar footer", () => {
    const html = renderToString(
      <AppShell
        activeSearchSetSlug="intaglio"
        appVersionStamp={{ display: "v0.1.60", title: "App version v0.1.60" }}
        collectAvailable
        contentHeaderImageCount={38}
        contentHeaderObjectCount={12}
        dashboardView={dashboardView}
        filterText=""
        rows={rows}
        workspaceMode="search-set"
      >
        <div>Grid</div>
      </AppShell>,
    );

    expect(html).toContain("Made in Anacronia by Gio Sampietro");
  });

  it("keeps New Collection in place when another search is active", () => {
    const html = renderToString(
      <AppShell
        activeSearchSetSlug="intaglio"
        appVersionStamp={{ display: "v0.1.60", title: "App version v0.1.60" }}
        collectAvailable={false}
        contentHeaderImageCount={38}
        contentHeaderObjectCount={12}
        dashboardView={dashboardView}
        filterText=""
        rows={rows}
        workspaceMode="search-set"
      >
        <div>Grid</div>
      </AppShell>,
    );

    expect(html).toContain("aria-haspopup=\"dialog\"");
    expect(html).toContain("aria-disabled=\"true\"");
    expect(html).toContain("data-disabled=\"true\"");
    expect(html).toContain("cursor-not-allowed");
    expect(html).not.toContain("aria-disabled:pointer-events-none");
    expect(html).not.toContain("mode=new-search-set");
    expect(html).not.toContain("View search");
  });

  it("restores a closed sidebar as offcanvas instead of an icon rail", () => {
    const html = renderToString(
      <AppShell
        activeSearchSetSlug="intaglio"
        appVersionStamp={{ display: "v0.1.60", title: "App version v0.1.60" }}
        collectAvailable
        dashboardView={dashboardView}
        defaultSidebarOpen={false}
        filterText=""
        rows={rows}
        workspaceMode="search-set"
      >
        <div>Grid</div>
      </AppShell>,
    );

    expect(html).toContain("data-state=\"collapsed\"");
    expect(html).toContain("data-collapsible=\"offcanvas\"");
    expect(html).toContain("data-sidebar-preview-trigger=\"true\"");
    expect(html).not.toContain("data-collapsible=\"icon\"");
    expect(html).not.toContain("data-slot=\"sidebar-rail\"");
    expect(html).not.toContain("has-data-\\[variant\\=inset\\]\\:bg-sidebar");
    expect(html).not.toContain("peer-data-\\[state\\=collapsed\\]\\:ml-2");
  });
});
