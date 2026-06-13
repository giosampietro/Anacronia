import type {
  LatentMapNeighborhoodPreviewItem,
  LatentMapNeighborhoodPreviewPlan,
} from "@/lib/latent-map-neighborhood-previews";

export type LatentMapPreviewTextureLike = {
  dispose: () => void;
};

export type LatentMapNeighborhoodPreviewTextureStatus =
  | "error"
  | "loading"
  | "ready";

export type LatentMapNeighborhoodPreviewTextureEntry<
  TTexture extends LatentMapPreviewTextureLike,
> = {
  estimatedTextureBytes: number;
  imageId: string;
  rank: number;
  source: string;
  sourceKind: LatentMapNeighborhoodPreviewItem["sourceKind"];
  status: LatentMapNeighborhoodPreviewTextureStatus;
  texture: TTexture | null;
};

export type LatentMapNeighborhoodPreviewTextureDiagnostics = {
  budget: number;
  cachedTextureCount: number;
  estimatedTextureBytes: number;
  failedTextureCount: number;
  loadingTextureCount: number;
  requestedTextureCount: number;
};

export type LatentMapNeighborhoodPreviewTextureCache<
  TTexture extends LatentMapPreviewTextureLike,
> = {
  dispose: () => void;
  getDiagnostics: () => LatentMapNeighborhoodPreviewTextureDiagnostics;
  getEntry: (
    imageId: string,
  ) => LatentMapNeighborhoodPreviewTextureEntry<TTexture> | null;
  reconcile: (plan: LatentMapNeighborhoodPreviewPlan) => void;
};

type PreviewTextureCacheEntry<TTexture extends LatentMapPreviewTextureLike> =
  LatentMapNeighborhoodPreviewTextureEntry<TTexture> & {
    loadToken: number;
  };

export function createLatentMapNeighborhoodPreviewTextureCache<
  TTexture extends LatentMapPreviewTextureLike,
>({
  loadTexture,
  maxEntries,
  onChange,
}: {
  loadTexture: (item: LatentMapNeighborhoodPreviewItem) => Promise<TTexture>;
  maxEntries: number;
  onChange?: () => void;
}): LatentMapNeighborhoodPreviewTextureCache<TTexture> {
  const entries = new Map<string, PreviewTextureCacheEntry<TTexture>>();
  let budget = Math.max(0, Math.floor(maxEntries));
  let isDisposed = false;
  let loadToken = 0;

  function disposeEntry(entry: PreviewTextureCacheEntry<TTexture>) {
    if (entry.texture) {
      entry.texture.dispose();
    }
    entry.texture = null;
  }

  function removeEntry(imageId: string) {
    const entry = entries.get(imageId);

    if (!entry) {
      return;
    }

    entries.delete(imageId);
    disposeEntry(entry);
    onChange?.();
  }

  function dispose() {
    isDisposed = true;
    entries.forEach((entry) => {
      disposeEntry(entry);
    });
    entries.clear();
    onChange?.();
  }

  function startLoad(
    item: LatentMapNeighborhoodPreviewItem,
    entry: PreviewTextureCacheEntry<TTexture>,
  ) {
    const currentToken = loadToken + 1;

    loadToken = currentToken;
    entry.loadToken = currentToken;
    entry.status = "loading";
    entry.texture = null;

    void loadTexture(item).then(
      (texture) => {
        const currentEntry = entries.get(item.imageId);

        if (
          isDisposed ||
          !currentEntry ||
          currentEntry.loadToken !== currentToken ||
          currentEntry.source !== item.source
        ) {
          texture.dispose();
          return;
        }

        currentEntry.texture = texture;
        currentEntry.status = "ready";
        onChange?.();
      },
      () => {
        const currentEntry = entries.get(item.imageId);

        if (
          isDisposed ||
          !currentEntry ||
          currentEntry.loadToken !== currentToken ||
          currentEntry.source !== item.source
        ) {
          return;
        }

        currentEntry.texture = null;
        currentEntry.status = "error";
        onChange?.();
      },
    );
  }

  function upsertEntry(item: LatentMapNeighborhoodPreviewItem) {
    const currentEntry = entries.get(item.imageId);

    if (currentEntry?.source === item.source) {
      currentEntry.estimatedTextureBytes = item.estimatedTextureBytes;
      currentEntry.rank = item.rank;
      currentEntry.sourceKind = item.sourceKind;
      return;
    }

    if (currentEntry) {
      removeEntry(item.imageId);
    }

    const entry: PreviewTextureCacheEntry<TTexture> = {
      estimatedTextureBytes: item.estimatedTextureBytes,
      imageId: item.imageId,
      loadToken: 0,
      rank: item.rank,
      source: item.source,
      sourceKind: item.sourceKind,
      status: "loading",
      texture: null,
    };

    entries.set(item.imageId, entry);
    onChange?.();
    startLoad(item, entry);
  }

  function reconcile(plan: LatentMapNeighborhoodPreviewPlan) {
    if (isDisposed) {
      return;
    }

    budget = Math.max(0, Math.floor(plan.budget));
    const nextItems = plan.items.slice(0, budget);
    const nextImageIds = new Set(nextItems.map((item) => item.imageId));

    [...entries.keys()].forEach((imageId) => {
      if (!nextImageIds.has(imageId)) {
        removeEntry(imageId);
      }
    });

    nextItems.forEach((item) => {
      upsertEntry(item);
    });
  }

  function getDiagnostics(): LatentMapNeighborhoodPreviewTextureDiagnostics {
    let cachedTextureCount = 0;
    let estimatedTextureBytes = 0;
    let failedTextureCount = 0;
    let loadingTextureCount = 0;

    entries.forEach((entry) => {
      if (entry.status === "ready" && entry.texture) {
        cachedTextureCount += 1;
        estimatedTextureBytes += entry.estimatedTextureBytes;
      } else if (entry.status === "loading") {
        loadingTextureCount += 1;
      } else if (entry.status === "error") {
        failedTextureCount += 1;
      }
    });

    return {
      budget,
      cachedTextureCount,
      estimatedTextureBytes,
      failedTextureCount,
      loadingTextureCount,
      requestedTextureCount: entries.size,
    };
  }

  function getEntry(imageId: string) {
    const entry = entries.get(imageId);

    if (!entry) {
      return null;
    }

    return {
      estimatedTextureBytes: entry.estimatedTextureBytes,
      imageId: entry.imageId,
      rank: entry.rank,
      source: entry.source,
      sourceKind: entry.sourceKind,
      status: entry.status,
      texture: entry.texture,
    };
  }

  return {
    dispose,
    getDiagnostics,
    getEntry,
    reconcile,
  };
}
