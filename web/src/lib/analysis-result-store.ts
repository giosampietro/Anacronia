import { access, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  summarizeAnalysisResultStatus,
  type AnalysisResultStatusState,
  type AnalysisResultStatusSummary,
} from "@/lib/analysis-result-status";

type AnalysisResultManifest = {
  analysis_result_id?: unknown;
  artifacts?: unknown;
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
  artifact_keys?: unknown;
  recipe_name?: unknown;
};

type AnalysisResultArtifact = {
  content_type?: unknown;
  key?: unknown;
  retention_class?: unknown;
  role?: unknown;
};

type FoundAnalysisResult = {
  manifest: AnalysisResultManifest;
  runDir: string;
};

export type LocalAnalysisResultListItem = {
  analysisResultId: string;
  canOpenExplorer: boolean;
  itemCount: number;
  recipeNames: string[];
  runId: string;
  sourceFolderName: string;
  state: AnalysisResultStatusState;
};

export type ResolvedAnalysisResultArtifact = {
  contentType: string;
  filePath: string;
};

export type AnalysisResultDeletionPlan = {
  analysisResultId: string;
  deleteDurableArtifactKeys: string[];
  deleteRenderCacheKeys: string[];
  missingArtifactKeys: string[];
  preserveArtifactKeys: string[];
  runDir: string;
};

export type AnalysisResultDeletionSummary = AnalysisResultDeletionPlan & {
  deleted: boolean;
  deletedAt: string;
  deletedDurableArtifactKeys: string[];
  deletedRenderCacheKeys: string[];
};

export type PinnedLatentMapArtifactOutput = {
  id: string;
  key: string;
};

export type PinnedLatentMapRecipeArtifacts = {
  baselineAtlasManifestKey?: string;
  clusterArtifacts: PinnedLatentMapArtifactOutput[];
  faissIdMapKey?: string;
  faissIndexKey?: string;
  imageManifestKey?: string;
  layoutArtifacts: PinnedLatentMapArtifactOutput[];
  recipeName: string;
  thumbnailAtlasManifestPaths: Record<string, string>;
  vectorIdMapKey?: string;
};

export class AnalysisResultStoreNotFoundError extends Error {
  constructor(analysisResultId: string) {
    super(`Analysis Result not found: ${analysisResultId}`);
    this.name = "AnalysisResultStoreNotFoundError";
  }
}

export class UnsafeAnalysisResultStoreArtifactKeyError extends Error {
  constructor(message = "Artifact key is outside the Analysis Result.") {
    super(message);
    this.name = "UnsafeAnalysisResultStoreArtifactKeyError";
  }
}

export type LocalAnalysisResultStore = ReturnType<
  typeof createLocalAnalysisResultStore
>;

const PRESERVED_ARTIFACT_ROLES = new Set([
  "embedding",
  "image-embedding-result",
  "permanent-derivative",
  "raw-provider-record",
  "source-derivative",
  "source-image",
]);

export function createLocalAnalysisResultStore({
  runsRoot,
}: {
  runsRoot: string;
}) {
  const resolvedRunsRoot = path.resolve(runsRoot);

  return {
    async deleteResult({
      analysisResultId,
      deletedAt = new Date(),
    }: {
      analysisResultId: string;
      deletedAt?: Date;
    }): Promise<AnalysisResultDeletionSummary> {
      const plan = await this.planDeletion(analysisResultId);
      const deletedDurableArtifactKeys = await deleteArtifacts({
        artifactKeys: plan.deleteDurableArtifactKeys,
        runDir: plan.runDir,
      });
      const deletedRenderCacheKeys = await deleteArtifacts({
        artifactKeys: plan.deleteRenderCacheKeys,
        runDir: plan.runDir,
      });
      const deletedAtText = deletedAt.toISOString();
      const manifest = await readManifest(plan.runDir);

      await writeFile(
        path.join(plan.runDir, "analysis-result.json"),
        `${JSON.stringify(
          {
            ...manifest,
            deleted_at: deletedAtText,
            deletion: {
              deleted_durable_artifact_keys: deletedDurableArtifactKeys,
              deleted_render_cache_keys: deletedRenderCacheKeys,
              missing_artifact_keys: plan.missingArtifactKeys,
              preserved_artifact_keys: plan.preserveArtifactKeys,
            },
            status: "deleted",
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      return {
        ...plan,
        deleted: true,
        deletedAt: deletedAtText,
        deletedDurableArtifactKeys,
        deletedRenderCacheKeys,
      };
    },

    async list(): Promise<LocalAnalysisResultListItem[]> {
      const entries = await safeReadDir(resolvedRunsRoot);
      const items = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry): Promise<LocalAnalysisResultListItem | null> => {
            const runDir = path.join(resolvedRunsRoot, entry.name);
            const manifest = await readManifest(runDir);

            if (!manifest || manifest.status === "deleted") {
              return null;
            }

            const analysisResultId = String(manifest.analysis_result_id ?? "");
            if (!analysisResultId) {
              return null;
            }

            const source = normalizeSource(manifest.source);
            const status = await loadStatusFromRunDir({ manifest, runDir });

            return {
              analysisResultId,
              canOpenExplorer: status.canOpenExplorer,
              itemCount: Number(manifest.item_count ?? 0),
              recipeNames: normalizeRecipeNames(manifest.recipes),
              runId: String(source.run_id ?? entry.name),
              sourceFolderName: String(source.source_folder_name ?? ""),
              state: status.state,
            };
          }),
      );

      return items
        .filter((item): item is LocalAnalysisResultListItem => item !== null)
        .sort((left, right) => right.runId.localeCompare(left.runId));
    },

    async loadStatus(
      analysisResultId: string,
    ): Promise<AnalysisResultStatusSummary> {
      const found = await findAnalysisResultManifest({
        analysisResultId,
        runsRoot: resolvedRunsRoot,
      });

      if (!found) {
        throw new AnalysisResultStoreNotFoundError(analysisResultId);
      }

      return loadStatusFromRunDir({
        manifest: found.manifest,
        runDir: found.runDir,
      });
    },

    async loadPinnedLatentMapRecipeArtifacts({
      analysisResultId,
      selectedRecipeName,
    }: {
      analysisResultId: string;
      selectedRecipeName?: string | null;
    }): Promise<PinnedLatentMapRecipeArtifacts | null> {
      const found = await findAnalysisResultManifest({
        analysisResultId,
        runsRoot: resolvedRunsRoot,
      });

      if (!found) {
        throw new AnalysisResultStoreNotFoundError(analysisResultId);
      }

      return getPinnedLatentMapRecipeArtifacts({
        manifest: found.manifest,
        selectedRecipeName,
      });
    },

    async resolveArtifact({
      analysisResultId,
      artifactKey,
    }: {
      analysisResultId: string;
      artifactKey: string;
    }): Promise<ResolvedAnalysisResultArtifact | null> {
      assertSafeArtifactKey(artifactKey);

      const found = await findAnalysisResultManifest({
        analysisResultId,
        runsRoot: resolvedRunsRoot,
      });

      if (!found) {
        return null;
      }

      const artifact = getManifestArtifacts(found.manifest).find(
        (candidate) => candidate.key === artifactKey,
      );

      if (!artifact) {
        return null;
      }

      return {
        contentType:
          typeof artifact.content_type === "string"
            ? artifact.content_type
            : inferContentType(artifactKey),
        filePath: resolveArtifactPath({
          artifactKey,
          runDir: found.runDir,
        }),
      };
    },

    async resolveRunDir(analysisResultId: string): Promise<string | null> {
      const found = await findAnalysisResultManifest({
        analysisResultId,
        runsRoot: resolvedRunsRoot,
      });

      return found?.runDir ?? null;
    },

    async planDeletion(
      analysisResultId: string,
    ): Promise<AnalysisResultDeletionPlan> {
      const found = await findAnalysisResultManifest({
        analysisResultId,
        runsRoot: resolvedRunsRoot,
      });

      if (!found) {
        throw new AnalysisResultStoreNotFoundError(analysisResultId);
      }

      const artifacts = getManifestArtifacts(found.manifest);
      const deleteDurableArtifactKeys: string[] = [];
      const deleteRenderCacheKeys: string[] = [];
      const preserveArtifactKeys: string[] = [];
      const missingArtifactKeys: string[] = [];

      await Promise.all(
        artifacts.map(async (artifact) => {
          if (typeof artifact.key !== "string") {
            return;
          }

          const artifactPath = resolveArtifactPath({
            artifactKey: artifact.key,
            runDir: found.runDir,
          });
          const exists = await artifactExists(artifactPath);

          if (!exists) {
            missingArtifactKeys.push(artifact.key);
          }

          if (PRESERVED_ARTIFACT_ROLES.has(String(artifact.role ?? ""))) {
            preserveArtifactKeys.push(artifact.key);
          } else if (artifact.retention_class === "render-cache") {
            deleteRenderCacheKeys.push(artifact.key);
          } else {
            deleteDurableArtifactKeys.push(artifact.key);
          }
        }),
      );

      return {
        analysisResultId,
        deleteDurableArtifactKeys: deleteDurableArtifactKeys.sort(compareKeys),
        deleteRenderCacheKeys: deleteRenderCacheKeys.sort(compareKeys),
        missingArtifactKeys: missingArtifactKeys.sort(compareKeys),
        preserveArtifactKeys: preserveArtifactKeys.sort(compareKeys),
        runDir: found.runDir,
      };
    },
  };
}

export function inferContentType(filePathOrKey: string): string {
  const extension = path.extname(filePathOrKey).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".json") {
    return "application/json";
  }
  if (extension === ".jsonl") {
    return "application/x-jsonlines";
  }

  return "image/jpeg";
}

export function assertSafeArtifactKey(artifactKey: string) {
  const normalized = path.posix.normalize(artifactKey);

  if (
    artifactKey.length === 0 ||
    artifactKey.includes("\\") ||
    path.isAbsolute(artifactKey) ||
    normalized !== artifactKey ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new UnsafeAnalysisResultStoreArtifactKeyError();
  }
}

export function resolveArtifactPath({
  artifactKey,
  runDir,
}: {
  artifactKey: string;
  runDir: string;
}): string {
  assertSafeArtifactKey(artifactKey);

  const resolvedRunDir = path.resolve(runDir);
  const artifactPath = path.resolve(resolvedRunDir, artifactKey);
  const allowedPrefix = `${resolvedRunDir}${path.sep}`;

  if (
    artifactPath !== resolvedRunDir &&
    !artifactPath.startsWith(allowedPrefix)
  ) {
    throw new UnsafeAnalysisResultStoreArtifactKeyError();
  }

  return artifactPath;
}

async function loadStatusFromRunDir({
  manifest,
  runDir,
}: {
  manifest: AnalysisResultManifest;
  runDir: string;
}): Promise<AnalysisResultStatusSummary> {
  const artifacts = getManifestArtifacts(manifest);
  const existingArtifactKeys = new Set<string>();

  await Promise.all(
    artifacts.map(async (artifact) => {
      if (typeof artifact.key !== "string") {
        return;
      }

      try {
        await access(resolveArtifactPath({ artifactKey: artifact.key, runDir }));
        existingArtifactKeys.add(artifact.key);
      } catch {
        // Missing artifacts are reported in the status summary.
      }
    }),
  );

  return summarizeAnalysisResultStatus({
    existingArtifactKeys,
    manifest,
  });
}

async function artifactExists(artifactPath: string): Promise<boolean> {
  try {
    await access(artifactPath);
    return true;
  } catch {
    return false;
  }
}

async function deleteArtifacts({
  artifactKeys,
  runDir,
}: {
  artifactKeys: string[];
  runDir: string;
}): Promise<string[]> {
  const deletedArtifactKeys: string[] = [];

  await Promise.all(
    artifactKeys.map(async (artifactKey) => {
      const artifactPath = resolveArtifactPath({ artifactKey, runDir });

      try {
        await unlink(artifactPath);
        deletedArtifactKeys.push(artifactKey);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }
    }),
  );

  return deletedArtifactKeys.sort(compareKeys);
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && error.code === "ENOENT";
}

function compareKeys(left: string, right: string) {
  return left.localeCompare(right);
}

async function findAnalysisResultManifest({
  analysisResultId,
  runsRoot,
}: {
  analysisResultId: string;
  runsRoot: string;
}): Promise<FoundAnalysisResult | null> {
  const directRunName = analysisResultId.startsWith("latent-map-")
    ? analysisResultId.slice("latent-map-".length)
    : "";
  const directRunDir = directRunName
    ? path.resolve(runsRoot, directRunName)
    : null;

  if (directRunDir) {
    const directManifest = await readManifestIfMatching({
      analysisResultId,
      runDir: directRunDir,
      runsRoot,
    });

    if (directManifest) {
      return directManifest;
    }
  }

  for (const entry of await safeReadDir(runsRoot)) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runDir = path.resolve(runsRoot, entry.name);
    if (directRunDir && runDir === directRunDir) {
      continue;
    }

    const manifest = await readManifestIfMatching({
      analysisResultId,
      runDir,
      runsRoot,
    });

    if (manifest) {
      return manifest;
    }
  }

  return null;
}

async function readManifestIfMatching({
  analysisResultId,
  runDir,
  runsRoot,
}: {
  analysisResultId: string;
  runDir: string;
  runsRoot: string;
}): Promise<FoundAnalysisResult | null> {
  const allowedPrefix = `${runsRoot}${path.sep}`;

  if (runDir !== runsRoot && !runDir.startsWith(allowedPrefix)) {
    return null;
  }

  const manifest = await readManifest(runDir);

  if (manifest?.analysis_result_id === analysisResultId) {
    return { manifest, runDir };
  }

  return null;
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

function getManifestArtifacts(
  manifest: AnalysisResultManifest,
): AnalysisResultArtifact[] {
  if (!Array.isArray(manifest.artifacts)) {
    return [];
  }

  return manifest.artifacts.filter(
    (artifact): artifact is AnalysisResultArtifact =>
      Boolean(
        artifact &&
          typeof artifact === "object" &&
          !Array.isArray(artifact) &&
          typeof (artifact as AnalysisResultArtifact).key === "string",
      ),
  );
}

function getPinnedLatentMapRecipeArtifacts({
  manifest,
  selectedRecipeName,
}: {
  manifest: AnalysisResultManifest;
  selectedRecipeName?: string | null;
}): PinnedLatentMapRecipeArtifacts | null {
  const recipes = getManifestRecipes(manifest).filter((recipe) =>
    Boolean(normalizePinnedArtifactKeys(recipe.artifact_keys)),
  );
  const recipe =
    recipes.find(
      (candidate) =>
        selectedRecipeName &&
        String(candidate.recipe_name ?? "") === selectedRecipeName,
    ) ?? recipes[0];

  if (!recipe) {
    return null;
  }

  const recipeName = String(recipe.recipe_name ?? "");
  const artifactKeys = normalizePinnedArtifactKeys(recipe.artifact_keys);

  if (!artifactKeys || !recipeName) {
    return null;
  }

  return {
    ...(artifactKeys.baselineAtlasManifestKey
      ? { baselineAtlasManifestKey: artifactKeys.baselineAtlasManifestKey }
      : {}),
    clusterArtifacts: artifactKeys.clusterArtifacts,
    ...(artifactKeys.faissIdMapKey
      ? { faissIdMapKey: artifactKeys.faissIdMapKey }
      : {}),
    ...(artifactKeys.faissIndexKey
      ? { faissIndexKey: artifactKeys.faissIndexKey }
      : {}),
    ...(artifactKeys.imageManifestKey
      ? { imageManifestKey: artifactKeys.imageManifestKey }
      : {}),
    layoutArtifacts: artifactKeys.layoutArtifacts,
    recipeName,
    thumbnailAtlasManifestPaths: artifactKeys.thumbnailAtlasManifestPaths,
    ...(artifactKeys.vectorIdMapKey
      ? { vectorIdMapKey: artifactKeys.vectorIdMapKey }
      : {}),
  };
}

function getManifestRecipes(
  manifest: AnalysisResultManifest,
): AnalysisResultRecipe[] {
  if (!Array.isArray(manifest.recipes)) {
    return [];
  }

  return manifest.recipes.filter(
    (recipe): recipe is AnalysisResultRecipe =>
      Boolean(recipe && typeof recipe === "object" && !Array.isArray(recipe)),
  );
}

function normalizePinnedArtifactKeys(value: unknown): {
  baselineAtlasManifestKey?: string;
  clusterArtifacts: PinnedLatentMapArtifactOutput[];
  faissIdMapKey?: string;
  faissIndexKey?: string;
  imageManifestKey?: string;
  layoutArtifacts: PinnedLatentMapArtifactOutput[];
  thumbnailAtlasManifestPaths: Record<string, string>;
  vectorIdMapKey?: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const imageManifestKey = optionalSafeKey(record.image_manifest);
  const baselineAtlasManifestKey = optionalSafeKey(record.baseline_atlas_manifest);
  const faissIdMapKey = optionalSafeKey(record.faiss_id_map);
  const faissIndexKey = optionalSafeKey(record.faiss_index);
  const vectorIdMapKey = optionalSafeKey(record.vector_id_map);
  const thumbnailAtlasManifestPaths = normalizeThumbnailAtlasManifestPaths(
    record.thumbnail_atlas_manifests,
  );
  const layoutArtifacts = normalizePinnedOutputs({
    idField: "layout_id",
    value: record.layouts,
  });
  const clusterArtifacts = normalizePinnedOutputs({
    idField: "cluster_id",
    value: record.clusters,
  });

  return {
    ...(baselineAtlasManifestKey ? { baselineAtlasManifestKey } : {}),
    clusterArtifacts,
    ...(imageManifestKey ? { imageManifestKey } : {}),
    ...(faissIdMapKey ? { faissIdMapKey } : {}),
    ...(faissIndexKey ? { faissIndexKey } : {}),
    layoutArtifacts,
    thumbnailAtlasManifestPaths,
    ...(vectorIdMapKey ? { vectorIdMapKey } : {}),
  };
}

function normalizePinnedOutputs({
  idField,
  value,
}: {
  idField: "cluster_id" | "layout_id";
  value: unknown;
}): PinnedLatentMapArtifactOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
    )
    .map((entry) => {
      const key = optionalSafeKey(entry.key);
      const id = String(entry[idField] ?? "");

      return key && id ? { id, key } : null;
    })
    .filter((entry): entry is PinnedLatentMapArtifactOutput => entry !== null);
}

function normalizeThumbnailAtlasManifestPaths(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const paths: Record<string, string> = {};
  for (const [tileSize, rawKey] of Object.entries(value)) {
    const key = optionalSafeKey(rawKey);

    if (/^\d+$/.test(tileSize) && key) {
      paths[tileSize] = key;
    }
  }

  return paths;
}

function optionalSafeKey(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  assertSafeArtifactKey(value);
  return value;
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
