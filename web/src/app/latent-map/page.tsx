import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

import { AppSpaceShell } from "@/components/app-space-shell";
import { LatentMapViewer } from "@/components/latent-map-viewer";
import {
  getAdditionalAnalysisResultRoots,
  getLatentMapRunsRoot,
} from "@/lib/analysis-result-roots";
import { loadLatentMapAnalysisResultViewerData } from "@/lib/latent-map-analysis-result-open";
import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
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
type ExportedThumbnailAtlas = NonNullable<
  ExportedLatentMapViewerData["thumbnail_atlases"]
>[number];

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

  const atlases = (
    await Promise.all(
      manifestPaths.map(
        async (manifestPath): Promise<ExportedThumbnailAtlas | null> => {
          const atlasManifestPath = path.resolve(runDir, manifestPath);

          if (
            atlasManifestPath === runDir ||
            !atlasManifestPath.startsWith(`${runDir}${path.sep}`)
          ) {
            throw new Error(
              "Latent map atlas manifest is outside the run directory.",
            );
          }

          try {
            return JSON.parse(
              await readFile(atlasManifestPath, "utf-8"),
            ) as ExportedThumbnailAtlas;
          } catch (error) {
            if (isMissingFileError(error)) {
              return null;
            }

            throw error;
          }
        }
      ),
    )
  ).filter((atlas): atlas is ExportedThumbnailAtlas => atlas !== null);

  if (atlases.length === 0) {
    return;
  }

  rawData.thumbnail_atlases = atlases;
  rawData.thumbnail_atlas =
    rawData.thumbnail_atlases.find((atlas) => atlas.tile_size === 64) ??
    rawData.thumbnail_atlases[0];
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  );
}

export async function loadLatentMapViewerData(
  searchParams: LatentMapSearchParams,
) {
  const viewerDataPath = process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;
  const runsRoot = getLatentMapRunsRoot();
  const analysisResultId = getSearchParam(searchParams, "analysisResultId");
  const resolvedViewerDataPath = viewerDataPath
    ? path.resolve(viewerDataPath)
    : null;
  const fallbackRawData = resolvedViewerDataPath
    ? (JSON.parse(
        await readFile(resolvedViewerDataPath, "utf-8"),
      ) as ExportedLatentMapViewerData)
    : null;
  const fallbackRunDir = resolvedViewerDataPath
    ? path.resolve(path.dirname(path.dirname(resolvedViewerDataPath)))
    : null;
  let rawData: ExportedLatentMapViewerData = fallbackRawData ?? latentMapFixture;
  let dataRunDir = fallbackRunDir ?? "";
  let activeAnalysisResultId: string | null = null;

  try {
    if (analysisResultId) {
      const loaded = await loadLatentMapAnalysisResultViewerData({
        additionalRunsRoots: getAdditionalAnalysisResultRoots(),
        analysisResultId,
        runsRoot,
        selectedClusterId:
          getSearchParam(searchParams, "clusterResult") ??
          fallbackRawData?.cluster_id,
        selectedLayoutId:
          getSearchParam(searchParams, "layout") ?? fallbackRawData?.layout_id,
        selectedRecipeName:
          getSearchParam(searchParams, "recipe") ?? fallbackRawData?.recipe_name,
      });
      rawData = loaded.rawData;
      dataRunDir = loaded.runDir;
      activeAnalysisResultId = analysisResultId;
    } else {
      if (!resolvedViewerDataPath || !fallbackRawData || !fallbackRunDir) {
        return latentMapFixture;
      }
      const runDir = resolveRunDir({
        resolvedViewerDataPath,
        runsRoot,
        searchParams,
      });
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
  } catch (error) {
    if (analysisResultId) {
      throw error;
    }

    if (!fallbackRawData || !fallbackRunDir) {
      throw error;
    }

    rawData = fallbackRawData;
    dataRunDir = fallbackRunDir;
    activeAnalysisResultId = null;
  }

  const loadedSourceFolder = await loadLatentMapSourceFolder(dataRunDir);
  const sourceFolder = activeAnalysisResultId
    ? path.basename(loadedSourceFolder)
    : loadedSourceFolder;

  await hydrateThumbnailAtlas({ rawData, runDir: dataRunDir });

  const normalizedData = normalizeExportedLatentMapViewerData({
    neighborApiPath: activeAnalysisResultId
      ? `/api/latent-map/neighbors?analysisResultId=${encodeURIComponent(
          activeAnalysisResultId,
        )}`
      : `/api/latent-map/neighbors?run=${encodeURIComponent(
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

  return activeAnalysisResultId
    ? { ...normalizedData, analysis_result_id: activeAnalysisResultId }
    : normalizedData;
}

export default async function LatentMapPage({
  searchParams,
}: {
  searchParams?: Promise<LatentMapSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const analysisResultId = getSearchParam(
    resolvedSearchParams,
    "analysisResultId",
  );

  if (!analysisResultId && !process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA) {
    return (
      <AppSpaceShell
        activeSpace="explorer"
        contentClassName="min-w-0"
        focusModeAvailable
      >
        <section
          className="flex min-h-svh items-center justify-center bg-background px-6"
          data-testid="latent-map-empty-state"
          data-ui-overlay-hidden="false"
        >
          <div className="max-w-md text-center">
            <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">
              Latent Space Explorer
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Select an Analysis Result
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Open a completed result from Analysis Studio.
            </p>
            <a
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              href="/analysis-results"
            >
              Open Analysis Studio
            </a>
          </div>
        </section>
      </AppSpaceShell>
    );
  }

  const viewerData = await loadLatentMapViewerData(resolvedSearchParams);
  const initialState = parseLatentMapUrlState(
    toUrlSearchParams(resolvedSearchParams),
    viewerData,
  );

  return (
    <AppSpaceShell
      activeSpace="explorer"
      contentClassName="min-w-0"
      focusModeAvailable
    >
      <LatentMapViewer data={viewerData} initialState={initialState} />
    </AppSpaceShell>
  );
}
