import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

import { LatentMapViewer } from "@/components/latent-map-viewer";
import { latentMapFixture } from "@/lib/latent-map-fixture";
import { normalizeExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

export const metadata: Metadata = {
  title: "Latent Map | Anacronia",
};

export const dynamic = "force-dynamic";

async function loadLatentMapViewerData() {
  const viewerDataPath = process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;

  if (!viewerDataPath) {
    return latentMapFixture;
  }

  const resolvedViewerDataPath = path.resolve(viewerDataPath);
  const rawData = JSON.parse(
    await readFile(resolvedViewerDataPath, "utf-8"),
  ) as Parameters<typeof normalizeExportedLatentMapViewerData>[0]["rawData"];
  const runDir = path.resolve(
    process.env.ANACRONIA_LATENT_MAP_RUN_DIR ??
      path.dirname(path.dirname(resolvedViewerDataPath)),
  );
  let sourceFolder = "external-source";

  try {
    const config = JSON.parse(
      await readFile(path.join(runDir, "config.json"), "utf-8"),
    ) as { source_folder?: string };
    sourceFolder = String(config.source_folder ?? sourceFolder);
  } catch {
    sourceFolder = String(
      process.env.ANACRONIA_LATENT_MAP_SOURCE_FOLDER ?? sourceFolder,
    );
  }

  if (
    !rawData.thumbnail_atlas &&
    typeof rawData.thumbnail_atlas_manifest_path === "string" &&
    rawData.thumbnail_atlas_manifest_path.length > 0
  ) {
    const atlasManifestPath = path.resolve(
      runDir,
      rawData.thumbnail_atlas_manifest_path,
    );
    if (
      atlasManifestPath === runDir ||
      !atlasManifestPath.startsWith(`${runDir}${path.sep}`)
    ) {
      throw new Error("Latent map atlas manifest is outside the run directory.");
    }
    rawData.thumbnail_atlas = JSON.parse(
      await readFile(atlasManifestPath, "utf-8"),
    );
  }

  return normalizeExportedLatentMapViewerData({
    rawData,
    sourceFolder,
    thumbnailApiPath: `/api/latent-map/thumbnails?run=${encodeURIComponent(
      path.basename(runDir),
    )}`,
  });
}

export default async function LatentMapPage() {
  const viewerData = await loadLatentMapViewerData();

  return <LatentMapViewer data={viewerData} />;
}
