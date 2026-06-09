import type {
  LatentMapGeneratedThumbnailAtlas,
  LatentMapPoint,
  LatentMapViewerData,
} from "@/lib/latent-map-viewer";

type ExportedLatentMapViewerData = {
  cluster_id?: string;
  layout_id?: string;
  points?: Partial<LatentMapPoint>[];
  recipe_name?: string;
  run_id?: string;
  thumbnail_atlas?: Partial<LatentMapGeneratedThumbnailAtlas>;
  thumbnail_atlas_manifest_path?: string;
};

function createThumbnailUrl({
  thumbnailApiPath,
  thumbnailPath,
}: {
  thumbnailApiPath: string;
  thumbnailPath: string;
}): string {
  const separator = thumbnailApiPath.includes("?") ? "&" : "?";

  return `${thumbnailApiPath}${separator}path=${encodeURIComponent(thumbnailPath)}`;
}

export function normalizeExportedLatentMapViewerData({
  rawData,
  sourceFolder,
  thumbnailApiPath = "/api/latent-map/thumbnails",
}: {
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
    embedding_recipe: String(rawData.recipe_name ?? "unknown_recipe"),
    layout_id: String(rawData.layout_id ?? "unknown_layout"),
    cluster_id: String(rawData.cluster_id ?? "unknown_cluster"),
    source_folder: sourceFolder,
    ...(thumbnailAtlas ? { thumbnail_atlas: thumbnailAtlas } : {}),
    points: points.map((point): LatentMapPoint => {
      const thumbnailPath = String(point.thumbnail_path ?? "");

      return {
        image_id: String(point.image_id ?? ""),
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
        cluster_id: Number(point.cluster_id ?? 0),
        thumbnail_path: createThumbnailUrl({
          thumbnailApiPath,
          thumbnailPath,
        }),
        source_path: String(point.source_path ?? ""),
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
          path: createThumbnailUrl({
            thumbnailApiPath,
            thumbnailPath: String(page.path ?? ""),
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
