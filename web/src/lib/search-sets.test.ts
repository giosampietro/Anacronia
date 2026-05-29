import { describe, expect, it } from "vitest";

import { createSearchSetCards } from "./search-sets";

describe("createSearchSetCards", () => {
  it("summarizes active and inactive Collection terms", () => {
    const cards = createSearchSetCards([
      {
        display_name: "Snake Studies",
        slug: "snake-studies",
        terms: [
          { term: "snake", active: true },
          { term: "anaconda", active: true },
          { term: "serpet", active: false },
        ],
      },
    ]);

    expect(cards).toEqual([
      {
        displayName: "Snake Studies",
        slug: "snake-studies",
        activeTerms: ["snake", "anaconda"],
        inactiveTerms: ["serpet"],
        summary: "2 active terms",
      },
    ]);
  });
});
