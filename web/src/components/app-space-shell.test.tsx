import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AppSpaceShell,
  shouldToggleAppSpaceFocusMode,
} from "@/components/app-space-shell";

describe("AppSpaceShell", () => {
  it("renders the persistent App Space Navigation Rail with an active space", () => {
    const html = renderToString(
      <AppSpaceShell activeSpace="analysis">
        <main>Analysis Studio content</main>
      </AppSpaceShell>,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"analysis\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("href=\"/\"");
    expect(html).toContain("Library / Collections");
    expect(html).toContain("href=\"/analysis-results\"");
    expect(html).toContain("Analysis Studio");
    expect(html).toContain("href=\"/latent-map\"");
    expect(html).toContain("Latent Space Explorer");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("Analysis Studio content");
  });

  it("only treats plain f on a non-editable target as a Focus Mode toggle", () => {
    expect(
      shouldToggleAppSpaceFocusMode({
        altKey: false,
        ctrlKey: false,
        isContentEditable: false,
        key: "f",
        metaKey: false,
        targetTagName: "DIV",
      }),
    ).toBe(true);

    expect(
      shouldToggleAppSpaceFocusMode({
        altKey: false,
        ctrlKey: false,
        isContentEditable: false,
        key: "F",
        metaKey: false,
        targetTagName: "CANVAS",
      }),
    ).toBe(true);

    expect(
      shouldToggleAppSpaceFocusMode({
        altKey: false,
        ctrlKey: false,
        isContentEditable: false,
        key: "f",
        metaKey: true,
        targetTagName: "DIV",
      }),
    ).toBe(false);

    expect(
      shouldToggleAppSpaceFocusMode({
        altKey: false,
        ctrlKey: false,
        isContentEditable: false,
        key: "f",
        metaKey: false,
        targetTagName: "INPUT",
      }),
    ).toBe(false);
  });
});
