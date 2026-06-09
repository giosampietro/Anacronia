import type {
  LatentMapGeneratedThumbnailAtlas,
  LatentMapNeighbor,
  LatentMapPoint,
  LatentMapViewerData,
} from "@/lib/latent-map-viewer";

type ExportedLatentMapViewerData = {
  available_clusters?: {
    cluster_count?: unknown;
    cluster_id?: unknown;
    method?: unknown;
    random_state?: unknown;
  }[];
  available_layouts?: {
    layout_id?: unknown;
    method?: unknown;
    params?: unknown;
  }[];
  cluster_id?: string;
  layout_id?: string;
  neighbor_index_path?: string;
  points?: Partial<LatentMapPoint>[];
  recipe_name?: string;
  run_id?: string;
  thumbnail_atlas?: Partial<LatentMapGeneratedThumbnailAtlas>;
  thumbnail_atlas_manifest_path?: string;
};

function createResourceUrl({
  apiPath,
  resourcePath,
}: {
  apiPath: string;
  resourcePath: string;
}): string {
  const separator = apiPath.includes("?") ? "&" : "?";

  return `${apiPath}${separator}path=${encodeURIComponent(resourcePath)}`;
}

export function normalizeExportedLatentMapViewerData({
  rawData,
  neighborApiPath = "/api/latent-map/neighbors",
  sourceFolder,
  thumbnailApiPath = "/api/latent-map/thumbnails",
}: {
  neighborApiPath?: string;
  rawData: ExportedLatentMapViewerData;
  sourceFolder: string;
  thumbnailApiPath?: string;
}): LatentMapViewerData {
  const points = Array.isArray(rawData.points) ? rawData.points : [];
  const thumbnailAtlas = normalizeThumbnailAtlas({
    rawAtlas: rawData.thumbnail_atlas,
    thumbnailApiPath,
  });

  return {
    schema_version: 1,
    run_id: String(rawData.run_id ?? "external-run"),
    available_clusters: normalizeAvailableClusters(rawData.available_clusters),
    available_layouts: normalizeAvailableLayouts(rawData.available_layouts),
    embedding_recipe: String(rawData.recipe_name ?? "unknown_recipe"),
    layout_id: String(rawData.layout_id ?? "unknown_layout"),
    cluster_id: String(rawData.cluster_id ?? "unknown_cluster"),
    source_folder: sourceFolder,
    ...(typeof rawData.neighbor_index_path === "string" &&
    rawData.neighbor_index_path.length > 0
      ? {
          neighbor_lookup_path: createResourceUrl({
            apiPath: neighborApiPath,
            resourcePath: rawData.neighbor_index_path,
          }),
        }
      : {}),
    ...(thumbnailAtlas ? { thumbnail_atlas: thumbnailAtlas } : {}),
    points: points.map((point): LatentMapPoint => {
      const thumbnailPath = String(point.thumbnail_path ?? "");

      return {
        image_id: String(point.image_id ?? ""),
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
        cluster_id: Number(point.cluster_id ?? 0),
        thumbnail_path: createResourceUrl({
          apiPath: thumbnailApiPath,
          resourcePath: thumbnailPath,
        }),
        source_path: "",
        relative_path: String(point.relative_path ?? ""),
        width: Number(point.width ?? 1),
        height: Number(point.height ?? 1),
        neighbors: Array.isArray(point.neighbors)
          ? point.neighbors.map((neighbor) => ({
              image_id: String(neighbor.image_id),
              score: Number(neighbor.score ?? 0),
            }))
          : [],
      };
    }),
  };
}

function normalizeAvailableLayouts(
  layouts: ExportedLatentMapViewerData["available_layouts"],
): LatentMapViewerData["available_layouts"] {
  return Array.isArray(layouts)
    ? layouts.map((layout) => ({
        layout_id: String(layout.layout_id ?? ""),
        method: String(layout.method ?? ""),
        params:
          layout.params &&
          typeof layout.params === "object" &&
          !Array.isArray(layout.params)
            ? (layout.params as Record<string, unknown>)
            : {},
      }))
    : [];
}

function normalizeAvailableClusters(
  clusters: ExportedLatentMapViewerData["available_clusters"],
): LatentMapViewerData["available_clusters"] {
  return Array.isArray(clusters)
    ? clusters.map((cluster) => ({
        cluster_count:
          typeof cluster.cluster_count === "number"
            ? cluster.cluster_count
            : null,
        cluster_id: String(cluster.cluster_id ?? ""),
        method: String(cluster.method ?? ""),
        random_state:
          typeof cluster.random_state === "number"
            ? cluster.random_state
            : null,
      }))
    : [];
}

function normalizeThumbnailAtlas({
  rawAtlas,
  thumbnailApiPath,
}: {
  rawAtlas: Partial<LatentMapGeneratedThumbnailAtlas> | undefined;
  thumbnailApiPath: string;
}): LatentMapGeneratedThumbnailAtlas | undefined {
  if (!rawAtlas) {
    return undefined;
  }

  return {
    schema_version: 1,
    asset_kind: "latent-map-thumbnail-atlas",
    run_id: String(rawAtlas.run_id ?? ""),
    tile_size: Number(rawAtlas.tile_size ?? 64) as LatentMapGeneratedThumbnailAtlas["tile_size"],
    atlas_size: Number(rawAtlas.atlas_size ?? 2048),
    image_count: Number(rawAtlas.image_count ?? 0),
    page_count: Number(rawAtlas.page_count ?? 0),
    pages: Array.isArray(rawAtlas.pages)
      ? rawAtlas.pages.map((page) => ({
          height: Number(page.height ?? 0),
          index: Number(page.index ?? 0),
          path: createResourceUrl({
            apiPath: thumbnailApiPath,
            resourcePath: String(page.path ?? ""),
          }),
          width: Number(page.width ?? 0),
        }))
      : [],
    items: Array.isArray(rawAtlas.items)
      ? rawAtlas.items.map((item) => ({
          height: Number(item.height ?? 0),
          image_id: String(item.image_id ?? ""),
          page_index: Number(item.page_index ?? 0),
          page_path: String(item.page_path ?? ""),
          source_thumbnail_path: String(item.source_thumbnail_path ?? ""),
          tile_rect: normalizeNumberTuple(item.tile_rect),
          uv_rect: normalizeNumberTuple(item.uv_rect),
          width: Number(item.width ?? 0),
        }))
      : [],
  };
}

function normalizeNumberTuple(
  value: unknown,
): [number, number, number, number] {
  const numbers = Array.isArray(value) ? value.map(Number) : [];

  return [
    numbers[0] ?? 0,
    numbers[1] ?? 0,
    numbers[2] ?? 0,
    numbers[3] ?? 0,
  ];
}

export function normalizeLatentMapNeighborResponse(
  rawData: unknown,
  selectedImageId: string,
): LatentMapNeighbor[] {
  if (!rawData || typeof rawData !== "object") {
    throw new Error("FAISS neighbors are unavailable for the selected image.");
  }

  const response = rawData as {
    image_id?: unknown;
    neighbors?: unknown;
  };
  const imageId = String(response.image_id ?? "");

  if (imageId !== selectedImageId) {
    throw new Error("FAISS neighbor response mismatch.");
  }

  if (!Array.isArray(response.neighbors)) {
    throw new Error("FAISS neighbors are unavailable for the selected image.");
  }

  return response.neighbors.map((neighbor) => {
    const row = neighbor as { image_id?: unknown; score?: unknown };

    return {
      image_id: String(row.image_id ?? ""),
      score: Number(row.score ?? 0),
    };
  });
}
