import { createLocalAnalysisResultStore } from "@/lib/analysis-result-store";
import {
  loadLatentMapRunExportedViewerData,
} from "@/lib/latent-map-run-data";
import type { AnalysisResultStatusSummary } from "@/lib/analysis-result-status";
import type { ExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

export type LoadedLatentMapAnalysisResultViewerData = {
  rawData: ExportedLatentMapViewerData;
  runDir: string;
  status: AnalysisResultStatusSummary;
};

export async function loadLatentMapAnalysisResultViewerData({
  additionalRunsRoots = [],
  analysisResultId,
  runsRoot,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
}: {
  additionalRunsRoots?: string[];
  analysisResultId: string;
  runsRoot: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
}): Promise<LoadedLatentMapAnalysisResultViewerData> {
  const store = createLocalAnalysisResultStore({ additionalRunsRoots, runsRoot });
  const runDir = await store.resolveRunDir(analysisResultId);

  if (!runDir) {
    throw new Error(`Analysis Result not found: ${analysisResultId}`);
  }

  const pinnedRecipeArtifacts = await store.loadPinnedLatentMapRecipeArtifacts({
    analysisResultId,
    selectedRecipeName,
  });

  return {
    rawData: await loadLatentMapRunExportedViewerData({
      pinnedArtifacts: pinnedRecipeArtifacts
        ? {
            ...(pinnedRecipeArtifacts.imageManifestKey
              ? { imageManifestKey: pinnedRecipeArtifacts.imageManifestKey }
              : {}),
            clusterKeys: pinnedRecipeArtifacts.clusterArtifacts.map(
              (artifact) => artifact.key,
            ),
            layoutKeys: pinnedRecipeArtifacts.layoutArtifacts.map(
              (artifact) => artifact.key,
            ),
            thumbnailAtlasManifestPaths:
              pinnedRecipeArtifacts.thumbnailAtlasManifestPaths,
            ...(pinnedRecipeArtifacts.vectorIdMapKey
              ? { vectorIdMapKey: pinnedRecipeArtifacts.vectorIdMapKey }
              : {}),
          }
        : null,
      runDir,
      selectedClusterId,
      selectedLayoutId,
      selectedRecipeName: pinnedRecipeArtifacts?.recipeName ?? selectedRecipeName,
    }),
    runDir,
    status: await store.loadStatus(analysisResultId),
  };
}
