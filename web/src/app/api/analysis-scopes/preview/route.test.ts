import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("analysis scope preview API proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies selected Collection slugs to the local Analysis Scope preview API", async () => {
    const fetchMock = vi.fn(async () => (
      Response.json({
        scope_preview: {
          collection_slugs: ["bread", "hands-mani"],
          counts: {
            active_images: 178,
            duplicates_collapsed: 4,
          },
          item_count: 178,
        },
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/analysis-scopes/preview", {
        body: JSON.stringify({
          collection_slugs: ["bread", "hands-mani", "bread"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/analysis-scopes/preview",
      {
        body: JSON.stringify({
          collection_slugs: ["bread", "hands-mani"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scope_preview: {
        item_count: 178,
      },
    });
  });
});
