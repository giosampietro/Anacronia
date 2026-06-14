import { createLocalAnalysisResultStore } from "@/lib/analysis-result-store";
import type { AnalysisResultStatusState } from "@/lib/analysis-result-status";

export type AnalysisResultListItem = {
  analysisResultId: string;
  canOpenExplorer: boolean;
  explorerHref: string;
  itemCount: number;
  recipeNames: string[];
  runId: string;
  sourceFolderName: string;
  state: AnalysisResultStatusState;
};

export async function listAnalysisResults({
  runsRoot,
}: {
  runsRoot: string;
}): Promise<AnalysisResultListItem[]> {
  const store = createLocalAnalysisResultStore({ runsRoot });
  const items = await store.list();

  return items.map((item) => ({
    ...item,
    explorerHref: `/latent-map?analysisResultId=${encodeURIComponent(
      item.analysisResultId,
    )}`,
  }));
}
