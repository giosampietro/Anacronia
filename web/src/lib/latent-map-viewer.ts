export type LatentMapNeighbor = {
  image_id: string;
  rank?: number;
  score: number;
};

export type LatentMapPoint = {
  image_id: string;
  x: number;
  y: number;
  cluster_id: number;
  cluster_group_key?: string;
  cluster_membership?: number | null;
  thumbnail_path: string;
  preview_path?: string;
  source_path?: string;
  relative_path: string;
  width: number;
  height: number;
  neighbors?: LatentMapNeighbor[];
  opposites?: LatentMapNeighbor[];
};

export type LatentMapViewerData = {
  schema_version: 1;
  analysis_result_id?: string;
  available_clusters?: LatentMapAvailableCluster[];
  available_layouts?: LatentMapAvailableLayout[];
  available_recipes?: LatentMapAvailableRecipe[];
  run_id: string;
  embedding_recipe: string;
  layout_id: string;
  cluster_id: string;
  cluster_result?: LatentMapAvailableCluster;
  source_folder: string;
  neighbor_lookup_path?: string;
  thumbnail_atlas?: LatentMapGeneratedThumbnailAtlas;
  thumbnail_atlases?: LatentMapGeneratedThumbnailAtlas[];
  points: LatentMapPoint[];
};

export type LatentMapAvailableLayout = {
  layout_id: string;
  method: string;
  params: Record<string, unknown>;
};

export type LatentMapAvailableRecipe = {
  family: string;
  label?: string;
  long_edge: number | null;
  model_id: string;
  recipe_name: string;
};

export type LatentMapAvailableCluster = {
  asset_kind?: string;
  cluster_count: number | null;
  cluster_id: string;
  groups?: LatentMapClusterGroup[];
  label?: string;
  method: string;
  params?: Record<string, unknown>;
  random_state: number | null;
  schema_version?: number;
  unassigned_count?: number | null;
};

export type LatentMapClusterGroup = {
  cluster_id: number;
  count: number;
  group_key: string;
  kind: "cluster" | "unassigned";
  label: string;
};

export type LatentMapFittedPoint = LatentMapPoint & {
  fitted_x: number;
  fitted_y: number;
};

export type LatentMapPointState =
  | "base"
  | "cluster"
  | "group"
  | "group-background"
  | "neighbor"
  | "opposite"
  | "selected";

export type LatentMapRuntimeTweenOverrides = {
  tween_alpha?: number;
  tween_size?: number;
  tween_state?: number;
  tween_screen_base_offset_x?: number;
  tween_screen_base_offset_y?: number;
  tween_screen_base_zoom?: number;
  tween_screen_cell_gap?: number;
  tween_screen_cell_size?: number;
  tween_screen_column?: number;
  tween_screen_grid_x?: number;
  tween_screen_grid_y?: number;
  tween_screen_height?: number;
  tween_screen_kind?: "anchor" | "grid";
  tween_screen_max_long_side?: number;
  tween_screen_packed_left?: number;
  tween_screen_packed_top?: number;
  tween_screen_row?: number;
  tween_screen_width?: number;
  tween_screen_x?: number;
  tween_screen_y?: number;
  tween_x?: number;
  tween_y?: number;
  tween_z?: number;
};

export type LatentMapRenderablePoint = LatentMapFittedPoint & {
  color: [number, number, number];
  point_state: LatentMapPointState;
} & LatentMapRuntimeTweenOverrides;

export type LatentMapRenderMode = "points" | "thumbnails";

export type LatentMapFaissNeighborCount = 3 | 5 | 10 | 20 | 50;
export type LatentMapFaissRelationMode = "closest" | "opposite" | "both";
export type LatentMapThumbnailSize = 32 | 64 | 96;
export type LatentMapTextureDetail = "auto" | number;
export type LatentMapCycleDirection = "next" | "previous";

export type LatentMapGeneratedThumbnailAtlas = {
  schema_version: 1;
  asset_kind: "latent-map-thumbnail-atlas";
  run_id: string;
  tile_size: number;
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
  content_rect?: [number, number, number, number];
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
  atlasPageBudget: number | null;
  atlasPageCacheActive: boolean;
  atlasPages: LatentMapThumbnailAtlasPage[];
  capped: boolean;
  displayThumbnailSize: LatentMapThumbnailSize;
  estimatedAtlasTextureBytes: number;
  fallbackAtlasPages: LatentMapThumbnailAtlasPage[];
  fallbackResolvedTextureDetail: number | null;
  hoverPreviewSize: number;
  maxThumbnails: number;
  resolvedTextureDetail: number;
  strategy: "all-atlas" | "capped-sprites" | "generated-atlas";
  textureDetail: LatentMapTextureDetail;
  thumbnailSize: LatentMapThumbnailSize;
  thumbnailPoints: LatentMapRenderablePoint[];
  textureSources: string[];
  totalAtlasPageCount: number;
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

type LatentMapWorldBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

type LatentMapPointCenter = {
  x: number;
  y: number;
};

export type LatentMapThumbnailAtlasPage = {
  atlasSize: number;
  bounds?: LatentMapWorldBounds;
  center?: LatentMapPointCenter;
  columns: number;
  index: number;
  items: LatentMapThumbnailAtlasItem[];
  renderLayer?: "fallback" | "primary";
  rows: number;
  tileSize: number;
  texturePath?: string;
};

export type LatentMapThumbnailViewport = {
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
  zoom: number;
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

export type LatentMapRuntimePerformanceInfo = {
  averageFrameMs: number;
  averageRenderMs: number;
  estimatedFps: number;
  lastRenderMs: number;
};

export type LatentMapRuntimeSnapshot = {
  averageFrameMs: number;
  averageRenderMs: number;
  atlasPageCount: number;
  drawCalls: number;
  estimatedFps: number;
  geometryCount: number;
  lastRenderMs: number;
  liveTextureCount: number;
  loadedThumbnailCount: number;
  neighborhoodPreviewFailedTextureCount: number;
  neighborhoodPreviewLoadingTextureCount: number;
  neighborhoodPreviewRequestedTextureCount: number;
  neighborhoodPreviewTextureBudget: number;
  neighborhoodPreviewTextureBytes: number;
  neighborhoodPreviewTextureCount: number;
  pointCount: number;
  rendererPointCount: number;
  rendererTriangleCount: number;
  renderMode: LatentMapRenderMode;
  thumbnailCount: number;
  thumbnailSize: LatentMapThumbnailSize;
};

export type LatentMapThumbnailRendererStats = {
  drawCalls: number;
  gpuTextures: number;
  materialCount: number;
  objectCount: number;
  sourceImageRequests: number;
};

export type LatentMapThumbnailRendererComparison = {
  instancedAtlas: LatentMapThumbnailRendererStats & {
    atlasPageCount: number;
    estimatedTextureBytes: number;
    instances: number;
  };
  recommendation:
    | "keep-capped-sprites-for-mvp"
    | "use-instanced-front-end-atlas"
    | "generate-atlas-pages-before-scaling"
    | "use-instanced-generated-atlas";
  spriteBaseline: LatentMapThumbnailRendererStats & {
    sprites: number;
  };
  thresholds: {
    generatedAtlasThumbnailCount: number;
    instancedThumbnailCount: number;
  };
};

export const DEFAULT_LATENT_MAP_THUMBNAIL_CAP = 420;
export const DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT: LatentMapFaissNeighborCount = 20;
export const DEFAULT_LATENT_MAP_FAISS_RELATION_MODE: LatentMapFaissRelationMode =
  "closest";
export const DEFAULT_LATENT_MAP_THUMBNAIL_SIZE: LatentMapThumbnailSize = 64;
export const DEFAULT_LATENT_MAP_TEXTURE_DETAIL: LatentMapTextureDetail = "auto";
export const DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE = 512;
export const LATENT_MAP_FAISS_NEIGHBOR_COUNT_OPTIONS = [
  3,
  5,
  10,
  20,
  50,
] as const;
export const LATENT_MAP_FAISS_RELATION_MODE_OPTIONS = [
  "closest",
  "opposite",
  "both",
] as const;
export const LATENT_MAP_THUMBNAIL_SIZE_OPTIONS = [32, 64, 96] as const;
export const LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL = 0.13 / 64;
export const LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE = 2;
export const LATENT_MAP_HIGH_DETAIL_PAGE_CACHE_MIN_DETAIL = 128;
export const LATENT_MAP_HIGH_DETAIL_PAGE_BUDGET = 6;
export const LATENT_MAP_FALLBACK_ATLAS_PAGE_BUDGET = 4;
export const LATENT_MAP_DEFAULT_POINT_SIZE = 9;
export const LATENT_MAP_FOCUS_BACKGROUND_POINT_SIZE = 3;
export const LATENT_MAP_INSTANCED_THUMBNAIL_THRESHOLD =
  DEFAULT_LATENT_MAP_THUMBNAIL_CAP;
export const LATENT_MAP_GENERATED_ATLAS_THUMBNAIL_THRESHOLD = 1_000;

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
const GROUP_BACKGROUND_POINT_COLOR: [number, number, number] = [190, 45, 112];
const SELECTED_POINT_COLOR: [number, number, number] = [250, 250, 246];
const NEIGHBOR_POINT_COLOR: [number, number, number] = [255, 167, 72];
const OPPOSITE_POINT_COLOR: [number, number, number] = [95, 190, 255];

export function getLatentMapClusterColor(
  clusterId: number,
): [number, number, number] {
  return CLUSTER_COLORS[Math.abs(clusterId) % CLUSTER_COLORS.length];
}

export function getLatentMapPointGroupKey(point: LatentMapPoint): string {
  return point.cluster_group_key ?? String(point.cluster_id);
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

export function getLatentMapGeneratedThumbnailAtlases(
  data: LatentMapViewerData,
): LatentMapGeneratedThumbnailAtlas[] {
  const atlases = [
    ...(data.thumbnail_atlases ?? []),
    ...(data.thumbnail_atlas ? [data.thumbnail_atlas] : []),
  ].filter((atlas) => Number.isFinite(atlas.tile_size) && atlas.tile_size > 0);
  const atlasByTileSize = new Map<number, LatentMapGeneratedThumbnailAtlas>();

  atlases.forEach((atlas) => {
    if (!atlasByTileSize.has(atlas.tile_size)) {
      atlasByTileSize.set(atlas.tile_size, atlas);
    }
  });

  return [...atlasByTileSize.values()].sort(
    (left, right) => left.tile_size - right.tile_size,
  );
}

export function getLatentMapAvailableTextureDetails(
  data: LatentMapViewerData,
): number[] {
  return getLatentMapGeneratedThumbnailAtlases(data).map(
    (atlas) => atlas.tile_size,
  );
}

export function getLatentMapThumbnailStateScaleMultiplier(
  pointState: LatentMapPointState,
) {
  void pointState;

  return 1;
}

export function getLatentMapThumbnailScreenLongSide({
  thumbnailSize,
  viewportHeight,
  zoom,
  scaleMultiplier = 1,
}: {
  thumbnailSize: LatentMapThumbnailSize;
  viewportHeight: number;
  zoom: number;
  scaleMultiplier?: number;
}) {
  const safeViewportHeight = Math.max(viewportHeight, 1);
  const safeZoom = Math.max(zoom, 0.001);
  const safeScaleMultiplier = Math.max(scaleMultiplier, 1);
  const worldLongSide =
    thumbnailSize *
    LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL *
    safeScaleMultiplier;
  const screenLongSide = worldLongSide * ((safeViewportHeight * safeZoom) / 2);
  const maxScreenLongSide =
    thumbnailSize *
    LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE *
    safeScaleMultiplier;

  return Math.min(screenLongSide, maxScreenLongSide);
}

function getNearestLatentMapTextureDetail({
  availableDetails,
  targetDetail,
}: {
  availableDetails: number[];
  targetDetail: number;
}): number | null {
  if (availableDetails.length === 0) {
    return null;
  }

  return availableDetails.reduce((best, detail) => {
    const bestDelta = Math.abs(best - targetDetail);
    const detailDelta = Math.abs(detail - targetDetail);

    if (detailDelta < bestDelta) {
      return detail;
    }

    if (detailDelta === bestDelta && detail > best) {
      return detail;
    }

    return best;
  });
}

function getSortedTextureDetails(availableDetails: number[]) {
  return [...new Set(availableDetails)]
    .filter((detail) => Number.isFinite(detail) && detail > 0)
    .sort((left, right) => left - right);
}

function cycleLatentMapOption<T>({
  currentValue,
  direction,
  options,
}: {
  currentValue: T;
  direction: LatentMapCycleDirection;
  options: readonly T[];
}) {
  if (options.length === 0) {
    return currentValue;
  }

  const currentIndex = options.findIndex((option) => option === currentValue);
  const fallbackIndex = direction === "next" ? -1 : 0;
  const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
  const offset = direction === "next" ? 1 : -1;
  const nextIndex = (baseIndex + offset + options.length) % options.length;

  return options[nextIndex] ?? currentValue;
}

export function getNextLatentMapThumbnailSize({
  currentSize,
  direction,
  options = LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
}: {
  currentSize: LatentMapThumbnailSize;
  direction: LatentMapCycleDirection;
  options?: readonly LatentMapThumbnailSize[];
}): LatentMapThumbnailSize {
  return cycleLatentMapOption({
    currentValue: currentSize,
    direction,
    options,
  });
}

export function getNextLatentMapTextureDetail({
  availableDetails,
  currentDetail,
  direction,
}: {
  availableDetails: number[];
  currentDetail: LatentMapTextureDetail;
  direction: LatentMapCycleDirection;
}): LatentMapTextureDetail {
  return cycleLatentMapOption({
    currentValue: currentDetail,
    direction,
    options: ["auto", ...getSortedTextureDetails(availableDetails)],
  });
}

function getNearestTextureDetailIndex({
  availableDetails,
  targetDetail,
}: {
  availableDetails: number[];
  targetDetail: number;
}) {
  if (availableDetails.length === 0) {
    return -1;
  }

  return availableDetails.reduce((bestIndex, detail, index) => {
    const best = availableDetails[bestIndex];
    const bestDelta = Math.abs(best - targetDetail);
    const detailDelta = Math.abs(detail - targetDetail);

    if (detailDelta < bestDelta) {
      return index;
    }

    if (detailDelta === bestDelta && detail > best) {
      return index;
    }

    return bestIndex;
  }, 0);
}

export function selectLatentMapTextureDetail({
  availableDetails,
  displayThumbnailScreenLongSide,
  previousResolvedDetail,
}: {
  availableDetails: number[];
  displayThumbnailScreenLongSide: number;
  previousResolvedDetail?: number | null;
}): number | null {
  const details = getSortedTextureDetails(availableDetails);

  if (details.length === 0) {
    return null;
  }

  const targetDetail = Number.isFinite(displayThumbnailScreenLongSide)
    ? Math.max(displayThumbnailScreenLongSide, 1)
    : details[0];
  const targetIndex = getNearestTextureDetailIndex({
    availableDetails: details,
    targetDetail,
  });
  const previousIndex =
    previousResolvedDetail === null || previousResolvedDetail === undefined
      ? -1
      : details.indexOf(previousResolvedDetail);

  if (targetIndex < 0) {
    return null;
  }

  if (previousIndex >= 0 && targetIndex !== previousIndex) {
    if (targetIndex > previousIndex) {
      const nextDetail = details[previousIndex + 1];

      if (nextDetail !== undefined) {
        const currentDetail = details[previousIndex];
        const gap = nextDetail - currentDetail;
        const switchUpAt = (currentDetail + nextDetail) / 2 + gap * 0.125;

        if (targetDetail < switchUpAt) {
          return currentDetail;
        }
      }
    } else {
      const previousLowerDetail = details[previousIndex - 1];

      if (previousLowerDetail !== undefined) {
        const currentDetail = details[previousIndex];
        const gap = currentDetail - previousLowerDetail;
        const switchDownAt =
          (previousLowerDetail + currentDetail) / 2 - gap * 0.125;

        if (targetDetail > switchDownAt) {
          return currentDetail;
        }
      }
    }
  }

  return details[targetIndex];
}

export function resolveLatentMapTextureDetail({
  displayThumbnailScreenLongSide,
  data,
  previousResolvedDetail,
  textureDetail = DEFAULT_LATENT_MAP_TEXTURE_DETAIL,
  thumbnailSize = DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
}: {
  displayThumbnailScreenLongSide?: number;
  data: LatentMapViewerData;
  previousResolvedDetail?: number | null;
  textureDetail?: LatentMapTextureDetail;
  thumbnailSize?: LatentMapThumbnailSize;
}): number {
  const availableDetails = getLatentMapAvailableTextureDetails(data);

  if (typeof textureDetail === "number" && availableDetails.includes(textureDetail)) {
    return textureDetail;
  }

  if (
    textureDetail === "auto" &&
    displayThumbnailScreenLongSide !== undefined
  ) {
    return (
      selectLatentMapTextureDetail({
        availableDetails,
        displayThumbnailScreenLongSide,
        previousResolvedDetail,
      }) ?? thumbnailSize
    );
  }

  return (
    getNearestLatentMapTextureDetail({
      availableDetails,
      targetDetail:
        typeof textureDetail === "number" ? textureDetail : thumbnailSize,
    }) ?? thumbnailSize
  );
}

export function getLatentMapThumbnailAtlasForSize(
  data: LatentMapViewerData,
  thumbnailSize: number,
): LatentMapGeneratedThumbnailAtlas | undefined {
  return getLatentMapGeneratedThumbnailAtlases(data).find(
    (atlas) => atlas.tile_size === thumbnailSize,
  );
}

export function getLatentMapFallbackThumbnailAtlas({
  data,
  maxPageCount = LATENT_MAP_FALLBACK_ATLAS_PAGE_BUDGET,
  resolvedTextureDetail,
}: {
  data: LatentMapViewerData;
  maxPageCount?: number;
  resolvedTextureDetail: number;
}): LatentMapGeneratedThumbnailAtlas | undefined {
  const lowerDetailAtlases = getLatentMapGeneratedThumbnailAtlases(data).filter(
    (atlas) => atlas.tile_size < resolvedTextureDetail,
  );
  const budgetedAtlases = lowerDetailAtlases.filter(
    (atlas) => atlas.page_count <= maxPageCount,
  );

  return budgetedAtlases.at(-1) ?? lowerDetailAtlases[0];
}

export function shouldUseLatentMapAutoFallbackAtlas({
  availableDetails,
  resolvedTextureDetail,
  textureDetail,
}: {
  availableDetails: number[];
  resolvedTextureDetail: number;
  textureDetail: LatentMapTextureDetail;
}): boolean {
  if (textureDetail !== "auto" || availableDetails.length === 0) {
    return false;
  }

  const maxAvailableDetail = Math.max(...availableDetails);

  return resolvedTextureDetail < maxAvailableDetail;
}

export function getLatentMapRenderableAtlasPages(
  thumbnailPlan: LatentMapThumbnailRenderPlan,
) {
  return [
    ...thumbnailPlan.fallbackAtlasPages,
    ...thumbnailPlan.atlasPages,
  ];
}

export function createLatentMapNeighborSet(
  data: LatentMapViewerData,
  selectedImageId: string | null,
  loadedNeighborsByImageId: Record<string, LatentMapNeighbor[]> = {},
  neighborCount: number = DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT,
): Set<string> {
  if (!selectedImageId) {
    return new Set();
  }

  const safeNeighborCount = Math.max(0, Math.floor(neighborCount));

  if (Object.hasOwn(loadedNeighborsByImageId, selectedImageId)) {
    return new Set(
      loadedNeighborsByImageId[selectedImageId].slice(0, safeNeighborCount).map(
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
    (selectedPoint.neighbors ?? [])
      .slice(0, safeNeighborCount)
      .map((neighbor) => neighbor.image_id),
  );
}

export function createLatentMapOppositeSet(
  data: LatentMapViewerData,
  selectedImageId: string | null,
  loadedOppositesByImageId: Record<string, LatentMapNeighbor[]> = {},
  neighborCount: number = DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT,
): Set<string> {
  if (!selectedImageId) {
    return new Set();
  }

  const safeNeighborCount = Math.max(0, Math.floor(neighborCount));

  if (Object.hasOwn(loadedOppositesByImageId, selectedImageId)) {
    return new Set(
      loadedOppositesByImageId[selectedImageId].slice(0, safeNeighborCount).map(
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
    (selectedPoint.opposites ?? [])
      .slice(0, safeNeighborCount)
      .map((neighbor) => neighbor.image_id),
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
  clusterFilter = "all",
  data,
  faissNeighborCount = DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT,
  faissRelationMode = DEFAULT_LATENT_MAP_FAISS_RELATION_MODE,
  neighborsByImageId,
  oppositesByImageId,
  selectedImageId,
}: {
  clusterColorsEnabled: boolean;
  clusterFilter?: string;
  data: LatentMapViewerData;
  faissNeighborCount?: number;
  faissRelationMode?: LatentMapFaissRelationMode;
  neighborsByImageId?: Record<string, LatentMapNeighbor[]>;
  oppositesByImageId?: Record<string, LatentMapNeighbor[]>;
  selectedImageId: string | null;
}): LatentMapRenderablePoint[] {
  const neighborIds =
    faissRelationMode === "opposite"
      ? new Set<string>()
      : createLatentMapNeighborSet(
          data,
          selectedImageId,
          neighborsByImageId,
          faissNeighborCount,
        );
  const oppositeIds =
    faissRelationMode === "closest"
      ? new Set<string>()
      : createLatentMapOppositeSet(
          data,
          selectedImageId,
          oppositesByImageId,
          faissNeighborCount,
        );
  const hasGroupFocus = clusterFilter !== "all";

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

    if (oppositeIds.has(point.image_id)) {
      return {
        ...point,
        color: OPPOSITE_POINT_COLOR,
        point_state: "opposite",
      };
    }

    if (hasGroupFocus) {
      if (getLatentMapPointGroupKey(point) === clusterFilter) {
        return {
          ...point,
          color: clusterColorsEnabled
            ? getLatentMapClusterColor(point.cluster_id)
            : BASE_POINT_COLOR,
          point_state: "group",
        };
      }

      return {
        ...point,
        color: GROUP_BACKGROUND_POINT_COLOR,
        point_state: "group-background",
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
  return points.some((point) => isFocusThumbnail(point));
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
    points: points
      .filter((point) => !isFocusThumbnail(point))
      .map((point) =>
        point.point_state === "group-background"
          ? point
          : {
              ...point,
              color: BASE_POINT_COLOR,
              point_state: "base",
            },
      ),
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
  if (point.point_state === "opposite") {
    return 2;
  }
  if (point.point_state === "group") {
    return 3;
  }

  return 4;
}

function getFocusThumbnailPoints(
  points: LatentMapRenderablePoint[],
): LatentMapRenderablePoint[] {
  return points
    .filter(isFocusThumbnail)
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

function isFocusThumbnail(point: LatentMapRenderablePoint) {
  return (
    point.point_state === "selected" ||
    point.point_state === "neighbor" ||
    point.point_state === "opposite" ||
    point.point_state === "group"
  );
}

function getViewportWorldBounds({
  thumbnailSize,
  viewport,
}: {
  thumbnailSize: LatentMapThumbnailSize;
  viewport: LatentMapThumbnailViewport;
}): LatentMapWorldBounds {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const zoom = Math.max(viewport.zoom, 0.001);
  const aspect = width / height;
  const margin =
    thumbnailSize *
    LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL *
    LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE;

  return {
    maxX: viewport.offsetX + aspect / zoom + margin,
    maxY: viewport.offsetY + 1 / zoom + margin,
    minX: viewport.offsetX - aspect / zoom - margin,
    minY: viewport.offsetY - 1 / zoom - margin,
  };
}

function isPointInsideBounds(
  point: LatentMapRenderablePoint,
  bounds: LatentMapWorldBounds,
) {
  return (
    point.fitted_x >= bounds.minX &&
    point.fitted_x <= bounds.maxX &&
    point.fitted_y >= bounds.minY &&
    point.fitted_y <= bounds.maxY
  );
}

function doBoundsIntersect(
  left: LatentMapWorldBounds,
  right: LatentMapWorldBounds,
) {
  return (
    left.minX <= right.maxX &&
    left.maxX >= right.minX &&
    left.minY <= right.maxY &&
    left.maxY >= right.minY
  );
}

function getLatentMapAtlasPageCenter(
  items: LatentMapThumbnailAtlasItem[],
): LatentMapPointCenter {
  if (items.length === 0) {
    return { x: 0, y: 0 };
  }

  return items.reduce(
    (center, item) => ({
      x: center.x + item.point.fitted_x / items.length,
      y: center.y + item.point.fitted_y / items.length,
    }),
    { x: 0, y: 0 },
  );
}

function getLatentMapAtlasPageBounds(
  items: LatentMapThumbnailAtlasItem[],
): LatentMapWorldBounds | null {
  if (items.length === 0) {
    return null;
  }

  return items.reduce<LatentMapWorldBounds>(
    (bounds, item) => ({
      maxX: Math.max(bounds.maxX, item.point.fitted_x),
      maxY: Math.max(bounds.maxY, item.point.fitted_y),
      minX: Math.min(bounds.minX, item.point.fitted_x),
      minY: Math.min(bounds.minY, item.point.fitted_y),
    }),
    {
      maxX: -Infinity,
      maxY: -Infinity,
      minX: Infinity,
      minY: Infinity,
    },
  );
}

function createLatentMapAtlasPageSpatialSummary(
  items: LatentMapThumbnailAtlasItem[],
) {
  return {
    bounds: getLatentMapAtlasPageBounds(items) ?? undefined,
    center: getLatentMapAtlasPageCenter(items),
  };
}

export function selectLatentMapAtlasPagesForViewport({
  pageBudget = LATENT_MAP_HIGH_DETAIL_PAGE_BUDGET,
  pages,
  thumbnailSize,
  viewport,
}: {
  pageBudget?: number;
  pages: LatentMapThumbnailAtlasPage[];
  thumbnailSize: LatentMapThumbnailSize;
  viewport: LatentMapThumbnailViewport;
}): LatentMapThumbnailAtlasPage[] {
  if (pages.length === 0) {
    return [];
  }

  const bounds = getViewportWorldBounds({
    thumbnailSize,
    viewport,
  });
  const pageCandidates = pages.map((page) => {
    const pageBounds = page.bounds ?? getLatentMapAtlasPageBounds(page.items);
    const pageIntersectsViewport =
      pageBounds !== null && doBoundsIntersect(pageBounds, bounds);
    const visibleCount = pageIntersectsViewport
      ? page.items.reduce(
          (count, item) =>
            isPointInsideBounds(item.point, bounds) ? count + 1 : count,
          0,
        )
      : 0;
    const pinnedCount = page.items.reduce(
      (count, item) => isFocusThumbnail(item.point) ? count + 1 : count,
      0,
    );
    const pageCenter = page.center ?? getLatentMapAtlasPageCenter(page.items);

    return {
      distanceFromViewCenter: Math.hypot(
        pageCenter.x - viewport.offsetX,
        pageCenter.y - viewport.offsetY,
      ),
      page,
      pinnedCount,
      visibleCount,
    };
  });
  const pinnedCandidates = pageCandidates.filter(
    (candidate) => candidate.pinnedCount > 0,
  );
  const pinnedIndexes = new Set(
    pinnedCandidates.map((candidate) => candidate.page.index),
  );
  const visibleCandidates = pageCandidates
    .filter(
      (candidate) =>
        candidate.visibleCount > 0 && !pinnedIndexes.has(candidate.page.index),
    )
    .sort((left, right) => {
      const visibleDelta = right.visibleCount - left.visibleCount;

      if (visibleDelta !== 0) {
        return visibleDelta;
      }

      const distanceDelta =
        left.distanceFromViewCenter - right.distanceFromViewCenter;

      if (distanceDelta !== 0) {
        return distanceDelta;
      }

      return left.page.index - right.page.index;
    });
  const allowedVisibleCount = Math.max(
    0,
    pageBudget - pinnedCandidates.length,
  );
  const selectedPages = [
    ...pinnedCandidates,
    ...visibleCandidates.slice(0, allowedVisibleCount),
  ];

  if (selectedPages.length === 0) {
    return [];
  }

  return selectedPages
    .map((candidate) => candidate.page)
    .sort((left, right) => left.index - right.index);
}

export function createLatentMapThumbnailRenderPlan({
  atlasSize = 2048,
  atlasPageBudget = LATENT_MAP_HIGH_DETAIL_PAGE_BUDGET,
  fallbackThumbnailAtlas,
  hoverPreviewSize = DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  maxThumbnails = DEFAULT_LATENT_MAP_THUMBNAIL_CAP,
  points,
  strategy = "all-atlas",
  textureDetail = DEFAULT_LATENT_MAP_TEXTURE_DETAIL,
  thumbnailAtlas,
  thumbnailSize = DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
  viewport,
}: {
  atlasPageBudget?: number;
  atlasSize?: number;
  fallbackThumbnailAtlas?: LatentMapGeneratedThumbnailAtlas;
  hoverPreviewSize?: number;
  maxThumbnails?: number;
  points: LatentMapRenderablePoint[];
  strategy?: LatentMapThumbnailRenderPlan["strategy"];
  textureDetail?: LatentMapTextureDetail;
  thumbnailAtlas?: LatentMapGeneratedThumbnailAtlas;
  thumbnailSize?: LatentMapThumbnailSize;
  viewport?: LatentMapThumbnailViewport;
}): LatentMapThumbnailRenderPlan {
  const resolvedTextureDetail =
    thumbnailAtlas?.tile_size ??
    (typeof textureDetail === "number" ? textureDetail : thumbnailSize);
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
      atlasPageBudget,
      fallbackThumbnailAtlas,
      maxThumbnails,
      points: plannedPoints,
      resolvedTextureDetail,
      textureDetail,
      thumbnailAtlas,
      thumbnailSize,
      viewport,
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
    atlasPageBudget: null,
    atlasPageCacheActive: false,
    atlasPages,
    capped: plannedPoints.length > thumbnailPoints.length,
    displayThumbnailSize: thumbnailSize,
    estimatedAtlasTextureBytes: atlasPages.length * atlasSize * atlasSize * 4,
    fallbackAtlasPages: [],
    fallbackResolvedTextureDetail: null,
    hoverPreviewSize,
    maxThumbnails,
    resolvedTextureDetail,
    strategy,
    textureDetail,
    thumbnailSize,
    thumbnailPoints,
    textureSources: thumbnailPoints.map((point) => point.thumbnail_path),
    totalAtlasPageCount: atlasPages.length,
  };
}

export function createLatentMapRuntimeSnapshot({
  loadedThumbnailCount = 0,
  neighborhoodPreviewTextureInfo,
  performanceInfo,
  pointCount,
  renderMode,
  rendererInfo,
  thumbnailPlan,
}: {
  loadedThumbnailCount?: number;
  neighborhoodPreviewTextureInfo?: {
    budget?: number;
    cachedTextureCount?: number;
    estimatedTextureBytes?: number;
    failedTextureCount?: number;
    loadingTextureCount?: number;
    requestedTextureCount?: number;
  };
  performanceInfo?: LatentMapRuntimePerformanceInfo;
  pointCount: number;
  renderMode: LatentMapRenderMode;
  rendererInfo?: LatentMapRuntimeRendererInfo;
  thumbnailPlan: LatentMapThumbnailRenderPlan;
}): LatentMapRuntimeSnapshot {
  return {
    averageFrameMs: Number((performanceInfo?.averageFrameMs ?? 0).toFixed(2)),
    averageRenderMs: Number((performanceInfo?.averageRenderMs ?? 0).toFixed(2)),
    atlasPageCount:
      renderMode === "thumbnails"
        ? getLatentMapRenderableAtlasPages(thumbnailPlan).length
        : 0,
    drawCalls: rendererInfo?.render?.calls ?? 0,
    estimatedFps: Number((performanceInfo?.estimatedFps ?? 0).toFixed(1)),
    geometryCount: rendererInfo?.memory?.geometries ?? 0,
    lastRenderMs: Number((performanceInfo?.lastRenderMs ?? 0).toFixed(2)),
    liveTextureCount: rendererInfo?.memory?.textures ?? 0,
    loadedThumbnailCount,
    neighborhoodPreviewFailedTextureCount:
      neighborhoodPreviewTextureInfo?.failedTextureCount ?? 0,
    neighborhoodPreviewLoadingTextureCount:
      neighborhoodPreviewTextureInfo?.loadingTextureCount ?? 0,
    neighborhoodPreviewRequestedTextureCount:
      neighborhoodPreviewTextureInfo?.requestedTextureCount ?? 0,
    neighborhoodPreviewTextureBudget:
      neighborhoodPreviewTextureInfo?.budget ?? 0,
    neighborhoodPreviewTextureBytes:
      neighborhoodPreviewTextureInfo?.estimatedTextureBytes ?? 0,
    neighborhoodPreviewTextureCount:
      neighborhoodPreviewTextureInfo?.cachedTextureCount ?? 0,
    pointCount,
    rendererPointCount: rendererInfo?.render?.points ?? 0,
    rendererTriangleCount: rendererInfo?.render?.triangles ?? 0,
    renderMode,
    thumbnailCount:
      renderMode === "thumbnails" ? thumbnailPlan.thumbnailPoints.length : 0,
    thumbnailSize: thumbnailPlan.displayThumbnailSize,
  };
}

export function createLatentMapThumbnailRendererComparison(
  thumbnailPlan: LatentMapThumbnailRenderPlan,
): LatentMapThumbnailRendererComparison {
  const thumbnailCount = thumbnailPlan.thumbnailPoints.length;
  const renderableAtlasPages = getLatentMapRenderableAtlasPages(thumbnailPlan);
  const atlasPageCount = renderableAtlasPages.length;
  const atlasSourceRequests =
    thumbnailPlan.strategy === "generated-atlas"
      ? renderableAtlasPages.filter((page) => page.texturePath).length
      : thumbnailCount;
  let recommendation: LatentMapThumbnailRendererComparison["recommendation"] =
    "keep-capped-sprites-for-mvp";

  if (
    thumbnailPlan.strategy !== "generated-atlas" &&
    thumbnailCount >= LATENT_MAP_GENERATED_ATLAS_THUMBNAIL_THRESHOLD
  ) {
    recommendation = "generate-atlas-pages-before-scaling";
  } else if (thumbnailPlan.strategy === "generated-atlas") {
    recommendation = "use-instanced-generated-atlas";
  } else if (thumbnailCount >= LATENT_MAP_INSTANCED_THUMBNAIL_THRESHOLD) {
    recommendation = "use-instanced-front-end-atlas";
  }

  return {
    instancedAtlas: {
      atlasPageCount,
      drawCalls: atlasPageCount,
      estimatedTextureBytes: thumbnailPlan.estimatedAtlasTextureBytes,
      gpuTextures: atlasPageCount,
      instances: thumbnailCount,
      materialCount: atlasPageCount,
      objectCount: atlasPageCount,
      sourceImageRequests: atlasSourceRequests,
    },
    recommendation,
    spriteBaseline: {
      drawCalls: thumbnailCount,
      gpuTextures: thumbnailCount,
      materialCount: thumbnailCount,
      objectCount: thumbnailCount,
      sourceImageRequests: thumbnailCount,
      sprites: thumbnailCount,
    },
    thresholds: {
      generatedAtlasThumbnailCount:
        LATENT_MAP_GENERATED_ATLAS_THUMBNAIL_THRESHOLD,
      instancedThumbnailCount: LATENT_MAP_INSTANCED_THUMBNAIL_THRESHOLD,
    },
  };
}

function createGeneratedAtlasPagesForAtlas({
  pointById,
  points,
  thumbnailAtlas,
  renderLayer,
}: {
  pointById: Map<string, LatentMapRenderablePoint>;
  points: LatentMapRenderablePoint[];
  thumbnailAtlas: LatentMapGeneratedThumbnailAtlas;
  renderLayer: LatentMapThumbnailAtlasPage["renderLayer"];
}): LatentMapThumbnailAtlasPage[] {
  const pointIds = new Set(points.map((point) => point.image_id));
  const itemsByPageIndex = new Map<number, LatentMapThumbnailAtlasItem[]>();

  thumbnailAtlas.items.forEach((item) => {
    if (!pointIds.has(item.image_id)) {
      return;
    }

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

  return thumbnailAtlas.pages.map((page) => {
    const columns = Math.max(
      1,
      Math.floor(thumbnailAtlas.atlas_size / thumbnailAtlas.tile_size),
    );
    const items = itemsByPageIndex.get(page.index) ?? [];

    return {
      atlasSize: thumbnailAtlas.atlas_size,
      ...createLatentMapAtlasPageSpatialSummary(items),
      columns,
      index: page.index,
      items,
      renderLayer,
      rows: columns,
      texturePath: page.path,
      tileSize: thumbnailAtlas.tile_size,
    };
  });
}

function createGeneratedAtlasRenderPlan({
  atlasPageBudget,
  fallbackThumbnailAtlas,
  hoverPreviewSize,
  maxThumbnails,
  points,
  resolvedTextureDetail,
  textureDetail,
  thumbnailAtlas,
  thumbnailSize,
  viewport,
}: {
  atlasPageBudget: number;
  fallbackThumbnailAtlas?: LatentMapGeneratedThumbnailAtlas;
  hoverPreviewSize: number;
  maxThumbnails: number;
  points: LatentMapRenderablePoint[];
  resolvedTextureDetail: number;
  textureDetail: LatentMapTextureDetail;
  thumbnailAtlas: LatentMapGeneratedThumbnailAtlas;
  thumbnailSize: LatentMapThumbnailSize;
  viewport?: LatentMapThumbnailViewport;
}): LatentMapThumbnailRenderPlan {
  const pointById = new Map(points.map((point) => [point.image_id, point]));
  const allPrimaryAtlasPages = createGeneratedAtlasPagesForAtlas({
    pointById,
    points,
    renderLayer: "primary",
    thumbnailAtlas,
  });
  const shouldUsePageCache =
    textureDetail === "auto" &&
    resolvedTextureDetail >= LATENT_MAP_HIGH_DETAIL_PAGE_CACHE_MIN_DETAIL &&
    Boolean(fallbackThumbnailAtlas) &&
    Boolean(viewport && viewport.height > 0 && viewport.width > 0);
  const fallbackAtlasPages =
    shouldUsePageCache && fallbackThumbnailAtlas
      ? createGeneratedAtlasPagesForAtlas({
          pointById,
          points,
          renderLayer: "fallback",
          thumbnailAtlas: fallbackThumbnailAtlas,
        })
      : [];
  const atlasPages = shouldUsePageCache && viewport
    ? selectLatentMapAtlasPagesForViewport({
        pageBudget: atlasPageBudget,
        pages: allPrimaryAtlasPages,
        thumbnailSize,
        viewport,
      })
    : allPrimaryAtlasPages;
  const thumbnailPoints = thumbnailAtlas.items
    .map((item) => pointById.get(item.image_id))
    .filter((point): point is LatentMapRenderablePoint => Boolean(point));
  const renderableAtlasPages = [...fallbackAtlasPages, ...atlasPages];

  return {
    atlasPageBudget: shouldUsePageCache ? atlasPageBudget : null,
    atlasPageCacheActive: shouldUsePageCache,
    atlasPages,
    capped: false,
    displayThumbnailSize: thumbnailSize,
    estimatedAtlasTextureBytes:
      renderableAtlasPages.reduce(
        (totalBytes, page) =>
          totalBytes + page.atlasSize * page.atlasSize * 4,
        0,
      ),
    fallbackAtlasPages,
    fallbackResolvedTextureDetail:
      shouldUsePageCache && fallbackThumbnailAtlas
        ? fallbackThumbnailAtlas.tile_size
        : null,
    hoverPreviewSize,
    maxThumbnails,
    resolvedTextureDetail,
    strategy: "generated-atlas",
    textureDetail,
    thumbnailSize,
    thumbnailPoints,
    textureSources: renderableAtlasPages.map((page) => page.texturePath ?? ""),
    totalAtlasPageCount: allPrimaryAtlasPages.length,
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
    isFocusThumbnail,
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
  tileSize: number;
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
    const items = pagePoints.map((point, itemIndex) => {
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
        uvRect: [u0, v0, u1 - u0, v1 - v0] as [
          number,
          number,
          number,
          number,
        ],
      };
    });

    return {
      atlasSize,
      ...createLatentMapAtlasPageSpatialSummary(items),
      columns,
      index: pageIndex,
      items,
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
