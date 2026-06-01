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
    displayName: "Intaglio",
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
  it("renders a unified uppercase Collection header with Object and Image counts", () => {
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

    expect(html).toContain("INTAGLIO");
    expect(html).toContain("Show Objects");
    expect(html).toContain("Show Images");
    expect(html).toContain("/?search_set=intaglio&amp;view=images");
    expect(html).toContain("12 objects");
    expect(html).toContain("38 images");
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
        rows={rows}
        workspaceMode="user-library"
      >
        <div>Grid</div>
      </AppShell>,
    ));

    expect(html).toContain("MY LIBRARY");
    expect(html).toContain("4 objects");
    expect(html).toContain("7 images");
  });

  it("renders the runtime footer heading as a sidebar section label without an action icon", () => {
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

    expect(html).toContain("Local runtime");
    expect(html).toContain("data-slot=\"sidebar-group-label\"");
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
