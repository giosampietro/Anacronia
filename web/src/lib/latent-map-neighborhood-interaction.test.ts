import { describe, expect, it } from "vitest";

import {
  getLatentMapNeighborhoodClickAction,
  isLatentMapNeighborRequestCurrent,
} from "@/lib/latent-map-neighborhood-interaction";

describe("latent map neighborhood interaction", () => {
  it("selects only active neighborhood grid items", () => {
    const activeImageIds = new Set(["img_anchor", "img_neighbor"]);

    expect(
      getLatentMapNeighborhoodClickAction({
        activeImageIds,
        clickedImageId: "img_neighbor",
        isActive: true,
        selectedImageId: "img_anchor",
      }),
    ).toEqual({
      imageId: "img_neighbor",
      kind: "select",
    });
  });

  it("ignores inactive, anchor, and background clicks", () => {
    const activeImageIds = new Set(["img_anchor", "img_neighbor"]);

    expect(
      getLatentMapNeighborhoodClickAction({
        activeImageIds,
        clickedImageId: "img_neighbor",
        isActive: false,
        selectedImageId: "img_anchor",
      }),
    ).toEqual({ kind: "none" });
    expect(
      getLatentMapNeighborhoodClickAction({
        activeImageIds,
        clickedImageId: "img_anchor",
        isActive: true,
        selectedImageId: "img_anchor",
      }),
    ).toEqual({ kind: "none" });
    expect(
      getLatentMapNeighborhoodClickAction({
        activeImageIds,
        clickedImageId: "img_background",
        isActive: true,
        selectedImageId: "img_anchor",
      }),
    ).toEqual({ kind: "none" });
  });

  it("rejects stale neighbor request state updates", () => {
    expect(
      isLatentMapNeighborRequestCurrent({
        latestRequestId: 4,
        requestId: 4,
      }),
    ).toBe(true);
    expect(
      isLatentMapNeighborRequestCurrent({
        latestRequestId: 5,
        requestId: 4,
      }),
    ).toBe(false);
  });
});
