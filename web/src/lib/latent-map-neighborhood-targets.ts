import {
  createLatentMapNeighborhoodLayout,
  type LatentMapNeighborhoodLayout,
  type LatentMapNeighborhoodReadyLayout,
  type LatentMapNeighborhoodTargetTransform,
} from "@/lib/latent-map-neighborhood-layout";
import {
  LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL,
  type LatentMapFaissRelationMode,
  type LatentMapNeighbor,
  type LatentMapRenderablePoint,
  type LatentMapThumbnailSize,
} from "@/lib/latent-map-viewer";
import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

export type LatentMapNeighborhoodRuntimePlan = {
  activeImageIds: Set<string>;
  layout: LatentMapNeighborhoodLayout;
  oppositeImageIds: Set<string>;
  points: LatentMapRenderablePoint[];
  recenterView: LatentMapViewState | null;
  status: "empty" | "ready";
};

export type LatentMapNeighborhoodRuntimePlanInput = {
  neighborCount: number;
  neighborsByImageId?: Record<string, LatentMapNeighbor[]>;
  oppositesByImageId?: Record<string, LatentMapNeighbor[]>;
  points: LatentMapRenderablePoint[];
  relationMode: LatentMapFaissRelationMode;
  selectedImageId: string | null;
  thumbnailSize: LatentMapThumbnailSize;
  viewport: {
    height: number;
    width: number;
  };
};

type ProjectedTarget = {
  screen: {
    baseOffsetX: number;
    baseOffsetY: number;
    baseZoom: number;
    cellGap?: number;
    cellSize?: number;
    column?: number;
    gridX?: number;
    gridY?: number;
    height: number;
    kind: "anchor" | "grid";
    row?: number;
    width: number;
    x: number;
    y: number;
  };
  sizeMultiplier: number;
  x: number;
  y: number;
  z: number;
};

const NEIGHBORHOOD_BACKGROUND_ALPHA = 0;
const NEIGHBORHOOD_BACKGROUND_SIZE = 0;
const NEIGHBORHOOD_RESTORE_SIZE = 1;
const NEIGHBORHOOD_RESTORE_ALPHA = 1;
const NEIGHBORHOOD_SELECTED_STATE = 2;
const NEIGHBORHOOD_RELATION_STATE = 1;
const NEIGHBORHOOD_OPPOSITE_STATE = 3;
const NEIGHBORHOOD_BACKGROUND_STATE = 0;
const NEIGHBORHOOD_SELECTED_Z = 0.42;
const NEIGHBORHOOD_RELATION_Z = 0.34;
const NEIGHBORHOOD_BACKGROUND_Z = -0.08;
const RECENTER_PADDING_MULTIPLIER = 1;

export function createLatentMapNeighborhoodRuntimePlan({
  neighborCount,
  neighborsByImageId = {},
  oppositesByImageId = {},
  points,
  relationMode,
  selectedImageId,
  thumbnailSize,
  viewport,
}: LatentMapNeighborhoodRuntimePlanInput): LatentMapNeighborhoodRuntimePlan {
  const layout = createLatentMapNeighborhoodLayout({
    neighborCount,
    neighborsByImageId,
    oppositesByImageId,
    points,
    relationMode,
    selectedImageId,
    viewport,
  });

  if (layout.status !== "ready") {
    return {
      activeImageIds: new Set(),
      layout,
      oppositeImageIds: new Set(),
      points: createLatentMapRestoredRuntimePoints(points),
      recenterView: null,
      status: "empty",
    };
  }

  const recenterView = createNeighborhoodRecenterView({
    layout,
    viewport,
  });
  const targetByImageId = createNeighborhoodTargetMap({
    layout,
    recenterView,
    thumbnailSize,
    viewport,
  });
  const activeImageIds = new Set(targetByImageId.keys());
  const oppositeImageIds = new Set(
    layout.rows
      .filter((row) => row.isOpposite)
      .map((row) => row.imageId),
  );

  return {
    activeImageIds,
    layout,
    oppositeImageIds,
    points: points.map((point) => {
      const target = targetByImageId.get(point.image_id);

      if (!target) {
        return {
          ...point,
          tween_alpha: NEIGHBORHOOD_BACKGROUND_ALPHA,
          tween_size: NEIGHBORHOOD_BACKGROUND_SIZE,
          tween_state: NEIGHBORHOOD_BACKGROUND_STATE,
          tween_x: point.fitted_x,
          tween_y: point.fitted_y,
          tween_z: NEIGHBORHOOD_BACKGROUND_Z,
        };
      }

      return {
        ...point,
        tween_alpha: NEIGHBORHOOD_RESTORE_ALPHA,
        tween_size: target.sizeMultiplier,
        tween_state:
          point.image_id === layout.selectedImageId
            ? NEIGHBORHOOD_SELECTED_STATE
            : oppositeImageIds.has(point.image_id)
              ? NEIGHBORHOOD_OPPOSITE_STATE
            : NEIGHBORHOOD_RELATION_STATE,
        tween_screen_base_offset_x: target.screen.baseOffsetX,
        tween_screen_base_offset_y: target.screen.baseOffsetY,
        tween_screen_base_zoom: target.screen.baseZoom,
        tween_screen_cell_gap: target.screen.cellGap,
        tween_screen_cell_size: target.screen.cellSize,
        tween_screen_column: target.screen.column,
        tween_screen_grid_x: target.screen.gridX,
        tween_screen_grid_y: target.screen.gridY,
        tween_screen_height: target.screen.height,
        tween_screen_kind: target.screen.kind,
        tween_screen_row: target.screen.row,
        tween_screen_width: target.screen.width,
        tween_screen_x: target.screen.x,
        tween_screen_y: target.screen.y,
        tween_x: target.x,
        tween_y: target.y,
        tween_z: target.z,
      };
    }),
    recenterView,
    status: "ready",
  };
}

export function createLatentMapRestoredRuntimePoints(
  points: LatentMapRenderablePoint[],
): LatentMapRenderablePoint[] {
  return points.map((point) => ({
    ...point,
    tween_alpha: NEIGHBORHOOD_RESTORE_ALPHA,
    tween_size: NEIGHBORHOOD_RESTORE_SIZE,
    tween_state: undefined,
    tween_x: point.fitted_x,
    tween_y: point.fitted_y,
    tween_z: undefined,
  }));
}

function createNeighborhoodTargetMap({
  layout,
  recenterView,
  thumbnailSize,
  viewport,
}: {
  layout: LatentMapNeighborhoodReadyLayout;
  recenterView: LatentMapViewState;
  thumbnailSize: LatentMapThumbnailSize;
  viewport: {
    height: number;
    width: number;
  };
}) {
  const targets = new Map<string, ProjectedTarget>();

  targets.set(
    layout.anchor.imageId,
    projectNeighborhoodTarget({
      kind: "anchor",
      layout,
      recenterView,
      thumbnailSize,
      target: layout.anchor.target,
      viewport,
      z: NEIGHBORHOOD_SELECTED_Z,
    }),
  );

  layout.rows.forEach((row) => {
    targets.set(
      row.imageId,
      projectNeighborhoodTarget({
        layout,
        recenterView,
        row,
        kind: "grid",
        thumbnailSize,
        target: row.target,
        viewport,
        z: NEIGHBORHOOD_RELATION_Z,
      }),
    );
  });

  return targets;
}

function projectNeighborhoodTarget({
  kind,
  layout,
  recenterView,
  row,
  thumbnailSize,
  target,
  viewport,
  z,
}: {
  kind: "anchor" | "grid";
  layout: LatentMapNeighborhoodReadyLayout;
  recenterView: LatentMapViewState;
  row?: LatentMapNeighborhoodReadyLayout["rows"][number];
  thumbnailSize: LatentMapThumbnailSize;
  target: LatentMapNeighborhoodTargetTransform;
  viewport: {
    height: number;
    width: number;
  };
  z: number;
}): ProjectedTarget {
  const worldScale = getNeighborhoodWorldScale(layout);
  const targetLongSide = Math.max(target.width, target.height) * worldScale;
  const baseLongSide =
    thumbnailSize * LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL;
  const x = (target.x - layout.stageBounds.centerX) * worldScale;
  const y = -(target.y - layout.stageBounds.centerY) * worldScale;

  return {
    screen: createProjectedScreenTarget({
      kind,
      layout,
      recenterView,
      row,
      viewport,
      worldHeight: target.height * worldScale,
      worldWidth: target.width * worldScale,
      x,
      y,
    }),
    sizeMultiplier: Math.max(targetLongSide / Math.max(baseLongSide, 0.001), 0),
    x,
    y,
    z,
  };
}

function createProjectedScreenTarget({
  kind,
  layout,
  recenterView,
  row,
  viewport,
  worldHeight,
  worldWidth,
  x,
  y,
}: {
  kind: "anchor" | "grid";
  layout: LatentMapNeighborhoodReadyLayout;
  recenterView: LatentMapViewState;
  row?: LatentMapNeighborhoodReadyLayout["rows"][number];
  viewport: {
    height: number;
    width: number;
  };
  worldHeight: number;
  worldWidth: number;
  x: number;
  y: number;
}) {
  const aspect = Math.max(viewport.width, 1) / Math.max(viewport.height, 1);
  const pixelsPerWorldUnit =
    (Math.max(viewport.height, 1) * Math.max(recenterView.zoom, 0.001)) / 2;

  return {
    baseOffsetX: recenterView.offsetX,
    baseOffsetY: recenterView.offsetY,
    baseZoom: recenterView.zoom,
    cellGap: kind === "grid" ? layout.grid.cellGap : undefined,
    cellSize: kind === "grid" ? layout.grid.cellSize : undefined,
    column: row?.column,
    gridX: kind === "grid" ? layout.grid.bounds.x : undefined,
    gridY: kind === "grid" ? layout.grid.bounds.y : undefined,
    height: worldHeight * pixelsPerWorldUnit,
    kind,
    row: row?.row,
    width: worldWidth * pixelsPerWorldUnit,
    x:
      ((x - recenterView.offsetX) * recenterView.zoom / aspect + 1) *
      Math.max(viewport.width, 1) /
      2,
    y:
      (1 - (y - recenterView.offsetY) * recenterView.zoom) *
      Math.max(viewport.height, 1) /
      2,
  };
}

function createNeighborhoodRecenterView({
  layout,
  viewport,
}: {
  layout: LatentMapNeighborhoodReadyLayout;
  viewport: {
    height: number;
    width: number;
  };
}): LatentMapViewState {
  const worldScale = getNeighborhoodWorldScale(layout);
  const aspect = Math.max(viewport.width, 1) / Math.max(viewport.height, 1);
  const stageWorldWidth = Math.max(layout.stageBounds.width * worldScale, 0.001);
  const zoom = RECENTER_PADDING_MULTIPLIER;

  return {
    offsetX: -stageWorldWidth / 2 + aspect / zoom,
    offsetY: 0,
    zoom: Math.max(0.1, Math.min(4, zoom)),
  };
}

function getNeighborhoodWorldScale(layout: LatentMapNeighborhoodReadyLayout) {
  return 2 / Math.max(layout.stageBounds.height, 1);
}
