import { describe, expect, it } from "vitest";

import { getObjectDetailOverlayKeyAction } from "./detail-overlay-keyboard";

describe("getObjectDetailOverlayKeyAction", () => {
  it("maps arrows to carousel and object navigation actions", () => {
    expect(
      getObjectDetailOverlayKeyAction("ArrowLeft", {
        hasMultipleImages: true,
        nextObjectHref: "/?search_set=snake&object_id=41",
        previousObjectHref: "/?search_set=snake&object_id=39",
      }),
    ).toEqual({ kind: "previous-image", preventDefault: true });
    expect(
      getObjectDetailOverlayKeyAction("ArrowRight", {
        hasMultipleImages: true,
        nextObjectHref: "/?search_set=snake&object_id=41",
        previousObjectHref: "/?search_set=snake&object_id=39",
      }),
    ).toEqual({ kind: "next-image", preventDefault: true });
    expect(
      getObjectDetailOverlayKeyAction("ArrowUp", {
        hasMultipleImages: true,
        nextObjectHref: "/?search_set=snake&object_id=41",
        previousObjectHref: "/?search_set=snake&object_id=39",
      }),
    ).toEqual({
      href: "/?search_set=snake&object_id=39",
      kind: "previous-object",
      preventDefault: true,
    });
    expect(
      getObjectDetailOverlayKeyAction("ArrowDown", {
        hasMultipleImages: true,
        nextObjectHref: "/?search_set=snake&object_id=41",
        previousObjectHref: "/?search_set=snake&object_id=39",
      }),
    ).toEqual({
      href: "/?search_set=snake&object_id=41",
      kind: "next-object",
      preventDefault: true,
    });
  });

  it("still blocks arrow-key page scrolling at image and object boundaries", () => {
    expect(
      getObjectDetailOverlayKeyAction("ArrowLeft", {
        hasMultipleImages: false,
        nextObjectHref: null,
        previousObjectHref: null,
      }),
    ).toEqual({ kind: "none", preventDefault: true });
    expect(
      getObjectDetailOverlayKeyAction("ArrowUp", {
        hasMultipleImages: false,
        nextObjectHref: null,
        previousObjectHref: null,
      }),
    ).toEqual({ kind: "none", preventDefault: true });
    expect(
      getObjectDetailOverlayKeyAction("a", {
        hasMultipleImages: false,
        nextObjectHref: null,
        previousObjectHref: null,
      }),
    ).toBeNull();
  });
});
