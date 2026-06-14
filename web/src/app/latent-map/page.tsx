import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

import { LatentMapViewer } from "@/components/latent-map-viewer";
import { loadLatentMapAnalysisResultViewerData } from "@/lib/latent-map-analysis-result-open";
import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  LATENT_MAP_RUNS_ROOT,
  loadLatentMapRunExportedViewerData,
} from "@/lib/latent-map-run-data";
import { parseLatentMapUrlState } from "@/lib/latent-map-viewer-state";
import type { ExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";
import { normalizeExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

export const metadata: Metadata = {
  title: "Latent Map | Anacronia",
};

export const dynamic = "force-dynamic";

type LatentMapSearchParams = Record<string, string | string[] | undefined>;

function getSearchParam(
  searchParams: LatentMapSearchParams,
  key: string,
): string | null {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function toUrlSearchParams(searchParams: LatentMapSearchParams): URLSearchParams {
  const urlSearchParams = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined) {
          urlSearchParams.append(key, entry);
        }
      });
      return;
    }

    if (value !== undefined) {
      urlSearchParams.set(key, value);
    }
  });

  return urlSearchParams;
}

function resolveRunDir({
  resolvedViewerDataPath,
  runsRoot,
  searchParams,
}: {
  resolvedViewerDataPath: string;
  runsRoot: string;
  searchParams: LatentMapSearchParams;
}): string {
  const runParam = getSearchParam(searchParams, "run");

  if (process.env.ANACRONIA_LATENT_MAP_RUN_DIR) {
    return path.resolve(process.env.ANACRONIA_LATENT_MAP_RUN_DIR);
  }

  if (runParam) {
    const resolvedRunsRoot = path.resolve(runsRoot);
    const runDir = path.resolve(resolvedRunsRoot, runParam);

    if (runDir.startsWith(`${resolvedRunsRoot}${path.sep}`)) {
      return runDir;
    }
  }

  return path.resolve(path.dirname(path.dirname(resolvedViewerDataPath)));
}

async function loadLatentMapSourceFolder(runDir: string): Promise<string> {
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

  return sourceFolder;
}

function getLatentMapRunsRoot(): string {
  return process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT ?? LATENT_MAP_RUNS_ROOT;
}

async function hydrateThumbnailAtlas({
  rawData,
  runDir,
}: {
  rawData: ExportedLatentMapViewerData;
  runDir: string;
}) {
  if (rawData.thumbnail_atlases?.length) {
    return;
  }

  if (rawData.thumbnail_atlas && !rawData.thumbnail_atlas_manifest_paths) {
    return;
  }

  const manifestPaths = rawData.thumbnail_atlas_manifest_paths
    ? Object.values(rawData.thumbnail_atlas_manifest_paths)
    : typeof rawData.thumbnail_atlas_manifest_path === "string" &&
        rawData.thumbnail_atlas_manifest_path.length > 0
      ? [rawData.thumbnail_atlas_manifest_path]
      : [];

  if (manifestPaths.length === 0) {
    return;
  }

  rawData.thumbnail_atlases = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const atlasManifestPath = path.resolve(runDir, manifestPath);

      if (
        atlasManifestPath === runDir ||
        !atlasManifestPath.startsWith(`${runDir}${path.sep}`)
      ) {
        throw new Error("Latent map atlas manifest is outside the run directory.");
      }

      return JSON.parse(await readFile(atlasManifestPath, "utf-8"));
    }),
  );
  rawData.thumbnail_atlas =
    rawData.thumbnail_atlases.find((atlas) => atlas.tile_size === 64) ??
    rawData.thumbnail_atlases[0];
}

async function loadLatentMapViewerData(searchParams: LatentMapSearchParams) {
  const viewerDataPath = process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;

  if (!viewerDataPath) {
    return latentMapFixture;
  }

  const resolvedViewerDataPath = path.resolve(viewerDataPath);
  const fallbackRawData = JSON.parse(
    await readFile(resolvedViewerDataPath, "utf-8"),
  ) as ExportedLatentMapViewerData;
  const fallbackRunDir = path.resolve(
    path.dirname(path.dirname(resolvedViewerDataPath)),
  );
  const runsRoot = getLatentMapRunsRoot();
  const analysisResultId = getSearchParam(searchParams, "analysisResultId");
  const runDir = resolveRunDir({
    resolvedViewerDataPath,
    runsRoot,
    searchParams,
  });
  let rawData: ExportedLatentMapViewerData = fallbackRawData;
  let dataRunDir = fallbackRunDir;
  let activeAnalysisResultId: string | null = null;

  try {
    if (analysisResultId) {
      const loaded = await loadLatentMapAnalysisResultViewerData({
        analysisResultId,
        runsRoot,
        selectedClusterId:
          getSearchParam(searchParams, "clusterResult") ??
          fallbackRawData.cluster_id,
        selectedLayoutId:
          getSearchParam(searchParams, "layout") ?? fallbackRawData.layout_id,
        selectedRecipeName:
          getSearchParam(searchParams, "recipe") ?? fallbackRawData.recipe_name,
      });
      rawData = loaded.rawData;
      dataRunDir = loaded.runDir;
      activeAnalysisResultId = analysisResultId;
    } else {
      rawData = await loadLatentMapRunExportedViewerData({
        runDir,
        selectedClusterId:
          getSearchParam(searchParams, "clusterResult") ??
          fallbackRawData.cluster_id,
        selectedLayoutId:
          getSearchParam(searchParams, "layout") ?? fallbackRawData.layout_id,
        selectedRecipeName:
          getSearchParam(searchParams, "recipe") ?? fallbackRawData.recipe_name,
      });
      dataRunDir = runDir;
    }
  } catch {
    rawData = fallbackRawData;
    dataRunDir = fallbackRunDir;
    activeAnalysisResultId = null;
  }

  const loadedSourceFolder = await loadLatentMapSourceFolder(dataRunDir);
  const sourceFolder = activeAnalysisResultId
    ? path.basename(loadedSourceFolder)
    : loadedSourceFolder;

  await hydrateThumbnailAtlas({ rawData, runDir: dataRunDir });

  return normalizeExportedLatentMapViewerData({
    neighborApiPath: `/api/latent-map/neighbors?run=${encodeURIComponent(
      path.basename(dataRunDir),
    )}`,
    rawData,
    sourceFolder,
    thumbnailApiPath: activeAnalysisResultId
      ? `/api/latent-map/thumbnails?analysisResultId=${encodeURIComponent(
          activeAnalysisResultId,
        )}`
      : `/api/latent-map/thumbnails?run=${encodeURIComponent(
          path.basename(dataRunDir),
        )}`,
    thumbnailResourceParamName: activeAnalysisResultId ? "artifactKey" : "path",
  });
}

export default async function LatentMapPage({
  searchParams,
}: {
  searchParams?: Promise<LatentMapSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const viewerData = await loadLatentMapViewerData(resolvedSearchParams);
  const initialState = parseLatentMapUrlState(
    toUrlSearchParams(resolvedSearchParams),
    viewerData,
  );

  return <LatentMapViewer data={viewerData} initialState={initialState} />;
}
