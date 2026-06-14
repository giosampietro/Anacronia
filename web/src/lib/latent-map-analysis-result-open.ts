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
  analysisResultId,
  runsRoot,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
}: {
  analysisResultId: string;
  runsRoot: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
}): Promise<LoadedLatentMapAnalysisResultViewerData> {
  const store = createLocalAnalysisResultStore({ runsRoot });
  const runDir = await store.resolveRunDir(analysisResultId);

  if (!runDir) {
    throw new Error(`Analysis Result not found: ${analysisResultId}`);
  }

  return {
    rawData: await loadLatentMapRunExportedViewerData({
      runDir,
      selectedClusterId,
      selectedLayoutId,
      selectedRecipeName,
    }),
    runDir,
    status: await store.loadStatus(analysisResultId),
  };
}
