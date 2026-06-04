import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "./route";

describe("search set API proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies Collection rename requests to the local API", async () => {
    const fetchMock = vi.fn(async () => (
      new Response(
        JSON.stringify({
          display_name: "Intaglio Rings",
          slug: "snake-study",
          terms: [{ term: "snake", active: true }],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      )
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(
      new Request("http://localhost/api/search-sets/snake-study", {
        body: JSON.stringify({ display_name: "Intaglio Rings" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      { params: Promise.resolve({ slug: "snake-study" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/search-sets/snake-study",
      {
        body: JSON.stringify({ display_name: "Intaglio Rings" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      display_name: "Intaglio Rings",
      slug: "snake-study",
      terms: [{ term: "snake", active: true }],
    });
  });

  it("proxies Collection delete requests to the local API", async () => {
    const fetchMock = vi.fn(async () => (
      new Response(
        JSON.stringify({
          collection_slug: "snake-study",
          deleted: true,
          deleted_objects: 0,
          deleted_image_assets: 0,
          preserved_shared_objects: 0,
          preserved_shared_image_assets: 0,
          preserved_favorite_objects: 0,
          preserved_favorite_image_assets: 0,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      )
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await DELETE(
      new Request("http://localhost/api/search-sets/snake-study", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ slug: "snake-study" }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/search-sets/snake-study",
      {
        method: "DELETE",
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      collection_slug: "snake-study",
      deleted: true,
      deleted_objects: 0,
      deleted_image_assets: 0,
      preserved_shared_objects: 0,
      preserved_shared_image_assets: 0,
      preserved_favorite_objects: 0,
      preserved_favorite_image_assets: 0,
    });
  });
});
