import type { LatentMapPoint } from "@/lib/latent-map-viewer";

export type LatentMapHoverPreviewSources = {
  fallbackSource: string | null;
  primarySource: string | null;
};

function cleanResourceSource(source: string | null | undefined) {
  if (typeof source !== "string" || source.trim().length === 0) {
    return null;
  }

  return source;
}

export function getLatentMapHoverPreviewSources(
  point: Pick<LatentMapPoint, "preview_path" | "thumbnail_path">,
): LatentMapHoverPreviewSources {
  const thumbnailSource = cleanResourceSource(point.thumbnail_path);
  const previewSource = cleanResourceSource(point.preview_path);
  const primarySource = previewSource ?? thumbnailSource;
  const fallbackSource =
    thumbnailSource && thumbnailSource !== primarySource ? thumbnailSource : null;

  return { fallbackSource, primarySource };
}
