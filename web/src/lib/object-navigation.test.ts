import { describe, expect, it } from "vitest";

import {
  createAdjacentItemHrefs,
  createAdjacentObjectHrefs,
} from "./object-navigation";

describe("createAdjacentObjectHrefs", () => {
  it("uses the current grid order for neighboring Museum Objects", () => {
    const hrefs = createAdjacentObjectHrefs({
      currentObjectId: 20,
      currentProvider: "met",
      items: [
        { object_id: 30, provider: "met" },
        { object_id: 20, provider: "met" },
        { object_id: 10, provider: "met" },
      ],
      createHref: (item) => `/?object_id=${item.object_id}`,
    });

    expect(hrefs).toEqual({
      nextObjectHref: "/?object_id=10",
      previousObjectHref: "/?object_id=30",
    });
  });

  it("skips sibling Image Assets that belong to the same Museum Object", () => {
    const hrefs = createAdjacentObjectHrefs({
      currentObjectId: 20,
      currentProvider: "met",
      items: [
        { image_asset_id: 1, object_id: 30, provider: "met" },
        { image_asset_id: 2, object_id: 20, provider: "met" },
        { image_asset_id: 3, object_id: 20, provider: "met" },
        { image_asset_id: 4, object_id: 10, provider: "met" },
      ],
      createHref: (item) => `/?image_asset_id=${item.image_asset_id}`,
      isCurrentItem: (item) => item.image_asset_id === 2,
    });

    expect(hrefs).toEqual({
      nextObjectHref: "/?image_asset_id=4",
      previousObjectHref: "/?image_asset_id=1",
    });
  });

  it("can follow the active Image Asset grid item-by-item", () => {
    const hrefs = createAdjacentItemHrefs({
      items: [
        { image_asset_id: 9, object_id: 40, provider: "met" },
        { image_asset_id: 8, object_id: 40, provider: "met" },
        { image_asset_id: 4, object_id: 20, provider: "met" },
      ],
      createHref: (item) => `/?image=${item.image_asset_id}`,
      isCurrentItem: (item) => item.image_asset_id === 8,
    });

    expect(hrefs).toEqual({
      nextObjectHref: "/?image=4",
      previousObjectHref: "/?image=9",
    });
  });
});
