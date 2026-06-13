import type {
  LatentMapFaissRelationMode,
  LatentMapNeighbor,
  LatentMapPoint,
} from "@/lib/latent-map-viewer";

export type LatentMapNeighborhoodRelation = "closest" | "opposite";

export type LatentMapNeighborhoodViewport = {
  height: number;
  width: number;
};

export type LatentMapNeighborhoodRect = {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
  x: number;
  y: number;
};

export type LatentMapNeighborhoodTargetTransform = {
  height: number;
  opacity: number;
  width: number;
  x: number;
  y: number;
};

export type LatentMapNeighborhoodAnchor = {
  imageId: string;
  point: LatentMapPoint;
  source: {
    x: number;
    y: number;
  };
  target: LatentMapNeighborhoodTargetTransform;
};

export type LatentMapNeighborhoodRow = {
  column: number;
  gridIndex: number;
  imageId: string;
  isOpposite: boolean;
  marker: "opposite" | null;
  point: LatentMapPoint;
  rank: number;
  relation: LatentMapNeighborhoodRelation;
  row: number;
  score: number;
  source: {
    x: number;
    y: number;
  };
  target: LatentMapNeighborhoodTargetTransform;
};

export type LatentMapNeighborhoodMissingItem = {
  imageId: string;
  rank: number;
  relation: LatentMapNeighborhoodRelation;
  score: number;
};

export type LatentMapNeighborhoodGrid = {
  bounds: LatentMapNeighborhoodRect;
  cellGap: number;
  cellSize: number;
  columns: number;
  rowCount: number;
};

export type LatentMapNeighborhoodRecenterTarget = {
  x: number;
  y: number;
  zoom: number;
};

export type LatentMapNeighborhoodReadyLayout = {
  anchor: LatentMapNeighborhoodAnchor;
  excludedSelectedImageIds: string[];
  grid: LatentMapNeighborhoodGrid;
  missingItems: LatentMapNeighborhoodMissingItem[];
  recenterTarget: LatentMapNeighborhoodRecenterTarget;
  rows: LatentMapNeighborhoodRow[];
  selectedImageId: string;
  stageBounds: LatentMapNeighborhoodRect;
  status: "ready";
};

export type LatentMapNeighborhoodEmptyLayout = {
  excludedSelectedImageIds: string[];
  missingItems: LatentMapNeighborhoodMissingItem[];
  reason: "no-selection" | "selected-missing";
  rows: [];
  selectedImageId: string | null;
  status: "empty";
};

export type LatentMapNeighborhoodLayout =
  | LatentMapNeighborhoodEmptyLayout
  | LatentMapNeighborhoodReadyLayout;

export type LatentMapNeighborhoodLayoutInput = {
  cellGap?: number;
  columns?: number;
  neighborCount: number;
  neighborsByImageId?: Record<string, LatentMapNeighbor[]>;
  oppositesByImageId?: Record<string, LatentMapNeighbor[]>;
  padding?: number;
  points: LatentMapPoint[];
  relationMode: LatentMapFaissRelationMode;
  selectedImageId: string | null;
  viewport: LatentMapNeighborhoodViewport;
};

type RankedNeighbor = {
  imageId: string;
  order: number;
  rank: number;
  relation: LatentMapNeighborhoodRelation;
  score: number;
};

const DEFAULT_COLUMNS = 3;
const DEFAULT_PADDING = 32;
const DEFAULT_CELL_GAP = 18;
const MAX_ANCHOR_LONG_SIDE = 500;
const MIN_GRID_CELL_SIZE = 112;
const MAX_GRID_CELL_SIZE = 188;
const LAYOUT_GAP = 40;
const RECENTER_MARGIN = 0.88;

export function createLatentMapNeighborhoodLayout({
  cellGap = DEFAULT_CELL_GAP,
  columns = DEFAULT_COLUMNS,
  neighborCount,
  neighborsByImageId = {},
  oppositesByImageId = {},
  padding = DEFAULT_PADDING,
  points,
  relationMode,
  selectedImageId,
  viewport,
}: LatentMapNeighborhoodLayoutInput): LatentMapNeighborhoodLayout {
  if (!selectedImageId) {
    return createEmptyNeighborhoodLayout("no-selection", null);
  }

  const pointByImageId = new Map(
    points.map((point) => [point.image_id, point] as const),
  );
  const selectedPoint = pointByImageId.get(selectedImageId);

  if (!selectedPoint) {
    return createEmptyNeighborhoodLayout("selected-missing", selectedImageId);
  }

  const safeColumns = Math.max(1, Math.floor(columns));
  const safeNeighborCount = Math.max(0, Math.floor(neighborCount));
  const safePadding = Math.max(0, padding);
  const safeCellGap = Math.max(0, cellGap);
  const safeViewport = {
    height: Math.max(1, viewport.height),
    width: Math.max(1, viewport.width),
  };
  const relationRows = createRankedNeighborhoodRows({
    neighbors:
      neighborsByImageId[selectedImageId] ?? selectedPoint.neighbors ?? [],
    opposites:
      oppositesByImageId[selectedImageId] ?? selectedPoint.opposites ?? [],
    relationMode,
    selectedImageId,
    safeNeighborCount,
  });
  const rows: LatentMapNeighborhoodRow[] = [];
  const missingItems: LatentMapNeighborhoodMissingItem[] = [];
  const excludedSelectedImageIds: string[] = [];
  const usedImageIds = new Set<string>();

  for (const relationRow of relationRows) {
    if (relationRow.imageId === selectedImageId) {
      excludedSelectedImageIds.push(relationRow.imageId);
      continue;
    }

    if (usedImageIds.has(relationRow.imageId)) {
      continue;
    }

    const point = pointByImageId.get(relationRow.imageId);

    if (!point) {
      missingItems.push({
        imageId: relationRow.imageId,
        rank: relationRow.rank,
        relation: relationRow.relation,
        score: relationRow.score,
      });
      continue;
    }

    usedImageIds.add(relationRow.imageId);
    rows.push({
      column: rows.length % safeColumns,
      gridIndex: rows.length,
      imageId: relationRow.imageId,
      isOpposite: relationRow.relation === "opposite",
      marker: relationRow.relation === "opposite" ? "opposite" : null,
      point,
      rank: relationRow.rank,
      relation: relationRow.relation,
      row: Math.floor(rows.length / safeColumns),
      score: relationRow.score,
      source: {
        x: point.x,
        y: point.y,
      },
      target: {
        height: 0,
        opacity: 1,
        width: 0,
        x: 0,
        y: 0,
      },
    });
  }

  const rowCount = rows.length === 0 ? 0 : Math.ceil(rows.length / safeColumns);
  const anchorLongSide = clamp(
    Math.min(
      MAX_ANCHOR_LONG_SIDE,
      safeViewport.width * 0.34,
      safeViewport.height * 0.72,
    ),
    160,
    MAX_ANCHOR_LONG_SIDE,
  );
  const gridCellSize = clamp(
    safeViewport.width * 0.11,
    MIN_GRID_CELL_SIZE,
    MAX_GRID_CELL_SIZE,
  );
  const gridWidth =
    safeColumns * gridCellSize + Math.max(0, safeColumns - 1) * safeCellGap;
  const gridHeight =
    rowCount === 0
      ? 0
      : rowCount * gridCellSize + Math.max(0, rowCount - 1) * safeCellGap;
  const anchorAreaWidth = anchorLongSide;
  const stageWidth =
    safePadding + anchorAreaWidth + LAYOUT_GAP + gridWidth + safePadding;
  const stageHeight =
    safePadding +
    Math.max(anchorLongSide, gridHeight) +
    safePadding;
  const anchorBounds = createRect(
    safePadding,
    safePadding,
    anchorAreaWidth,
    Math.max(anchorLongSide, stageHeight - safePadding * 2),
  );
  const anchorRect = fitRectInBounds({
    aspectRatio: getPointAspectRatio(selectedPoint),
    bounds: anchorBounds,
    maxLongSide: anchorLongSide,
  });
  const gridBounds = createRect(
    safePadding + anchorAreaWidth + LAYOUT_GAP,
    safePadding,
    gridWidth,
    gridHeight,
  );

  rows.forEach((row) => {
    const cellBounds = createRect(
      gridBounds.x + row.column * (gridCellSize + safeCellGap),
      gridBounds.y + row.row * (gridCellSize + safeCellGap),
      gridCellSize,
      gridCellSize,
    );
    row.target = rectToTarget(
      fitRectInBounds({
        aspectRatio: getPointAspectRatio(row.point),
        bounds: cellBounds,
        maxLongSide: gridCellSize,
      }),
    );
  });

  const stageBounds = createRect(0, 0, stageWidth, stageHeight);

  return {
    anchor: {
      imageId: selectedImageId,
      point: selectedPoint,
      source: {
        x: selectedPoint.x,
        y: selectedPoint.y,
      },
      target: rectToTarget(anchorRect),
    },
    excludedSelectedImageIds,
    grid: {
      bounds: gridBounds,
      cellGap: safeCellGap,
      cellSize: gridCellSize,
      columns: safeColumns,
      rowCount,
    },
    missingItems,
    recenterTarget: createRecenterTarget(stageBounds, safeViewport),
    rows,
    selectedImageId,
    stageBounds,
    status: "ready",
  };
}

function createEmptyNeighborhoodLayout(
  reason: LatentMapNeighborhoodEmptyLayout["reason"],
  selectedImageId: string | null,
): LatentMapNeighborhoodEmptyLayout {
  return {
    excludedSelectedImageIds: [],
    missingItems: [],
    reason,
    rows: [],
    selectedImageId,
    status: "empty",
  };
}

function createRankedNeighborhoodRows({
  neighbors,
  opposites,
  relationMode,
  safeNeighborCount,
}: {
  neighbors: LatentMapNeighbor[];
  opposites: LatentMapNeighbor[];
  relationMode: LatentMapFaissRelationMode;
  safeNeighborCount: number;
  selectedImageId: string;
}): RankedNeighbor[] {
  const relationRows: RankedNeighbor[] = [];

  if (relationMode !== "opposite") {
    relationRows.push(
      ...createRankedRelationRows(neighbors, "closest", safeNeighborCount),
    );
  }

  if (relationMode !== "closest") {
    relationRows.push(
      ...createRankedRelationRows(opposites, "opposite", safeNeighborCount),
    );
  }

  return relationRows;
}

function createRankedRelationRows(
  neighbors: LatentMapNeighbor[],
  relation: LatentMapNeighborhoodRelation,
  neighborCount: number,
): RankedNeighbor[] {
  return neighbors
    .map((neighbor, order) => ({
      imageId: neighbor.image_id,
      order,
      rank:
        typeof neighbor.rank === "number" && Number.isFinite(neighbor.rank)
          ? neighbor.rank
          : order + 1,
      relation,
      score: neighbor.score,
    }))
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .slice(0, neighborCount);
}

function createRect(
  x: number,
  y: number,
  width: number,
  height: number,
): LatentMapNeighborhoodRect {
  return {
    centerX: x + width / 2,
    centerY: y + height / 2,
    height,
    width,
    x,
    y,
  };
}

function fitRectInBounds({
  aspectRatio,
  bounds,
  maxLongSide,
}: {
  aspectRatio: number;
  bounds: LatentMapNeighborhoodRect;
  maxLongSide: number;
}): LatentMapNeighborhoodRect {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : 1;
  let width = Math.min(bounds.width, maxLongSide);
  let height = width / safeAspectRatio;

  if (height > bounds.height || height > maxLongSide) {
    height = Math.min(bounds.height, maxLongSide);
    width = height * safeAspectRatio;
  }

  return createRect(
    bounds.centerX - width / 2,
    bounds.centerY - height / 2,
    width,
    height,
  );
}

function rectToTarget(
  rect: LatentMapNeighborhoodRect,
): LatentMapNeighborhoodTargetTransform {
  return {
    height: rect.height,
    opacity: 1,
    width: rect.width,
    x: rect.centerX,
    y: rect.centerY,
  };
}

function createRecenterTarget(
  stageBounds: LatentMapNeighborhoodRect,
  viewport: LatentMapNeighborhoodViewport,
): LatentMapNeighborhoodRecenterTarget {
  return {
    x: stageBounds.centerX,
    y: stageBounds.centerY,
    zoom:
      Math.min(
        viewport.width / Math.max(stageBounds.width, 1),
        viewport.height / Math.max(stageBounds.height, 1),
      ) * RECENTER_MARGIN,
  };
}

function getPointAspectRatio(point: LatentMapPoint): number {
  if (!Number.isFinite(point.width) || !Number.isFinite(point.height)) {
    return 1;
  }

  if (point.width <= 0 || point.height <= 0) {
    return 1;
  }

  return point.width / point.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
