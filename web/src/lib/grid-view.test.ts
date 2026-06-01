import { describe, expect, it } from "vitest";

import {
  createGridStateHref,
  createGridViewMode,
  createObjectRouteKey,
  parseObjectRouteKey,
} from "./grid-view";

describe("grid view URL helpers", () => {
  it("uses workspace-specific default grid projections", () => {
    expect(createGridViewMode(undefined, "search-set")).toBe("objects");
    expect(createGridViewMode(undefined, "user-library")).toBe("images");
    expect(createGridViewMode("images", "search-set")).toBe("images");
    expect(createGridViewMode("objects", "user-library")).toBe("objects");
    expect(createGridViewMode("collections", "user-library")).toBe("images");
  });

  it("omits default view params and includes non-default view params", () => {
    expect(
      createGridStateHref({
        collectionFilterText: "",
        localQueryText: "",
        searchSetSlug: "snake-study",
        viewMode: "objects",
        workspaceMode: "search-set",
      }),
    ).toBe("/?search_set=snake-study");
    expect(
      createGridStateHref({
        collectionFilterText: "",
        localQueryText: "",
        searchSetSlug: "snake-study",
        viewMode: "images",
        workspaceMode: "search-set",
      }),
    ).toBe("/?search_set=snake-study&view=images");
    expect(
      createGridStateHref({
        filterText: "snake",
        viewMode: "images",
        workspaceMode: "user-library",
      }),
    ).toBe("/?mode=user-library&filter=snake");
    expect(
      createGridStateHref({
        filterText: "snake",
        viewMode: "objects",
        workspaceMode: "user-library",
      }),
    ).toBe("/?mode=user-library&view=objects&filter=snake");
  });

  it("keeps sidebar Collection filters separate from local result queries", () => {
    expect(
      createGridStateHref({
        collectionFilterText: "venice",
        localQueryText: "serpent",
        provider: "met",
        searchSetSlug: "snake-study",
        viewMode: "images",
        workspaceMode: "search-set",
      }),
    ).toBe(
      "/?search_set=snake-study&view=images&collection_filter=venice&q=serpent&provider=met",
    );
  });

  it("serializes exactly one detail selector", () => {
    expect(
      createGridStateHref({
        collectionFilterText: "",
        localQueryText: "",
        imageAssetId: 502,
        object: { objectId: 40, provider: "met" },
        searchSetSlug: "snake-study",
        viewMode: "images",
        workspaceMode: "search-set",
      }),
    ).toBe("/?search_set=snake-study&view=images&object=met%3A40");
    expect(createObjectRouteKey("met", 841279)).toBe("met:841279");
    expect(parseObjectRouteKey("met:841279")).toEqual({
      objectId: 841279,
      provider: "met",
    });
    expect(parseObjectRouteKey("met:not-a-number")).toBeNull();
  });
});
