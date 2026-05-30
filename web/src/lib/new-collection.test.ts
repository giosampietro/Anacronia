import { describe, expect, it } from "vitest";

import { canStartNewCollectionSearch } from "./new-collection";

describe("new Collection form state", () => {
  it("enables Start search only after a title and at least one valid term exist", () => {
    expect(canStartNewCollectionSearch("", "snake")).toBe(false);
    expect(canStartNewCollectionSearch("Snake Study", " , \n ")).toBe(false);
    expect(canStartNewCollectionSearch("Snake Study", "snake, serpent")).toBe(true);
  });
});
