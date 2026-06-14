import type {
  LatentMapFittedPoint,
  LatentMapRenderMode,
  LatentMapThumbnailSize,
} from "@/lib/latent-map-viewer";

type IndexedPoint = {
  index: number;
  point: LatentMapFittedPoint;
};

export type LatentMapSpatialIndex = {
  findNearest: (query: LatentMapSpatialQuery) => LatentMapFittedPoint | null;
};

export type LatentMapSpatialQuery = {
  maxDistance: number;
  x: number;
  y: number;
};

function getCellKey({ cellSize, x, y }: { cellSize: number; x: number; y: number }) {
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
}

export function createLatentMapSpatialIndex(
  points: LatentMapFittedPoint[],
  { cellSize = 0.15 }: { cellSize?: number } = {},
): LatentMapSpatialIndex {
  const boundedCellSize = Math.max(cellSize, 0.0001);
  const cells = new Map<string, IndexedPoint[]>();

  points.forEach((point, index) => {
    const key = getCellKey({
      cellSize: boundedCellSize,
      x: point.fitted_x,
      y: point.fitted_y,
    });

    cells.set(key, [...(cells.get(key) ?? []), { index, point }]);
  });

  return {
    findNearest: ({ maxDistance, x, y }) => {
      if (maxDistance < 0) {
        return null;
      }

      const centerCellX = Math.floor(x / boundedCellSize);
      const centerCellY = Math.floor(y / boundedCellSize);
      const cellRadius = Math.ceil(maxDistance / boundedCellSize);
      let nearest: IndexedPoint | null = null;
      let nearestDistance = maxDistance;

      for (
        let cellY = centerCellY - cellRadius;
        cellY <= centerCellY + cellRadius;
        cellY += 1
      ) {
        for (
          let cellX = centerCellX - cellRadius;
          cellX <= centerCellX + cellRadius;
          cellX += 1
        ) {
          const candidates = cells.get(`${cellX}:${cellY}`) ?? [];

          for (const candidate of candidates) {
            const distance = Math.hypot(
              candidate.point.fitted_x - x,
              candidate.point.fitted_y - y,
            );

            if (
              distance < nearestDistance ||
              (distance === nearestDistance &&
                nearest !== null &&
                candidate.index < nearest.index)
            ) {
              nearest = candidate;
              nearestDistance = distance;
            }
          }
        }
      }

      return nearest?.point ?? null;
    },
  };
}

export function screenPixelsToLatentMapWorldRadius({
  screenPixels,
  viewportHeight,
  zoom,
}: {
  screenPixels: number;
  viewportHeight: number;
  zoom: number;
}): number {
  return Math.max(screenPixels, 0) * (2 / Math.max(viewportHeight, 1)) /
    Math.max(zoom, 0.001);
}

export function createLatentMapPointerHitRadius({
  renderMode,
  thumbnailSize,
  viewportHeight,
  zoom,
}: {
  renderMode: LatentMapRenderMode;
  thumbnailSize: LatentMapThumbnailSize;
  viewportHeight: number;
  zoom: number;
}): number {
  const hitRadiusPixels =
    renderMode === "thumbnails" ? Math.max(16, thumbnailSize * 0.55) : 12;

  return screenPixelsToLatentMapWorldRadius({
    screenPixels: hitRadiusPixels,
    viewportHeight,
    zoom,
  });
}
