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
  source_path?: string;
  relative_path: string;
  width: number;
  height: number;
  neighbors?: LatentMapNeighbor[];
};

export type LatentMapViewerData = {
  schema_version: 1;
  available_clusters?: LatentMapAvailableCluster[];
  available_layouts?: LatentMapAvailableLayout[];
  run_id: string;
  embedding_recipe: string;
  layout_id: string;
  cluster_id: string;
  source_folder: string;
  neighbor_lookup_path?: string;
  thumbnail_atlas?: LatentMapGeneratedThumbnailAtlas;
  points: LatentMapPoint[];
};

export type LatentMapAvailableLayout = {
  layout_id: string;
  method: string;
  params: Record<string, unknown>;
};

export type LatentMapAvailableCluster = {
  cluster_count: number | null;
  cluster_id: string;
  method: string;
  random_state: number | null;
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

export type LatentMapThumbnailSize = 32 | 64 | 96;

export type LatentMapGeneratedThumbnailAtlas = {
  schema_version: 1;
  asset_kind: "latent-map-thumbnail-atlas";
  run_id: string;
  tile_size: LatentMapThumbnailSize;
  atlas_size: number;
  image_count: number;
  page_count: number;
  pages: LatentMapGeneratedThumbnailAtlasPage[];
  items: LatentMapGeneratedThumbnailAtlasItem[];
};

export type LatentMapGeneratedThumbnailAtlasPage = {
  height: number;
  index: number;
  path: string;
  width: number;
};

export type LatentMapGeneratedThumbnailAtlasItem = {
  height: number;
  image_id: string;
  page_index: number;
  page_path: string;
  source_thumbnail_path: string;
  tile_rect: [number, number, number, number];
  uv_rect: [number, number, number, number];
  width: number;
};

export type LatentMapThumbnailRenderPlan = {
  atlasPages: LatentMapThumbnailAtlasPage[];
  capped: boolean;
  estimatedAtlasTextureBytes: number;
  hoverPreviewSize: number;
  maxThumbnails: number;
  strategy: "all-atlas" | "capped-sprites" | "generated-atlas";
  thumbnailSize: LatentMapThumbnailSize;
  thumbnailPoints: LatentMapRenderablePoint[];
  textureSources: string[];
};

export type LatentMapPointLayerPlan = {
  pointSize: number;
  points: LatentMapRenderablePoint[];
  visible: boolean;
};

export type LatentMapThumbnailAtlasItem = {
  column: number;
  point: LatentMapRenderablePoint;
  row: number;
  uvRect: [number, number, number, number];
};

export type LatentMapThumbnailAtlasPage = {
  atlasSize: number;
  columns: number;
  index: number;
  items: LatentMapThumbnailAtlasItem[];
  rows: number;
  tileSize: LatentMapThumbnailSize;
  texturePath?: string;
};

export type LatentMapRuntimeRendererInfo = {
  memory?: {
    geometries?: number;
    textures?: number;
  };
  render?: {
    calls?: number;
    points?: number;
    triangles?: number;
  };
};

export type LatentMapRuntimeSnapshot = {
  atlasPageCount: number;
  drawCalls: number;
  geometryCount: number;
  liveTextureCount: number;
  loadedThumbnailCount: number;
  pointCount: number;
  rendererPointCount: number;
  rendererTriangleCount: number;
  renderMode: LatentMapRenderMode;
  thumbnailCount: number;
  thumbnailSize: LatentMapThumbnailSize;
};

export const DEFAULT_LATENT_MAP_THUMBNAIL_CAP = 420;
export const DEFAULT_LATENT_MAP_THUMBNAIL_SIZE: LatentMapThumbnailSize = 64;
export const DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE = 256;
export const LATENT_MAP_THUMBNAIL_SIZE_OPTIONS = [32, 64, 96] as const;
export const LATENT_MAP_DEFAULT_POINT_SIZE = 9;
export const LATENT_MAP_FOCUS_BACKGROUND_POINT_SIZE = 3;

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
  loadedNeighborsByImageId: Record<string, LatentMapNeighbor[]> = {},
): Set<string> {
  if (!selectedImageId) {
    return new Set();
  }

  if (Object.hasOwn(loadedNeighborsByImageId, selectedImageId)) {
    return new Set(
      loadedNeighborsByImageId[selectedImageId].map(
        (neighbor) => neighbor.image_id,
      ),
    );
  }

  const selectedPoint = data.points.find(
    (point) => point.image_id === selectedImageId,
  );

  if (!selectedPoint) {
    return new Set();
  }

  return new Set(
    (selectedPoint.neighbors ?? []).map((neighbor) => neighbor.image_id),
  );
}

export function getNextLatentMapSelection({
  currentSelectedImageId,
  pickedImageId,
}: {
  currentSelectedImageId: string | null;
  pickedImageId: string | null;
}): string | null {
  if (!pickedImageId || pickedImageId === currentSelectedImageId) {
    return null;
  }

  return pickedImageId;
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
  neighborsByImageId,
  selectedImageId,
}: {
  clusterColorsEnabled: boolean;
  data: LatentMapViewerData;
  neighborsByImageId?: Record<string, LatentMapNeighbor[]>;
  selectedImageId: string | null;
}): LatentMapRenderablePoint[] {
  const neighborIds = createLatentMapNeighborSet(
    data,
    selectedImageId,
    neighborsByImageId,
  );

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

export function isLatentMapThumbnailFocusActive(
  points: LatentMapRenderablePoint[],
): boolean {
  return points.some((point) =>
    point.point_state === "selected" || point.point_state === "neighbor",
  );
}

export function createLatentMapPointLayerPlan({
  points,
  renderMode,
  thumbnailPlan,
}: {
  points: LatentMapRenderablePoint[];
  renderMode: LatentMapRenderMode;
  thumbnailPlan: LatentMapThumbnailRenderPlan;
}): LatentMapPointLayerPlan {
  if (renderMode === "points") {
    return {
      pointSize: LATENT_MAP_DEFAULT_POINT_SIZE,
      points,
      visible: true,
    };
  }

  if (!isLatentMapThumbnailFocusActive(thumbnailPlan.thumbnailPoints)) {
    return {
      pointSize: LATENT_MAP_FOCUS_BACKGROUND_POINT_SIZE,
      points: [],
      visible: false,
    };
  }

  return {
    pointSize: LATENT_MAP_FOCUS_BACKGROUND_POINT_SIZE,
    points: points.map((point) => ({
      ...point,
      color: BASE_POINT_COLOR,
      point_state: "base",
    })),
    visible: true,
  };
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

function getFocusThumbnailPoints(
  points: LatentMapRenderablePoint[],
): LatentMapRenderablePoint[] {
  return points
    .filter(
      (point) =>
        point.point_state === "selected" || point.point_state === "neighbor",
    )
    .sort((left, right) => {
      const priorityDelta =
        getThumbnailPriority(left) - getThumbnailPriority(right);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.image_id.localeCompare(right.image_id);
    });
}

function createSpatialThumbnailSample({
  maxPoints,
  points,
}: {
  maxPoints: number;
  points: LatentMapRenderablePoint[];
}): LatentMapRenderablePoint[] {
  if (maxPoints <= 0 || points.length === 0) {
    return [];
  }

  const minX = Math.min(...points.map((point) => point.fitted_x));
  const maxX = Math.max(...points.map((point) => point.fitted_x));
  const minY = Math.min(...points.map((point) => point.fitted_y));
  const maxY = Math.max(...points.map((point) => point.fitted_y));
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  const gridSize = Math.max(4, Math.ceil(Math.sqrt(maxPoints)));
  const cells = new Map<string, LatentMapRenderablePoint[]>();

  for (const point of points) {
    const cellX = Math.min(
      gridSize - 1,
      Math.max(0, Math.floor(((point.fitted_x - minX) / spanX) * gridSize)),
    );
    const cellY = Math.min(
      gridSize - 1,
      Math.max(0, Math.floor(((point.fitted_y - minY) / spanY) * gridSize)),
    );
    const key = `${cellY}:${cellX}`;

    cells.set(key, [...(cells.get(key) ?? []), point]);
  }

  const queues = [...cells.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, cellPoints]) =>
      cellPoints.sort((left, right) => left.image_id.localeCompare(right.image_id)),
    );
  const sampled: LatentMapRenderablePoint[] = [];

  while (sampled.length < maxPoints && queues.length > 0) {
    for (let index = 0; index < queues.length && sampled.length < maxPoints;) {
      const nextPoint = queues[index].shift();

      if (nextPoint) {
        sampled.push(nextPoint);
      }

      if (queues[index].length === 0) {
        queues.splice(index, 1);
      } else {
        index += 1;
      }
    }
  }

  return sampled;
}

export function createLatentMapThumbnailRenderPlan({
  atlasSize = 2048,
  hoverPreviewSize = DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  maxThumbnails = DEFAULT_LATENT_MAP_THUMBNAIL_CAP,
  points,
  strategy = "all-atlas",
  thumbnailAtlas,
  thumbnailSize = DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
}: {
  atlasSize?: number;
  hoverPreviewSize?: number;
  maxThumbnails?: number;
  points: LatentMapRenderablePoint[];
  strategy?: LatentMapThumbnailRenderPlan["strategy"];
  thumbnailAtlas?: LatentMapGeneratedThumbnailAtlas;
  thumbnailSize?: LatentMapThumbnailSize;
}): LatentMapThumbnailRenderPlan {
  const focusThumbnailPoints = getFocusThumbnailPoints(points);
  const plannedPoints =
    strategy === "all-atlas" && focusThumbnailPoints.length > 0
      ? focusThumbnailPoints
      : points;

  if (
    thumbnailAtlas &&
    strategy === "all-atlas"
  ) {
    return createGeneratedAtlasRenderPlan({
      hoverPreviewSize,
      maxThumbnails,
      points: plannedPoints,
      thumbnailAtlas,
      thumbnailSize,
    });
  }

  const sortedPoints = [...plannedPoints].sort((left, right) => {
    if (strategy === "all-atlas") {
      return left.image_id.localeCompare(right.image_id);
    }

    const priorityDelta =
      getThumbnailPriority(left) - getThumbnailPriority(right);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.image_id.localeCompare(right.image_id);
  });
  const thumbnailPoints =
    strategy === "all-atlas"
      ? sortedPoints
      : createCappedThumbnailPoints({
          maxThumbnails,
          sortedPoints,
        });
  const atlasPages = createLatentMapThumbnailAtlasPages({
    atlasSize,
    points: thumbnailPoints,
    tileSize: thumbnailSize,
  });

  return {
    atlasPages,
    capped: plannedPoints.length > thumbnailPoints.length,
    estimatedAtlasTextureBytes: atlasPages.length * atlasSize * atlasSize * 4,
    hoverPreviewSize,
    maxThumbnails,
    strategy,
    thumbnailSize,
    thumbnailPoints,
    textureSources: thumbnailPoints.map((point) => point.thumbnail_path),
  };
}

export function createLatentMapRuntimeSnapshot({
  loadedThumbnailCount = 0,
  pointCount,
  renderMode,
  rendererInfo,
  thumbnailPlan,
}: {
  loadedThumbnailCount?: number;
  pointCount: number;
  renderMode: LatentMapRenderMode;
  rendererInfo?: LatentMapRuntimeRendererInfo;
  thumbnailPlan: LatentMapThumbnailRenderPlan;
}): LatentMapRuntimeSnapshot {
  return {
    atlasPageCount:
      renderMode === "thumbnails" ? thumbnailPlan.atlasPages.length : 0,
    drawCalls: rendererInfo?.render?.calls ?? 0,
    geometryCount: rendererInfo?.memory?.geometries ?? 0,
    liveTextureCount: rendererInfo?.memory?.textures ?? 0,
    loadedThumbnailCount,
    pointCount,
    rendererPointCount: rendererInfo?.render?.points ?? 0,
    rendererTriangleCount: rendererInfo?.render?.triangles ?? 0,
    renderMode,
    thumbnailCount:
      renderMode === "thumbnails" ? thumbnailPlan.thumbnailPoints.length : 0,
    thumbnailSize: thumbnailPlan.thumbnailSize,
  };
}

function createGeneratedAtlasRenderPlan({
  hoverPreviewSize,
  maxThumbnails,
  points,
  thumbnailAtlas,
  thumbnailSize,
}: {
  hoverPreviewSize: number;
  maxThumbnails: number;
  points: LatentMapRenderablePoint[];
  thumbnailAtlas: LatentMapGeneratedThumbnailAtlas;
  thumbnailSize: LatentMapThumbnailSize;
}): LatentMapThumbnailRenderPlan {
  const pointById = new Map(points.map((point) => [point.image_id, point]));
  const itemsByPageIndex = new Map<number, LatentMapThumbnailAtlasItem[]>();

  thumbnailAtlas.items.forEach((item) => {
    const point = pointById.get(item.image_id);

    if (!point) {
      return;
    }

    const pageItems = itemsByPageIndex.get(item.page_index) ?? [];
    pageItems.push({
      column: Math.floor(item.tile_rect[0] / thumbnailAtlas.tile_size),
      point,
      row: Math.floor(item.tile_rect[1] / thumbnailAtlas.tile_size),
      uvRect: item.uv_rect,
    });
    itemsByPageIndex.set(item.page_index, pageItems);
  });

  const atlasPages = thumbnailAtlas.pages.map((page) => {
    const columns = Math.max(
      1,
      Math.floor(thumbnailAtlas.atlas_size / thumbnailAtlas.tile_size),
    );

    return {
      atlasSize: thumbnailAtlas.atlas_size,
      columns,
      index: page.index,
      items: itemsByPageIndex.get(page.index) ?? [],
      rows: columns,
      texturePath: page.path,
      tileSize: thumbnailAtlas.tile_size,
    };
  });
  const thumbnailPoints = thumbnailAtlas.items
    .map((item) => pointById.get(item.image_id))
    .filter((point): point is LatentMapRenderablePoint => Boolean(point));

  return {
    atlasPages,
    capped: false,
    estimatedAtlasTextureBytes:
      atlasPages.length * thumbnailAtlas.atlas_size * thumbnailAtlas.atlas_size * 4,
    hoverPreviewSize,
    maxThumbnails,
    strategy: "generated-atlas",
    thumbnailSize,
    thumbnailPoints,
    textureSources: atlasPages.map((page) => page.texturePath ?? ""),
  };
}

function createCappedThumbnailPoints({
  maxThumbnails,
  sortedPoints,
}: {
  maxThumbnails: number;
  sortedPoints: LatentMapRenderablePoint[];
}): LatentMapRenderablePoint[] {
  const requiredPoints = sortedPoints.filter(
    (point) => point.point_state === "selected" || point.point_state === "neighbor",
  );
  const requiredIds = new Set(requiredPoints.map((point) => point.image_id));
  const spatialPoints = createSpatialThumbnailSample({
    maxPoints: Math.max(0, maxThumbnails - requiredPoints.length),
    points: sortedPoints.filter((point) => !requiredIds.has(point.image_id)),
  });

  return [...requiredPoints, ...spatialPoints].slice(0, maxThumbnails);
}

export function createLatentMapThumbnailAtlasPages({
  atlasSize = 2048,
  points,
  tileSize,
}: {
  atlasSize?: number;
  points: LatentMapRenderablePoint[];
  tileSize: LatentMapThumbnailSize;
}): LatentMapThumbnailAtlasPage[] {
  if (points.length === 0) {
    return [];
  }

  const columns = Math.max(1, Math.floor(atlasSize / tileSize));
  const rows = columns;
  const pageCapacity = columns * rows;
  const pageCount = Math.ceil(points.length / pageCapacity);
  const pixelInset = 0.5 / atlasSize;

  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const pageStart = pageIndex * pageCapacity;
    const pagePoints = points.slice(pageStart, pageStart + pageCapacity);

    return {
      atlasSize,
      columns,
      index: pageIndex,
      items: pagePoints.map((point, itemIndex) => {
        const atlasIndex = pageStart + itemIndex;
        const pageItemIndex = atlasIndex % pageCapacity;
        const column = pageItemIndex % columns;
        const row = Math.floor(pageItemIndex / columns);
        const u0 = column * tileSize / atlasSize + pixelInset;
        const v0 = row * tileSize / atlasSize + pixelInset;
        const u1 = (column + 1) * tileSize / atlasSize - pixelInset;
        const v1 = (row + 1) * tileSize / atlasSize - pixelInset;

        return {
          column,
          point,
          row,
          uvRect: [u0, v0, u1 - u0, v1 - v0],
        };
      }),
      rows,
      tileSize,
    };
  });
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
