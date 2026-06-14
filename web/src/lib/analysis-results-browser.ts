import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { loadAnalysisResultStatus } from "@/lib/analysis-result-status";
import type { AnalysisResultStatusState } from "@/lib/analysis-result-status";

type AnalysisResultManifest = {
  analysis_result_id?: unknown;
  item_count?: unknown;
  recipes?: unknown;
  source?: unknown;
  status?: unknown;
};

type AnalysisResultSource = {
  run_id?: unknown;
  source_folder_name?: unknown;
};

type AnalysisResultRecipe = {
  recipe_name?: unknown;
};

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
  const resolvedRunsRoot = path.resolve(runsRoot);
  const entries = await safeReadDir(resolvedRunsRoot);
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<AnalysisResultListItem | null> => {
        const runDir = path.join(resolvedRunsRoot, entry.name);
        const manifest = await readManifest(runDir);

        if (!manifest) {
          return null;
        }

        const analysisResultId = String(manifest.analysis_result_id ?? "");
        if (!analysisResultId) {
          return null;
        }
        if (manifest.status === "deleted") {
          return null;
        }

        const source = normalizeSource(manifest.source);
        const status = await loadAnalysisResultStatus({ runDir });

        return {
          analysisResultId,
          canOpenExplorer: status.canOpenExplorer,
          explorerHref: `/latent-map?analysisResultId=${encodeURIComponent(
            analysisResultId,
          )}`,
          itemCount: Number(manifest.item_count ?? 0),
          recipeNames: normalizeRecipeNames(manifest.recipes),
          runId: String(source.run_id ?? entry.name),
          sourceFolderName: String(source.source_folder_name ?? ""),
          state: status.state,
        };
      }),
  );

  return items
    .filter((item): item is AnalysisResultListItem => item !== null)
    .sort((left, right) => right.runId.localeCompare(left.runId));
}

async function readManifest(
  runDir: string,
): Promise<AnalysisResultManifest | null> {
  try {
    return JSON.parse(
      await readFile(path.join(runDir, "analysis-result.json"), "utf-8"),
    ) as AnalysisResultManifest;
  } catch {
    return null;
  }
}

function normalizeRecipeNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((recipe) =>
      recipe && typeof recipe === "object" && !Array.isArray(recipe)
        ? String((recipe as AnalysisResultRecipe).recipe_name ?? "")
        : "",
    )
    .filter((recipeName) => recipeName.length > 0);
}

function normalizeSource(value: unknown): AnalysisResultSource {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnalysisResultSource)
    : {};
}

async function safeReadDir(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
