import { describe, expect, it } from "vitest";

import {
  canStartNewCollectionSearch,
  deleteCreatedCollectionAfterFailedInitialCollect,
  isDuplicateCollectionName,
} from "./new-collection";

describe("new Collection form state", () => {
  it("enables Start search only after a title and at least one valid term exist", () => {
    expect(canStartNewCollectionSearch("", "snake")).toBe(false);
    expect(canStartNewCollectionSearch("Snake Study", " , \n ")).toBe(false);
    expect(canStartNewCollectionSearch("Snake Study", "snake, serpent")).toBe(true);
  });

  it("blocks starting a new Collection when the name already exists", () => {
    const existingCollections = [
      { displayName: "Snake Studies", slug: "snake-studies" },
      { displayName: "Hands", slug: "hands" },
    ];

    expect(isDuplicateCollectionName(" snake studies ", existingCollections)).toBe(true);
    expect(isDuplicateCollectionName("Snake Studies!", existingCollections)).toBe(true);
    expect(isDuplicateCollectionName("Textile Motifs", existingCollections)).toBe(false);
    expect(
      canStartNewCollectionSearch(
        "Snake Studies",
        "snake",
        existingCollections,
      ),
    ).toBe(false);
  });

  it("deletes a newly created Collection after its initial Provider Search fails", async () => {
    const requests: { input: string | URL | Request; init?: RequestInit }[] = [];

    await deleteCreatedCollectionAfterFailedInitialCollect({
      apiBaseUrl: "http://127.0.0.1:18670",
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(null, { status: 200 });
      },
      slug: "snake-studies",
    });

    expect(requests).toEqual([
      {
        input: "http://127.0.0.1:18670/search-sets/snake-studies",
        init: { method: "DELETE" },
      },
    ]);
  });
});
