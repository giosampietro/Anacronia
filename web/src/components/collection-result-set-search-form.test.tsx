import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocalResultSetSearchForm } from "./collection-result-set-search-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

describe("LocalResultSetSearchForm", () => {
  it("does not render a visible fixed Search submit label", () => {
    const html = normalizeServerHtml(
      renderToString(
        <LocalResultSetSearchForm
          ariaLabel="Search local Collection results"
          localQueryText=""
          placeholder="Search Snake"
          providerFilter="all"
          searchSetSlug="snake"
          viewMode="objects"
          workspaceMode="search-set"
        />,
      ),
    );

    expect(html).toContain("aria-label=\"Search local Collection results\"");
    expect(html).toContain("placeholder=\"Search Snake\"");
    expect(html).not.toMatch(/<button[^>]*>\s*Search\s*<\/button>/);
    expect(html).toContain("aria-label=\"Submit local search\"");
    expect(html).toContain("class=\"sr-only\"");
    expect(html).not.toContain("Clear local search");
  });

  it("keeps the clear control only when local search is active", () => {
    const html = normalizeServerHtml(
      renderToString(
        <LocalResultSetSearchForm
          ariaLabel="Search local My Library results"
          localQueryText="rings"
          placeholder="Search Library"
          providerFilter="met"
          viewMode="images"
          workspaceMode="user-library"
        />,
      ),
    );

    expect(html).toContain("value=\"rings\"");
    expect(html).toContain("aria-label=\"Clear local search\"");
    expect(html).not.toMatch(/<button[^>]*>\s*Search\s*<\/button>/);
  });
});
