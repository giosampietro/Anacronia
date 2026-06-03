import { afterEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";

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
});
