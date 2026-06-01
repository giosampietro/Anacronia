import { describe, expect, it } from "vitest";

import { formatCollectionDisplayName } from "./collection-display";

describe("formatCollectionDisplayName", () => {
  it("normalizes Collection names to Camel Case for ordinary UI surfaces", () => {
    expect(formatCollectionDisplayName("snake")).toBe("Snake");
    expect(formatCollectionDisplayName("snake jewelry")).toBe("Snake Jewelry");
    expect(formatCollectionDisplayName("SNAKE JEWELRY")).toBe("Snake Jewelry");
    expect(formatCollectionDisplayName("sNaKe vessel")).toBe("Snake Vessel");
  });

  it("keeps spacing predictable and provides a fallback label", () => {
    expect(formatCollectionDisplayName("  ritual   vessels  ")).toBe(
      "Ritual Vessels",
    );
    expect(formatCollectionDisplayName("")).toBe("Collection");
  });
});
