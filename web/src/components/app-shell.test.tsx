import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";
import type { OperationalDashboardView } from "@/lib/dashboard";
import type { StatusRow } from "@/lib/status";

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
  it("keeps the Collection header focused while the Local Result Set owns grid controls", () => {
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

    expect(html).toContain("INTAGLIO RINGS");
    expect(html).toContain("aria-label=\"Workspace\"");
    expect(html).not.toContain("aria-label=\"Primary grid view controls\"");
    expect(html).not.toContain("aria-label=\"Collection counts\"");
    expect(html).not.toContain("12 objects");
    expect(html).not.toContain("38 images");
  });

  it("labels the library header as My Library with the same count pattern", () => {
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

    expect(html).toContain("MY LIBRARY");
    expect(html).toContain(">My Library<");
    expect(html).toContain("aria-label=\"Primary grid view controls\"");
    expect(html).toContain("data-slot=\"toggle-group\"");
    expect(html).toContain("aria-label=\"Grid view\"");
    expect(html).toContain("4 objects");
    expect(html).toContain("7 images");
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
    expect(html).not.toContain("mode=new-search-set");
    expect(html).not.toContain("View search");
  });
});
