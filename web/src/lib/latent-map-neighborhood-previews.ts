import type { LatentMapNeighborhoodLayout } from "@/lib/latent-map-neighborhood-layout";
import type { LatentMapPoint } from "@/lib/latent-map-viewer";

export const LATENT_MAP_NEIGHBORHOOD_PREVIEW_TEXTURE_SIZE = 1024;

export type LatentMapNeighborhoodPreviewItem = {
  estimatedTextureBytes: number;
  imageId: string;
  rank: number;
  source: string;
  sourceKind: "preview" | "thumbnail";
};

export type LatentMapNeighborhoodPreviewPlan = {
  budget: number;
  estimatedTextureBytes: number;
  items: LatentMapNeighborhoodPreviewItem[];
  textureSize: number;
};

export function createLatentMapNeighborhoodPreviewPlan({
  activeImageIds,
  budget,
  isActive,
  layout,
  points,
  textureSize = LATENT_MAP_NEIGHBORHOOD_PREVIEW_TEXTURE_SIZE,
}: {
  activeImageIds: Set<string>;
  budget?: number;
  isActive: boolean;
  layout: LatentMapNeighborhoodLayout;
  points: LatentMapPoint[];
  textureSize?: number;
}): LatentMapNeighborhoodPreviewPlan {
  const safeTextureSize = Math.max(1, Math.floor(textureSize));
  const estimatedTextureBytes = safeTextureSize * safeTextureSize * 4;

  if (!isActive || layout.status !== "ready") {
    return {
      budget: Math.max(0, Math.floor(budget ?? 0)),
      estimatedTextureBytes: 0,
      items: [],
      textureSize: safeTextureSize,
    };
  }

  const pointByImageId = new Map(
    points.map((point) => [point.image_id, point] as const),
  );
  const orderedImageIds = [
    layout.selectedImageId,
    ...layout.rows.map((row) => row.imageId),
  ];
  const safeBudget = Math.max(
    0,
    Math.floor(budget ?? orderedImageIds.length),
  );
  const items: LatentMapNeighborhoodPreviewItem[] = [];

  for (const imageId of orderedImageIds) {
    if (items.length >= safeBudget) {
      break;
    }

    if (!activeImageIds.has(imageId)) {
      continue;
    }

    const point = pointByImageId.get(imageId);

    if (!point) {
      continue;
    }

    const previewPath = point.preview_path?.trim() ?? "";
    const thumbnailPath = point.thumbnail_path.trim();
    const source = previewPath.length > 0 ? previewPath : thumbnailPath;

    if (source.length === 0) {
      continue;
    }

    items.push({
      estimatedTextureBytes,
      imageId,
      rank: items.length,
      source,
      sourceKind:
        previewPath.length > 0 && previewPath !== thumbnailPath
          ? "preview"
          : "thumbnail",
    });
  }

  return {
    budget: safeBudget,
    estimatedTextureBytes: items.length * estimatedTextureBytes,
    items,
    textureSize: safeTextureSize,
  };
}
