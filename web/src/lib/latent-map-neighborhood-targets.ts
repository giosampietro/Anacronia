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
  sizeMultiplier: number;
  x: number;
  y: number;
  z: number;
};

const NEIGHBORHOOD_BACKGROUND_ALPHA = 0.08;
const NEIGHBORHOOD_BACKGROUND_SIZE = 0.35;
const NEIGHBORHOOD_RESTORE_SIZE = 1;
const NEIGHBORHOOD_RESTORE_ALPHA = 1;
const NEIGHBORHOOD_SELECTED_STATE = 2;
const NEIGHBORHOOD_RELATION_STATE = 1;
const NEIGHBORHOOD_BACKGROUND_STATE = 0;
const NEIGHBORHOOD_SELECTED_Z = 0.42;
const NEIGHBORHOOD_RELATION_Z = 0.34;
const NEIGHBORHOOD_BACKGROUND_Z = -0.08;
const RECENTER_PADDING_MULTIPLIER = 0.92;

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

  const targetByImageId = createNeighborhoodTargetMap({
    layout,
    thumbnailSize,
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
            : NEIGHBORHOOD_RELATION_STATE,
        tween_x: target.x,
        tween_y: target.y,
        tween_z: target.z,
      };
    }),
    recenterView: createNeighborhoodRecenterView({
      layout,
      viewport,
    }),
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
  thumbnailSize,
}: {
  layout: LatentMapNeighborhoodReadyLayout;
  thumbnailSize: LatentMapThumbnailSize;
}) {
  const targets = new Map<string, ProjectedTarget>();

  targets.set(
    layout.anchor.imageId,
    projectNeighborhoodTarget({
      layout,
      thumbnailSize,
      target: layout.anchor.target,
      z: NEIGHBORHOOD_SELECTED_Z,
    }),
  );

  layout.rows.forEach((row) => {
    targets.set(
      row.imageId,
      projectNeighborhoodTarget({
        layout,
        thumbnailSize,
        target: row.target,
        z: NEIGHBORHOOD_RELATION_Z,
      }),
    );
  });

  return targets;
}

function projectNeighborhoodTarget({
  layout,
  thumbnailSize,
  target,
  z,
}: {
  layout: LatentMapNeighborhoodReadyLayout;
  thumbnailSize: LatentMapThumbnailSize;
  target: LatentMapNeighborhoodTargetTransform;
  z: number;
}): ProjectedTarget {
  const worldScale = getNeighborhoodWorldScale(layout);
  const targetLongSide = Math.max(target.width, target.height) * worldScale;
  const baseLongSide =
    thumbnailSize * LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL;

  return {
    sizeMultiplier: Math.max(targetLongSide / Math.max(baseLongSide, 0.001), 0),
    x: (target.x - layout.stageBounds.centerX) * worldScale,
    y: -(target.y - layout.stageBounds.centerY) * worldScale,
    z,
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
  const stageWorldHeight = Math.max(layout.stageBounds.height * worldScale, 0.001);
  const zoom = Math.min(
    (2 * aspect) / stageWorldWidth,
    2 / stageWorldHeight,
  ) * RECENTER_PADDING_MULTIPLIER;

  return {
    offsetX: 0,
    offsetY: 0,
    zoom: Math.max(0.1, Math.min(4, zoom)),
  };
}

function getNeighborhoodWorldScale(layout: LatentMapNeighborhoodReadyLayout) {
  return 2 / Math.max(layout.stageBounds.height, 1);
}
