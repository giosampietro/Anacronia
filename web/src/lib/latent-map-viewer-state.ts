import {
  DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT,
  DEFAULT_LATENT_MAP_FAISS_RELATION_MODE,
  DEFAULT_LATENT_MAP_TEXTURE_DETAIL,
  DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
  LATENT_MAP_FAISS_NEIGHBOR_COUNT_OPTIONS,
  LATENT_MAP_FAISS_RELATION_MODE_OPTIONS,
  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
  getLatentMapAvailableTextureDetails,
  getLatentMapPointGroupKey,
  type LatentMapClusterGroup,
  type LatentMapFaissNeighborCount,
  type LatentMapFaissRelationMode,
  type LatentMapRenderMode,
  type LatentMapTextureDetail,
  type LatentMapThumbnailSize,
  type LatentMapViewerData,
} from "@/lib/latent-map-viewer";
import {
  LATENT_MAP_MAX_ZOOM,
  LATENT_MAP_MIN_ZOOM,
} from "@/lib/latent-map-view-controls";
import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

export type LatentMapFilterState = {
  clusterFilter: string;
  sourceFilter: string;
};

export type LatentMapDurableState = LatentMapFilterState & {
  faissNeighborCount: LatentMapFaissNeighborCount;
  faissRelationMode: LatentMapFaissRelationMode;
  renderMode: LatentMapRenderMode;
  selectedImageId: string | null;
  textureDetail: LatentMapTextureDetail;
  thumbnailSize: LatentMapThumbnailSize;
  view: LatentMapViewState;
};

const DEFAULT_VIEW: LatentMapViewState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

export const DEFAULT_LATENT_MAP_FILTERS: LatentMapFilterState = {
  clusterFilter: "all",
  sourceFilter: "all",
};

export const DEFAULT_LATENT_MAP_DURABLE_STATE: LatentMapDurableState = {
  ...DEFAULT_LATENT_MAP_FILTERS,
  faissNeighborCount: DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT,
  faissRelationMode: DEFAULT_LATENT_MAP_FAISS_RELATION_MODE,
  renderMode: "points",
  selectedImageId: null,
  textureDetail: DEFAULT_LATENT_MAP_TEXTURE_DETAIL,
  thumbnailSize: DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
  view: DEFAULT_VIEW,
};

export function getLatentMapSourceGroup(relativePath: string): string {
  const segments = relativePath.split("/").filter(Boolean);

  return segments.length > 1 ? segments[0] : "root";
}

export function createLatentMapFilterOptions(data: LatentMapViewerData): {
  groups: LatentMapClusterGroup[];
  sources: string[];
} {
  return {
    groups: getLatentMapGroupOptions(data),
    sources: [
      ...new Set(
        data.points.map((point) =>
          getLatentMapSourceGroup(point.relative_path),
        ),
      ),
    ].sort((left, right) => left.localeCompare(right)),
  };
}

export function filterLatentMapViewerData(
  data: LatentMapViewerData,
  filters: LatentMapFilterState,
): LatentMapViewerData {
  const points = data.points.filter((point) => {
    if (
      filters.sourceFilter !== "all" &&
      getLatentMapSourceGroup(point.relative_path) !== filters.sourceFilter
    ) {
      return false;
    }

    return true;
  });

  return {
    ...data,
    points,
  };
}

export function parseLatentMapUrlState(
  searchParams: URLSearchParams,
  data: LatentMapViewerData,
): LatentMapDurableState {
  const filterOptions = createLatentMapFilterOptions(data);
  const modeParam = searchParams.get("mode");
  const thumbParam = Number(searchParams.get("thumb"));
  const neighborsParam = Number(searchParams.get("neighbors"));
  const relationParam = searchParams.get("relation");
  const detailParam = searchParams.get("detail");
  const detailNumber = Number(detailParam);
  const availableTextureDetails = getLatentMapAvailableTextureDetails(data);
  const clusterParam = searchParams.get("cluster");
  const sourceParam = searchParams.get("source");
  const offsetX = Number(searchParams.get("x"));
  const offsetY = Number(searchParams.get("y"));
  const zoom = Number(searchParams.get("z"));
  const clusterFilter =
    clusterParam !== null &&
    filterOptions.groups.some((group) => group.group_key === clusterParam)
      ? clusterParam
      : "all";
  const sourceFilter =
    sourceParam !== null && filterOptions.sources.includes(sourceParam)
      ? sourceParam
      : "all";
  const selectedParam = searchParams.get("selected");
  const selectedExists = selectedParam
    ? filterLatentMapViewerData(data, {
        clusterFilter: "all",
        sourceFilter,
      }).points.some((point) => point.image_id === selectedParam)
    : false;

  return {
    clusterFilter,
    faissNeighborCount: LATENT_MAP_FAISS_NEIGHBOR_COUNT_OPTIONS.includes(
      neighborsParam as LatentMapFaissNeighborCount,
    )
      ? (neighborsParam as LatentMapFaissNeighborCount)
      : DEFAULT_LATENT_MAP_FAISS_NEIGHBOR_COUNT,
    faissRelationMode: LATENT_MAP_FAISS_RELATION_MODE_OPTIONS.includes(
      relationParam as LatentMapFaissRelationMode,
    )
      ? (relationParam as LatentMapFaissRelationMode)
      : DEFAULT_LATENT_MAP_FAISS_RELATION_MODE,
    renderMode: modeParam === "thumbnails" ? "thumbnails" : "points",
    selectedImageId: selectedExists ? selectedParam : null,
    sourceFilter,
    textureDetail:
      detailParam === null || detailParam === "auto"
        ? DEFAULT_LATENT_MAP_TEXTURE_DETAIL
        : availableTextureDetails.includes(detailNumber)
          ? detailNumber
          : DEFAULT_LATENT_MAP_TEXTURE_DETAIL,
    thumbnailSize: LATENT_MAP_THUMBNAIL_SIZE_OPTIONS.includes(
      thumbParam as LatentMapThumbnailSize,
    )
      ? (thumbParam as LatentMapThumbnailSize)
      : DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
    view: {
      offsetX: Number.isFinite(offsetX) ? offsetX : DEFAULT_VIEW.offsetX,
      offsetY: Number.isFinite(offsetY) ? offsetY : DEFAULT_VIEW.offsetY,
      zoom: Number.isFinite(zoom) &&
        zoom >= LATENT_MAP_MIN_ZOOM &&
        zoom <= LATENT_MAP_MAX_ZOOM
        ? zoom
        : DEFAULT_VIEW.zoom,
    },
  };
}

export function serializeLatentMapUrlState(
  state: LatentMapDurableState,
  data: LatentMapViewerData,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  searchParams.set("run", data.run_id);
  searchParams.set("recipe", data.embedding_recipe);
  searchParams.set("layout", data.layout_id);
  searchParams.set("clusterResult", data.cluster_id);
  searchParams.set("mode", state.renderMode);
  searchParams.set("thumb", String(state.thumbnailSize));
  searchParams.set("detail", String(state.textureDetail));
  searchParams.set("neighbors", String(state.faissNeighborCount));
  searchParams.set("relation", state.faissRelationMode);

  if (state.selectedImageId) {
    searchParams.set("selected", state.selectedImageId);
  }
  if (state.clusterFilter !== "all") {
    searchParams.set("cluster", state.clusterFilter);
  }
  if (state.sourceFilter !== "all") {
    searchParams.set("source", state.sourceFilter);
  }
  if (state.view.offsetX !== 0) {
    searchParams.set("x", String(Number(state.view.offsetX.toFixed(4))));
  }
  if (state.view.offsetY !== 0) {
    searchParams.set("y", String(Number(state.view.offsetY.toFixed(4))));
  }
  if (state.view.zoom !== 1) {
    searchParams.set("z", String(Number(state.view.zoom.toFixed(4))));
  }

  return searchParams;
}

function getLatentMapGroupOptions(data: LatentMapViewerData): LatentMapClusterGroup[] {
  const selectedCluster =
    data.cluster_result ??
    data.available_clusters?.find(
      (cluster) => cluster.cluster_id === data.cluster_id,
    );
  const metadataGroups = selectedCluster?.groups ?? [];

  if (metadataGroups.length > 0) {
    return [...metadataGroups].sort(compareLatentMapGroups);
  }

  const groupByKey = new Map<string, LatentMapClusterGroup>();

  for (const point of data.points) {
    const groupKey = getLatentMapPointGroupKey(point);
    const existingGroup = groupByKey.get(groupKey);

    if (existingGroup) {
      existingGroup.count += 1;
      continue;
    }

    const isUnassigned = point.cluster_id === -1 || groupKey === "unassigned";

    groupByKey.set(groupKey, {
      cluster_id: point.cluster_id,
      count: 1,
      group_key: groupKey,
      kind: isUnassigned ? "unassigned" : "cluster",
      label: isUnassigned ? "Unassigned" : `Group ${point.cluster_id}`,
    });
  }

  return [...groupByKey.values()].sort(compareLatentMapGroups);
}

function compareLatentMapGroups(
  left: LatentMapClusterGroup,
  right: LatentMapClusterGroup,
) {
  if (left.kind !== right.kind) {
    return left.kind === "unassigned" ? -1 : 1;
  }

  if (left.kind === "cluster" && left.count !== right.count) {
    return right.count - left.count;
  }

  return left.label.localeCompare(right.label);
}
