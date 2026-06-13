import { describe, expect, it, vi } from "vitest";

import {
  createLatentMapNeighborhoodPreviewTextureCache,
  type LatentMapPreviewTextureLike,
} from "@/lib/latent-map-neighborhood-preview-cache";
import type {
  LatentMapNeighborhoodPreviewItem,
  LatentMapNeighborhoodPreviewPlan,
} from "@/lib/latent-map-neighborhood-previews";

type TestTexture = LatentMapPreviewTextureLike & {
  id: string;
};

function createTexture(id: string): TestTexture {
  return {
    dispose: vi.fn(),
    id,
  };
}

function createItem(
  index: number,
  overrides: Partial<LatentMapNeighborhoodPreviewItem> = {},
): LatentMapNeighborhoodPreviewItem {
  return {
    estimatedTextureBytes: 4_194_304,
    imageId: `img_${index}`,
    rank: index,
    source: `preview_${index}.jpg`,
    sourceKind: "preview",
    ...overrides,
  };
}

function createPlan(
  items: LatentMapNeighborhoodPreviewItem[],
  overrides: Partial<LatentMapNeighborhoodPreviewPlan> = {},
): LatentMapNeighborhoodPreviewPlan {
  return {
    budget: items.length,
    estimatedTextureBytes: items.reduce(
      (total, item) => total + item.estimatedTextureBytes,
      0,
    ),
    items,
    textureSize: 1024,
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("latent map neighborhood preview texture cache", () => {
  it("loads planned preview textures lazily and reports ready diagnostics", async () => {
    const cache = createLatentMapNeighborhoodPreviewTextureCache({
      loadTexture: async (item) => createTexture(item.imageId),
      maxEntries: 4,
    });

    cache.reconcile(createPlan([createItem(0), createItem(1)]));
    await flushPromises();

    expect(cache.getEntry("img_0")).toMatchObject({
      source: "preview_0.jpg",
      status: "ready",
    });
    expect(cache.getDiagnostics()).toMatchObject({
      cachedTextureCount: 2,
      estimatedTextureBytes: 8_388_608,
      failedTextureCount: 0,
      loadingTextureCount: 0,
      requestedTextureCount: 2,
    });
  });

  it("tracks failed preview loads without removing the cache entry", async () => {
    const cache = createLatentMapNeighborhoodPreviewTextureCache<TestTexture>({
      loadTexture: async () => {
        throw new Error("missing preview");
      },
      maxEntries: 4,
    });

    cache.reconcile(createPlan([createItem(0)]));
    await flushPromises();

    expect(cache.getEntry("img_0")).toMatchObject({
      status: "error",
      texture: null,
    });
    expect(cache.getDiagnostics()).toMatchObject({
      cachedTextureCount: 0,
      failedTextureCount: 1,
      requestedTextureCount: 1,
    });
  });

  it("bounds entries by explicit limit", async () => {
    const cache = createLatentMapNeighborhoodPreviewTextureCache({
      loadTexture: async (item) => createTexture(item.imageId),
      maxEntries: 2,
    });

    cache.reconcile(createPlan([createItem(0), createItem(1), createItem(2)]));
    await flushPromises();

    expect(cache.getEntry("img_0")?.status).toBe("ready");
    expect(cache.getEntry("img_1")?.status).toBe("ready");
    expect(cache.getEntry("img_2")).toBeNull();
    expect(cache.getDiagnostics()).toMatchObject({
      budget: 2,
      cachedTextureCount: 2,
      requestedTextureCount: 2,
    });
  });

  it("disposes evicted ready textures", async () => {
    const texture = createTexture("img_0");
    const cache = createLatentMapNeighborhoodPreviewTextureCache({
      loadTexture: async () => texture,
      maxEntries: 1,
    });

    cache.reconcile(createPlan([createItem(0)]));
    await flushPromises();
    cache.reconcile(createPlan([createItem(1)]));

    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(cache.getEntry("img_0")).toBeNull();
  });

  it("disposes stale textures that finish loading after eviction", async () => {
    const deferred = createDeferred<TestTexture>();
    const staleTexture = createTexture("stale");
    const cache = createLatentMapNeighborhoodPreviewTextureCache({
      loadTexture: () => deferred.promise,
      maxEntries: 1,
    });

    cache.reconcile(createPlan([createItem(0)]));
    cache.reconcile(createPlan([]));
    deferred.resolve(staleTexture);
    await flushPromises();

    expect(staleTexture.dispose).toHaveBeenCalledTimes(1);
    expect(cache.getDiagnostics().requestedTextureCount).toBe(0);
  });

  it("disposes every ready texture when the cache is disposed", async () => {
    const textures = [createTexture("img_0"), createTexture("img_1")];
    const cache = createLatentMapNeighborhoodPreviewTextureCache({
      loadTexture: async (item) => textures[Number(item.imageId.at(-1))],
      maxEntries: 2,
    });

    cache.reconcile(createPlan([createItem(0), createItem(1)]));
    await flushPromises();
    cache.dispose();

    expect(textures[0].dispose).toHaveBeenCalledTimes(1);
    expect(textures[1].dispose).toHaveBeenCalledTimes(1);
    expect(cache.getDiagnostics()).toMatchObject({
      cachedTextureCount: 0,
      requestedTextureCount: 0,
    });
  });
});
