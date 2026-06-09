export type LatentMapNeighbor = {
  image_id: string;
  score: number;
};

export type LatentMapPoint = {
  image_id: string;
  x: number;
  y: number;
  cluster_id: number;
  thumbnail_path: string;
  source_path: string;
  relative_path: string;
  width: number;
  height: number;
  neighbors: LatentMapNeighbor[];
};

export type LatentMapViewerData = {
  schema_version: 1;
  run_id: string;
  embedding_recipe: string;
  layout_id: string;
  cluster_id: string;
  source_folder: string;
  points: LatentMapPoint[];
};

export type LatentMapFittedPoint = LatentMapPoint & {
  fitted_x: number;
  fitted_y: number;
};

export type LatentMapPointState =
  | "base"
  | "cluster"
  | "neighbor"
  | "selected";

export type LatentMapRenderablePoint = LatentMapFittedPoint & {
  color: [number, number, number];
  point_state: LatentMapPointState;
};

export type LatentMapRenderMode = "points" | "thumbnails";

export type LatentMapThumbnailRenderPlan = {
  capped: boolean;
  maxThumbnails: number;
  thumbnailPoints: LatentMapRenderablePoint[];
  textureSources: string[];
};

export const DEFAULT_LATENT_MAP_THUMBNAIL_CAP = 420;

const CLUSTER_COLORS: [number, number, number][] = [
  [239, 184, 72],
  [74, 185, 201],
  [144, 203, 119],
  [215, 94, 126],
  [154, 129, 222],
  [230, 124, 70],
  [103, 154, 226],
  [205, 200, 95],
];

const BASE_POINT_COLOR: [number, number, number] = [150, 156, 166];
const SELECTED_POINT_COLOR: [number, number, number] = [250, 250, 246];
const NEIGHBOR_POINT_COLOR: [number, number, number] = [255, 167, 72];

export function getLatentMapClusterColor(
  clusterId: number,
): [number, number, number] {
  return CLUSTER_COLORS[Math.abs(clusterId) % CLUSTER_COLORS.length];
}

export function createLatentMapStats(data: LatentMapViewerData): {
  clusterCount: number;
  pointCount: number;
} {
  return {
    clusterCount: new Set(data.points.map((point) => point.cluster_id)).size,
    pointCount: data.points.length,
  };
}

export function createLatentMapNeighborSet(
  data: LatentMapViewerData,
  selectedImageId: string | null,
): Set<string> {
  if (!selectedImageId) {
    return new Set();
  }

  const selectedPoint = data.points.find(
    (point) => point.image_id === selectedImageId,
  );

  if (!selectedPoint) {
    return new Set();
  }

  return new Set(selectedPoint.neighbors.map((neighbor) => neighbor.image_id));
}

export function fitLatentMapPoints(
  points: LatentMapPoint[],
): LatentMapFittedPoint[] {
  if (points.length === 0) {
    return [];
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = 1.7 / span;

  return points.map((point) => ({
    ...point,
    fitted_x: (point.x - centerX) * scale,
    fitted_y: (point.y - centerY) * scale,
  }));
}

export function createLatentMapRenderState({
  clusterColorsEnabled,
  data,
  selectedImageId,
}: {
  clusterColorsEnabled: boolean;
  data: LatentMapViewerData;
  selectedImageId: string | null;
}): LatentMapRenderablePoint[] {
  const neighborIds = createLatentMapNeighborSet(data, selectedImageId);

  return fitLatentMapPoints(data.points).map((point) => {
    if (point.image_id === selectedImageId) {
      return {
        ...point,
        color: SELECTED_POINT_COLOR,
        point_state: "selected",
      };
    }

    if (neighborIds.has(point.image_id)) {
      return {
        ...point,
        color: NEIGHBOR_POINT_COLOR,
        point_state: "neighbor",
      };
    }

    if (clusterColorsEnabled) {
      return {
        ...point,
        color: getLatentMapClusterColor(point.cluster_id),
        point_state: "cluster",
      };
    }

    return {
      ...point,
      color: BASE_POINT_COLOR,
      point_state: "base",
    };
  });
}

function getThumbnailPriority(point: LatentMapRenderablePoint): number {
  if (point.point_state === "selected") {
    return 0;
  }
  if (point.point_state === "neighbor") {
    return 1;
  }

  return 2;
}

export function createLatentMapThumbnailRenderPlan({
  maxThumbnails = DEFAULT_LATENT_MAP_THUMBNAIL_CAP,
  points,
}: {
  maxThumbnails?: number;
  points: LatentMapRenderablePoint[];
}): LatentMapThumbnailRenderPlan {
  const prioritizedPoints = [...points].sort((left, right) => {
    const priorityDelta = getThumbnailPriority(left) - getThumbnailPriority(right);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.image_id.localeCompare(right.image_id);
  });
  const thumbnailPoints = prioritizedPoints.slice(0, maxThumbnails);

  return {
    capped: points.length > thumbnailPoints.length,
    maxThumbnails,
    thumbnailPoints,
    textureSources: thumbnailPoints.map((point) => point.thumbnail_path),
  };
}

export function findNearestLatentMapPoint({
  maxDistance,
  points,
  x,
  y,
}: {
  maxDistance: number;
  points: LatentMapFittedPoint[];
  x: number;
  y: number;
}): LatentMapFittedPoint | null {
  let nearest: LatentMapFittedPoint | null = null;
  let nearestDistance = maxDistance;

  for (const point of points) {
    const distance = Math.hypot(point.fitted_x - x, point.fitted_y - y);

    if (distance <= nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearest;
}
