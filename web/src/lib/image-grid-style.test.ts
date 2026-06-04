import { describe, expect, it } from "vitest";

import {
  IMAGE_GRID_BADGE_CLASS_NAME,
  IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_IMAGE_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
  IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME,
  IMAGE_GRID_TILE_CLASS_NAME,
} from "./image-grid-style";

describe("image grid style", () => {
  it("uses the measured grid treatment with no more than seven columns", () => {
    expect(IMAGE_GRID_CLASS_NAME).toContain("gap-2");
    expect(IMAGE_GRID_CLASS_NAME).toContain("xl:grid-cols-7");
    expect(IMAGE_GRID_CLASS_NAME).not.toContain("2xl:grid-cols-8");
    expect(IMAGE_GRID_CLASS_NAME).not.toContain("grid-cols-8");

    expect(IMAGE_GRID_TILE_CLASS_NAME).toContain("rounded-lg");
    expect(IMAGE_GRID_TILE_CLASS_NAME).toContain("isolate");
    expect(IMAGE_GRID_TILE_CLASS_NAME).not.toContain("rounded-2xl");

    expect(IMAGE_GRID_BADGE_CLASS_NAME).toContain("rounded-lg");
    expect(IMAGE_GRID_IMAGE_CLASS_NAME).toContain("group-hover:scale-[1.035]");
    expect(IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME).toContain("text-white");
    expect(IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME).not.toContain("bg-");
    expect(IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME).not.toContain("rounded");
    expect(IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME).not.toContain("shadow");
    expect(IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME).not.toContain("absolute");
    expect(IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME).not.toContain("backdrop-blur");
    expect(IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME).toContain("mb-1");
    expect(IMAGE_GRID_OVERLAY_CLASS_NAME).toContain("rounded-md");
    expect(IMAGE_GRID_OVERLAY_CLASS_NAME).toContain("group-focus:opacity-100");
    expect(IMAGE_GRID_OVERLAY_CLASS_NAME).not.toContain("bg-gradient-to-t");
  });
});
