import type {
  LatentMapPoint,
  LatentMapViewerData,
} from "@/lib/latent-map-viewer";

type ExportedLatentMapViewerData = {
  cluster_id?: string;
  layout_id?: string;
  points?: Partial<LatentMapPoint>[];
  recipe_name?: string;
  run_id?: string;
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

  return {
    schema_version: 1,
    run_id: String(rawData.run_id ?? "external-run"),
    embedding_recipe: String(rawData.recipe_name ?? "unknown_recipe"),
    layout_id: String(rawData.layout_id ?? "unknown_layout"),
    cluster_id: String(rawData.cluster_id ?? "unknown_cluster"),
    source_folder: sourceFolder,
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
