import { describe, expect, it } from "vitest";

import { nextCarouselIndex, previousCarouselIndex } from "./carousel";

describe("carousel navigation", () => {
  it("wraps next from the last image back to the first image", () => {
    expect(nextCarouselIndex(2, 3)).toBe(0);
  });

  it("wraps previous from the first image back to the last image", () => {
    expect(previousCarouselIndex(0, 3)).toBe(2);
  });
});
