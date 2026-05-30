import { describe, expect, it } from "vitest";

import { providerSourceFooterClassName } from "./provider-source-card";

describe("providerSourceFooterClassName", () => {
  it("keeps Provider Source action footers visually flush with the card", () => {
    const className = providerSourceFooterClassName("stacked");

    expect(className).toContain("border-t");
    expect(className).not.toContain("bg-muted");
  });
});
