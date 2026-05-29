import { describe, expect, it } from "vitest";

import { parseSearchTerms, termDetectionLabel } from "./search-terms";

describe("search term helpers", () => {
  it("parses comma and newline separated Collection terms for preview", () => {
    expect(parseSearchTerms("snake, anaconda\nserpent, snake")).toEqual([
      "snake",
      "anaconda",
      "serpent",
    ]);
    expect(termDetectionLabel(["snake", "anaconda", "serpent"])).toBe(
      "3 terms detected: snake, anaconda, serpent",
    );
  });
});
