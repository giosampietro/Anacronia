import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  encodedTextByteLength,
  type LatentMapStartupRecorder,
} from "@/lib/latent-map-startup-measurement";
import type { ExportedLatentMapViewerData } from "@/lib/latent-map-viewer-data";

export const LATENT_MAP_RUNS_ROOT = "/private/tmp/anacronia-latent-map-runs";

type ManifestRow = {
  height?: unknown;
  image_id?: unknown;
  preview_path?: unknown;
  relative_path?: unknown;
  thumbnail_path?: unknown;
  width?: unknown;
};

type LayoutFile = {
  layout_id?: unknown;
  method?: unknown;
  params?: unknown;
  points?: { image_id?: unknown; x?: unknown; y?: unknown }[];
  recipe_name?: unknown;
  run_id?: unknown;
};

type ClusterFile = {
  asset_kind?: unknown;
  cluster_count?: unknown;
  cluster_id?: unknown;
  groups?: unknown;
  label?: unknown;
  method?: unknown;
  params?: unknown;
  points?: {
    cluster_id?: unknown;
    group_key?: unknown;
    image_id?: unknown;
    membership?: unknown;
  }[];
  random_state?: unknown;
  recipe_name?: unknown;
  run_id?: unknown;
  schema_version?: unknown;
  unassigned_count?: unknown;
};

type EmbeddingMetadata = {
  family?: unknown;
  label?: unknown;
  long_edge?: unknown;
  model_id?: unknown;
  recipe_name?: unknown;
};

type LoadedRunOutput<T> = {
  fileName: string;
  path: string;
  value: T;
};

type LoadedRecipe = NonNullable<
  ExportedLatentMapViewerData["available_recipes"]
>[number] & {
  family: string;
  long_edge: number | null;
  model_id: string;
  recipe_name: string;
};

type AnalysisResultArtifactSummary = {
  key?: unknown;
  role?: unknown;
};

type AnalysisResultRecipeRecord = {
  artifact_keys?: unknown;
  recipe?: unknown;
  recipe_name?: unknown;
};

type LoadedAnalysisResultRecipe = LoadedRecipe & {
  clusterKeys: string[];
  imageManifestKey: string | null;
  layoutKeys: string[];
  thumbnailAtlasManifestPaths: Record<string, string>;
  vectorIdMapKey: string | null;
};
type LoadedThumbnailAtlas = NonNullable<
  ExportedLatentMapViewerData["thumbnail_atlases"]
>[number];

export type PinnedLatentMapRunArtifacts = {
  clusterKeys?: string[];
  imageManifestKey?: string;
  layoutKeys?: string[];
  thumbnailAtlasManifestPaths?: Record<string, string>;
  vectorIdMapKey?: string;
};

export async function loadLatentMapAnalysisResultExportedViewerData({
  analysisResult,
  loadThumbnailAtlases = true,
  readArtifactText,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
  startupRecorder,
}: {
  analysisResult: {
    analysis_result_id?: unknown;
    artifacts?: unknown;
    recipes?: unknown;
    scope_label?: unknown;
  };
  loadThumbnailAtlases?: boolean;
  readArtifactText: (artifactKey: string, artifactRole?: string) => Promise<string>;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
  startupRecorder?: LatentMapStartupRecorder;
}): Promise<ExportedLatentMapViewerData> {
  const artifacts = normalizeAnalysisResultArtifacts(analysisResult.artifacts);
  const availableRecipes = normalizeAnalysisResultRecipes(analysisResult.recipes);
  const selectedRecipe =
    pickExisting(
      availableRecipes.map((recipe) => recipe.recipe_name),
      selectedRecipeName,
    ) ?? availableRecipes[0]?.recipe_name;

  if (!selectedRecipe) {
    throw new Error("Analysis Result has no embedding recipes.");
  }

  const selectedRecipeRecord = availableRecipes.find(
    (recipe) => recipe.recipe_name === selectedRecipe,
  );
  const imageManifestKey =
    selectedRecipeRecord?.imageManifestKey ??
    firstArtifactKeyByRole(artifacts, "image-manifest");
  const layoutKeys =
    selectedRecipeRecord !== undefined &&
    selectedRecipeRecord.layoutKeys.length > 0
      ? selectedRecipeRecord.layoutKeys
      : artifactKeysByRole(artifacts, "layout");
  const clusterKeys =
    selectedRecipeRecord !== undefined &&
    selectedRecipeRecord.clusterKeys.length > 0
      ? selectedRecipeRecord.clusterKeys
      : artifactKeysByRole(artifacts, "cluster-result");
  const vectorIdMapKey = selectedRecipeRecord?.vectorIdMapKey ?? null;

  if (!imageManifestKey) {
    throw new Error("Analysis Result has no image manifest artifact.");
  }

  const manifestContent = await readArtifactText(
    imageManifestKey,
    "image-manifest",
  );
  const manifestRows = measureStartupSync(
    startupRecorder,
    "analysis-result-artifact-parse",
    {
      artifactKey: imageManifestKey,
      artifactRole: "image-manifest",
      bytes: encodedTextByteLength(manifestContent),
    },
    () => parseJsonLines<ManifestRow>(manifestContent),
  );
  const layouts = await loadRunOutputsByArtifactKeys<LayoutFile>({
    artifactRole: "layout",
    keys: layoutKeys,
    readArtifactText,
    recipeName: selectedRecipe,
    startupRecorder,
  });
  const clusters = sortClusterOutputs(
    await loadRunOutputsByArtifactKeys<ClusterFile>({
      artifactRole: "cluster-result",
      keys: clusterKeys,
      readArtifactText,
      recipeName: selectedRecipe,
      startupRecorder,
    }),
  );
  const layout = pickOutputById({
    idField: "layout_id",
    outputs: layouts,
    selectedId: selectedLayoutId,
  });
  const cluster = pickOutputById({
    idField: "cluster_id",
    outputs: clusters,
    selectedId: selectedClusterId,
  });

  if (!layout) {
    throw new Error(`Analysis Result has no layout for ${selectedRecipe}.`);
  }
  if (!cluster) {
    throw new Error(`Analysis Result has no cluster result for ${selectedRecipe}.`);
  }

  if (vectorIdMapKey) {
    const vectorContent = await readArtifactText(vectorIdMapKey, "vector-id-map");
    const vectorImageIds = measureStartupSync(
      startupRecorder,
      "analysis-result-artifact-parse",
      {
        artifactKey: vectorIdMapKey,
        artifactRole: "vector-id-map",
        bytes: encodedTextByteLength(vectorContent),
      },
      () => parseImageIdOrderMap(vectorContent),
    );

    measureStartupSync(
      startupRecorder,
      "vector-id-map-validation",
      {
        clusterId: String(cluster.value.cluster_id ?? ""),
        layoutId: String(layout.value.layout_id ?? ""),
        pointCount: vectorImageIds.length,
      },
      () => {
        validatePinnedPointOrder({
          artifactLabel: `layout ${String(layout.value.layout_id ?? "")}`,
          expectedImageIds: vectorImageIds,
          points: layout.value.points ?? [],
        });
        validatePinnedPointOrder({
          artifactLabel: `cluster ${String(cluster.value.cluster_id ?? "")}`,
          expectedImageIds: vectorImageIds,
          points: cluster.value.points ?? [],
        });
      },
    );
  }

  const points = measureStartupSync(
    startupRecorder,
    "analysis-result-viewer-normalization",
    {
      pointCount: layout.value.points?.length ?? 0,
      recipeName: selectedRecipe,
    },
    () => {
      const manifestByImageId = new Map(
        manifestRows.map((row) => [String(row.image_id ?? ""), row]),
      );
      const clusterByImageId = new Map(
        (cluster.value.points ?? []).map((point) => [
          String(point.image_id ?? ""),
          point,
        ]),
      );

      return (layout.value.points ?? []).map((point) => {
        const imageId = String(point.image_id ?? "");
        const manifestRow = manifestByImageId.get(imageId);
        const clusterPoint = clusterByImageId.get(imageId);

        return {
          cluster_id: Number(clusterPoint?.cluster_id ?? 0),
          ...(typeof clusterPoint?.group_key === "string" &&
          clusterPoint.group_key.length > 0
            ? { cluster_group_key: clusterPoint.group_key }
            : {}),
          ...(typeof clusterPoint?.membership === "number"
            ? { cluster_membership: clusterPoint.membership }
            : {}),
          height: Number(manifestRow?.height ?? 1),
          image_id: imageId,
          preview_path: String(
            manifestRow?.preview_path ?? manifestRow?.thumbnail_path ?? "",
          ),
          relative_path: String(manifestRow?.relative_path ?? ""),
          thumbnail_path: String(manifestRow?.thumbnail_path ?? ""),
          width: Number(manifestRow?.width ?? 1),
          x: Number(point.x ?? 0),
          y: Number(point.y ?? 0),
        };
      });
    },
  );
  const thumbnailAtlasManifestPaths =
    selectedRecipeRecord?.thumbnailAtlasManifestPaths ?? {};
  const thumbnailAtlases = loadThumbnailAtlases
    ? await loadThumbnailAtlasesFromArtifacts({
        manifestPaths: thumbnailAtlasManifestPaths,
        readArtifactText,
        startupRecorder,
      })
    : [];
  const thumbnailAtlas =
    thumbnailAtlases.find((atlas) => atlas.tile_size === 64) ??
    thumbnailAtlases[0];

  return {
    available_clusters: clusters.map((output) =>
      buildAvailableCluster(output.value),
    ),
    available_layouts: layouts.map((output) => ({
      layout_id: String(output.value.layout_id ?? ""),
      method: String(output.value.method ?? ""),
      params: objectOrEmpty(output.value.params),
    })),
    available_recipes: availableRecipes,
    cluster_id: String(cluster.value.cluster_id ?? ""),
    cluster_result: buildAvailableCluster(cluster.value),
    layout_id: String(layout.value.layout_id ?? ""),
    points,
    recipe_name: selectedRecipe,
    run_id: String(analysisResult.analysis_result_id ?? "analysis-result"),
    ...(thumbnailAtlas ? { thumbnail_atlas: thumbnailAtlas } : {}),
    ...(thumbnailAtlases.length > 0 ? { thumbnail_atlases: thumbnailAtlases } : {}),
    ...(Object.keys(thumbnailAtlasManifestPaths).length > 0
      ? { thumbnail_atlas_manifest_paths: thumbnailAtlasManifestPaths }
      : {}),
  };
}

export async function loadLatentMapRunExportedViewerData({
  pinnedArtifacts,
  runDir,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
}: {
  pinnedArtifacts?: PinnedLatentMapRunArtifacts | null;
  runDir: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
}): Promise<ExportedLatentMapViewerData> {
  const resolvedRunDir = path.resolve(runDir);
  const manifestRows = await readJsonLines<ManifestRow>(
    path.join(resolvedRunDir, pinnedArtifacts?.imageManifestKey ?? "manifest.jsonl"),
  );
  const availableRecipes = await loadAvailableRecipes(resolvedRunDir);
  const selectedRecipe =
    pickExisting(
      availableRecipes.map((recipe) => recipe.recipe_name),
      selectedRecipeName,
    ) ?? availableRecipes[0]?.recipe_name;

  if (!selectedRecipe) {
    throw new Error("Latent map run has no embedding recipes.");
  }

  const layouts = pinnedArtifacts?.layoutKeys
    ? await loadRunOutputsByKeys<LayoutFile>({
        keys: pinnedArtifacts.layoutKeys,
        recipeName: selectedRecipe,
        runDir: resolvedRunDir,
      })
    : await loadRunOutputs<LayoutFile>({
        dir: path.join(resolvedRunDir, "layouts"),
        recipeName: selectedRecipe,
      });
  const clusters = sortClusterOutputs(
    pinnedArtifacts?.clusterKeys
      ? await loadRunOutputsByKeys<ClusterFile>({
          keys: pinnedArtifacts.clusterKeys,
          recipeName: selectedRecipe,
          runDir: resolvedRunDir,
        })
      : await loadRunOutputs<ClusterFile>({
          dir: path.join(resolvedRunDir, "clusters"),
          recipeName: selectedRecipe,
        }),
  );
  const layout = pickOutputById({
    idField: "layout_id",
    outputs: layouts,
    selectedId: selectedLayoutId,
  });
  const cluster = pickOutputById({
    idField: "cluster_id",
    outputs: clusters,
    selectedId: selectedClusterId,
  });

  if (!layout) {
    throw new Error(`Latent map run has no layout for ${selectedRecipe}.`);
  }
  if (!cluster) {
    throw new Error(`Latent map run has no cluster result for ${selectedRecipe}.`);
  }

  if (pinnedArtifacts?.vectorIdMapKey) {
    const vectorImageIds = await readImageIdOrderMap(
      path.join(resolvedRunDir, pinnedArtifacts.vectorIdMapKey),
      pinnedArtifacts.vectorIdMapKey,
    );

    validatePinnedPointOrder({
      artifactLabel: `layout ${String(layout.value.layout_id ?? "")}`,
      expectedImageIds: vectorImageIds,
      points: layout.value.points ?? [],
    });
    validatePinnedPointOrder({
      artifactLabel: `cluster ${String(cluster.value.cluster_id ?? "")}`,
      expectedImageIds: vectorImageIds,
      points: cluster.value.points ?? [],
    });
  }

  const manifestByImageId = new Map(
    manifestRows.map((row) => [String(row.image_id ?? ""), row]),
  );
  const clusterByImageId = new Map(
    (cluster.value.points ?? []).map((point) => [
      String(point.image_id ?? ""),
      point,
    ]),
  );
  const thumbnailAtlasManifestPaths =
    pinnedArtifacts?.thumbnailAtlasManifestPaths &&
    Object.keys(pinnedArtifacts.thumbnailAtlasManifestPaths).length > 0
      ? pinnedArtifacts.thumbnailAtlasManifestPaths
      : await findThumbnailAtlasManifestPaths(resolvedRunDir);
  const thumbnailAtlasManifestPath =
    thumbnailAtlasManifestPaths["64"] ??
    Object.values(thumbnailAtlasManifestPaths)[0];

  return {
    available_clusters: clusters.map((output) =>
      buildAvailableCluster(output.value),
    ),
    available_layouts: layouts.map((output) => ({
      layout_id: String(output.value.layout_id ?? ""),
      method: String(output.value.method ?? ""),
      params: objectOrEmpty(output.value.params),
    })),
    available_recipes: availableRecipes,
    cluster_id: String(cluster.value.cluster_id ?? ""),
    cluster_result: buildAvailableCluster(cluster.value),
    layout_id: String(layout.value.layout_id ?? ""),
    points: (layout.value.points ?? []).map((point) => {
      const imageId = String(point.image_id ?? "");
      const manifestRow = manifestByImageId.get(imageId);
      const clusterPoint = clusterByImageId.get(imageId);

      return {
        cluster_id: Number(clusterPoint?.cluster_id ?? 0),
        ...(typeof clusterPoint?.group_key === "string" &&
        clusterPoint.group_key.length > 0
          ? { cluster_group_key: clusterPoint.group_key }
          : {}),
        ...(typeof clusterPoint?.membership === "number"
          ? { cluster_membership: clusterPoint.membership }
          : {}),
        height: Number(manifestRow?.height ?? 1),
        image_id: imageId,
        preview_path: String(
          manifestRow?.preview_path ?? manifestRow?.thumbnail_path ?? "",
        ),
        relative_path: String(manifestRow?.relative_path ?? ""),
        thumbnail_path: String(manifestRow?.thumbnail_path ?? ""),
        width: Number(manifestRow?.width ?? 1),
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
      };
    }),
    recipe_name: selectedRecipe,
    run_id: String(layout.value.run_id ?? path.basename(resolvedRunDir)),
    ...(thumbnailAtlasManifestPath
      ? { thumbnail_atlas_manifest_path: thumbnailAtlasManifestPath }
      : {}),
    ...(Object.keys(thumbnailAtlasManifestPaths).length > 0
      ? { thumbnail_atlas_manifest_paths: thumbnailAtlasManifestPaths }
      : {}),
  };
}

function buildAvailableCluster(cluster: ClusterFile) {
  return {
    ...(typeof cluster.asset_kind === "string" && cluster.asset_kind.length > 0
      ? { asset_kind: cluster.asset_kind }
      : {}),
    cluster_count: numberOrNull(cluster.cluster_count),
    cluster_id: String(cluster.cluster_id ?? ""),
    ...(Array.isArray(cluster.groups)
      ? { groups: normalizeClusterGroups(cluster.groups) }
      : {}),
    ...(typeof cluster.label === "string" && cluster.label.length > 0
      ? { label: cluster.label }
      : {}),
    method: String(cluster.method ?? ""),
    ...(cluster.params &&
    typeof cluster.params === "object" &&
    !Array.isArray(cluster.params)
      ? { params: cluster.params as Record<string, unknown> }
      : {}),
    random_state: numberOrNull(cluster.random_state),
    ...(typeof cluster.schema_version === "number"
      ? { schema_version: cluster.schema_version }
      : {}),
    ...(typeof cluster.unassigned_count === "number"
      ? { unassigned_count: cluster.unassigned_count }
      : {}),
  };
}

function normalizeClusterGroups(groups: unknown[]) {
  return groups
    .filter((group): group is Record<string, unknown> =>
      Boolean(group && typeof group === "object" && !Array.isArray(group)),
    )
    .map((group) => ({
      cluster_id: Number(group.cluster_id ?? 0),
      count: Number(group.count ?? 0),
      group_key: String(group.group_key ?? group.cluster_id ?? ""),
      kind: group.kind === "unassigned" ? "unassigned" : "cluster",
      label: String(
        group.label ??
          (group.kind === "unassigned"
            ? "Unassigned"
            : `Group ${String(group.cluster_id ?? "")}`),
      ),
    }))
    .filter((group) => group.group_key.length > 0);
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, "utf-8");

  return parseJsonLines<T>(content);
}

function parseJsonLines<T>(content: string): T[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function measureStartupSync<T>(
  startupRecorder: LatentMapStartupRecorder | undefined,
  name: string,
  metadata: Record<string, boolean | number | string | null | undefined>,
  operation: () => T,
): T {
  return startupRecorder
    ? startupRecorder.timeSync(name, metadata, operation)
    : operation();
}

function normalizeAnalysisResultArtifacts(
  value: unknown,
): AnalysisResultArtifactSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (artifact): artifact is AnalysisResultArtifactSummary =>
      Boolean(artifact && typeof artifact === "object" && !Array.isArray(artifact)),
  );
}

function normalizeAnalysisResultRecipes(
  value: unknown,
): LoadedAnalysisResultRecipe[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((recipe): recipe is AnalysisResultRecipeRecord =>
      Boolean(recipe && typeof recipe === "object" && !Array.isArray(recipe)),
    )
    .map((recipe) => {
      const recipeName = String(recipe.recipe_name ?? "");
      const recipeMetadata = objectOrEmpty(recipe.recipe);
      const artifactKeys = objectOrEmpty(recipe.artifact_keys);

      return {
        clusterKeys: artifactKeyRecordsToKeys(artifactKeys.clusters),
        family: String(
          recipeMetadata.model_family ??
            recipeMetadata.family ??
            inferRecipeFamily(recipeName),
        ),
        imageManifestKey: nonEmptyString(artifactKeys.image_manifest),
        layoutKeys: artifactKeyRecordsToKeys(artifactKeys.layouts),
        long_edge:
          typeof recipeMetadata.input_size === "number"
            ? recipeMetadata.input_size
            : typeof recipeMetadata.long_edge === "number"
              ? recipeMetadata.long_edge
              : inferLongEdge(recipeName),
        model_id: String(recipeMetadata.model_id ?? ""),
        recipe_name: recipeName,
        thumbnailAtlasManifestPaths: stringRecord(
          artifactKeys.thumbnail_atlas_manifests,
        ),
        vectorIdMapKey: nonEmptyString(artifactKeys.vector_id_map),
      };
    })
    .filter((recipe) => recipe.recipe_name.length > 0)
    .sort((left, right) => left.recipe_name.localeCompare(right.recipe_name));
}

function artifactKeyRecordsToKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? nonEmptyString((item as { key?: unknown }).key)
        : null,
    )
    .filter((key): key is string => key !== null);
}

function artifactKeysByRole(
  artifacts: AnalysisResultArtifactSummary[],
  role: string,
): string[] {
  return artifacts
    .filter((artifact) => artifact.role === role)
    .map((artifact) => nonEmptyString(artifact.key))
    .filter((key): key is string => key !== null);
}

function firstArtifactKeyByRole(
  artifacts: AnalysisResultArtifactSummary[],
  role: string,
): string | null {
  return artifactKeysByRole(artifacts, role)[0] ?? null;
}

async function loadRunOutputsByArtifactKeys<T extends { recipe_name?: unknown }>({
  artifactRole,
  keys,
  readArtifactText,
  recipeName,
  startupRecorder,
}: {
  artifactRole: string;
  keys: string[];
  readArtifactText: (artifactKey: string, artifactRole?: string) => Promise<string>;
  recipeName: string;
  startupRecorder?: LatentMapStartupRecorder;
}): Promise<LoadedRunOutput<T>[]> {
  const outputs = await Promise.all(
    keys.map(async (key) => {
      const content = await readArtifactText(key, artifactRole);
      const value = measureStartupSync(
        startupRecorder,
        "analysis-result-artifact-parse",
        {
          artifactKey: key,
          artifactRole,
          bytes: encodedTextByteLength(content),
        },
        () => JSON.parse(content) as T,
      );

      return {
        fileName: path.basename(key),
        path: key,
        value,
      };
    }),
  );

  return outputs.filter(
    (output) => String(output.value.recipe_name ?? "") === recipeName,
  );
}

function parseImageIdOrderMap(content: string): string[] {
  const value = JSON.parse(content) as unknown;

  if (Array.isArray(value)) {
    return value.map((row) => {
      if (row && typeof row === "object" && "image_id" in row) {
        return String(row.image_id ?? "");
      }

      return String(row);
    });
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ids = Array.isArray(record.ids)
      ? record.ids
      : Array.isArray(record.image_ids)
        ? record.image_ids
        : [];

    return ids.map((imageId) => String(imageId));
  }

  return [];
}

async function loadThumbnailAtlasesFromArtifacts({
  manifestPaths,
  readArtifactText,
  startupRecorder,
}: {
  manifestPaths: Record<string, string>;
  readArtifactText: (artifactKey: string, artifactRole?: string) => Promise<string>;
  startupRecorder?: LatentMapStartupRecorder;
}): Promise<LoadedThumbnailAtlas[]> {
  const atlases = await Promise.all(
    Object.values(manifestPaths).map(async (artifactKey) => {
      try {
        const content = await readArtifactText(artifactKey, "thumbnail-atlas");

        return measureStartupSync(
          startupRecorder,
          "analysis-result-artifact-parse",
          {
            artifactKey,
            artifactRole: "thumbnail-atlas",
            bytes: encodedTextByteLength(content),
          },
          () => JSON.parse(content) as LoadedThumbnailAtlas,
        );
      } catch {
        return null;
      }
    }),
  );

  return atlases.filter((atlas): atlas is LoadedThumbnailAtlas => atlas !== null);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, nonEmptyString(entry)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  );
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function loadAvailableRecipes(
  runDir: string,
): Promise<LoadedRecipe[]> {
  const embeddingDir = path.join(runDir, "embeddings");
  const fileNames = await listJsonFiles(embeddingDir);
  const recipesByName = new Map<string, LoadedRecipe>();
  const recipes = await Promise.all(
    fileNames.map(async (fileName): Promise<LoadedRecipe> => {
      const metadata = JSON.parse(
        await readFile(path.join(embeddingDir, fileName), "utf-8"),
      ) as EmbeddingMetadata;
      const recipeName = String(
        metadata.recipe_name ?? path.basename(fileName, ".json"),
      );

      return {
        family: String(metadata.family ?? inferRecipeFamily(recipeName)),
        ...(typeof metadata.label === "string" && metadata.label.length > 0
          ? { label: metadata.label }
          : {}),
        long_edge:
          typeof metadata.long_edge === "number"
            ? metadata.long_edge
            : inferLongEdge(recipeName),
        model_id: String(metadata.model_id ?? ""),
        recipe_name: recipeName,
      };
    }),
  );

  recipes.forEach((recipe) => {
    recipesByName.set(recipe.recipe_name, recipe);
  });

  for (const recipeName of await inferAvailableRecipeNames(runDir)) {
    if (!recipesByName.has(recipeName)) {
      recipesByName.set(recipeName, {
        family: inferRecipeFamily(recipeName),
        long_edge: inferLongEdge(recipeName),
        model_id: "",
        recipe_name: recipeName,
      });
    }
  }

  return [...recipesByName.values()].sort((left, right) =>
    left.recipe_name.localeCompare(right.recipe_name),
  );
}

async function inferAvailableRecipeNames(runDir: string): Promise<string[]> {
  const recipeNames = new Set<string>();
  const [layoutFiles, clusterFiles, indexFiles] = await Promise.all([
    listJsonFiles(path.join(runDir, "layouts")),
    listJsonFiles(path.join(runDir, "clusters")),
    safeReadDir(path.join(runDir, "indexes")),
  ]);

  const recipeOutputPaths = [
    ...layoutFiles.map((fileName) => path.join("layouts", fileName)),
      ...clusterFiles.map((fileName) => path.join("clusters", fileName)),
  ];

  await Promise.all(
    recipeOutputPaths.map(async (relativePath) => {
      try {
        const value = JSON.parse(
          await readFile(path.join(runDir, relativePath), "utf-8"),
        ) as { recipe_name?: unknown };
        const recipeName = String(value.recipe_name ?? "");

        if (recipeName) {
          recipeNames.add(recipeName);
        }
      } catch {
        // Ignore malformed auxiliary outputs while discovering selectable recipes.
      }
    }),
  );

  indexFiles.forEach((fileName) => {
    const match = /^(.+?)_(?:flat_ip\.faiss|faiss_id_map\.json)$/.exec(
      fileName,
    );

    if (match) {
      recipeNames.add(match[1]);
    }
  });

  return [...recipeNames].sort((left, right) => left.localeCompare(right));
}

async function loadRunOutputs<T extends { recipe_name?: unknown }>({
  dir,
  recipeName,
}: {
  dir: string;
  recipeName: string;
}): Promise<LoadedRunOutput<T>[]> {
  const fileNames = await listJsonFiles(dir);
  const outputs = await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(dir, fileName);
      const value = JSON.parse(await readFile(filePath, "utf-8")) as T;

      return {
        fileName,
        path: filePath,
        value,
      };
    }),
  );

  return outputs
    .filter((output) => String(output.value.recipe_name ?? "") === recipeName)
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

async function loadRunOutputsByKeys<T extends { recipe_name?: unknown }>({
  keys,
  recipeName,
  runDir,
}: {
  keys: string[];
  recipeName: string;
  runDir: string;
}): Promise<LoadedRunOutput<T>[]> {
  const outputs = await Promise.all(
    keys.map(async (key) => {
      const filePath = path.join(runDir, key);
      let content: string;

      try {
        content = await readFile(filePath, "utf-8");
      } catch (error) {
        if (isMissingFileError(error)) {
          throw new Error(`Pinned Analysis Result artifact is missing: ${key}`);
        }

        throw error;
      }

      const value = JSON.parse(content) as T;

      return {
        fileName: path.basename(key),
        path: filePath,
        value,
      };
    }),
  );

  return outputs.filter(
    (output) => String(output.value.recipe_name ?? "") === recipeName,
  );
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && error.code === "ENOENT";
}

async function readImageIdOrderMap(
  filePath: string,
  artifactKey: string,
): Promise<string[]> {
  let content: string;

  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`Pinned Analysis Result artifact is missing: ${artifactKey}`);
    }

    throw error;
  }

  const value = JSON.parse(content) as unknown;

  if (Array.isArray(value)) {
    return value.map((row) => {
      if (row && typeof row === "object" && "image_id" in row) {
        return String(row.image_id ?? "");
      }

      return String(row);
    });
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ids = Array.isArray(record.ids)
      ? record.ids
      : Array.isArray(record.image_ids)
        ? record.image_ids
        : [];

    return ids.map((imageId) => String(imageId));
  }

  return [];
}

function validatePinnedPointOrder({
  artifactLabel,
  expectedImageIds,
  points,
}: {
  artifactLabel: string;
  expectedImageIds: string[];
  points: { image_id?: unknown }[];
}) {
  const pointImageIds = points.map((point) => String(point.image_id ?? ""));

  if (
    pointImageIds.length !== expectedImageIds.length ||
    pointImageIds.some((imageId, index) => imageId !== expectedImageIds[index])
  ) {
    throw new Error(`Pinned Analysis Result row order mismatch for ${artifactLabel}.`);
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function pickExisting(
  values: string[],
  selectedValue: string | null | undefined,
): string | undefined {
  return selectedValue && values.includes(selectedValue)
    ? selectedValue
    : undefined;
}

function sortClusterOutputs(
  outputs: LoadedRunOutput<ClusterFile>[],
): LoadedRunOutput<ClusterFile>[] {
  return [...outputs].sort((left, right) => {
    const leftMethod = String(left.value.method ?? "").toLowerCase();
    const rightMethod = String(right.value.method ?? "").toLowerCase();
    const leftRank = getClusterMethodOrder(leftMethod);
    const rightRank = getClusterMethodOrder(rightMethod);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const graphCommunityPresetDelta =
      getGraphCommunityPresetOrder(String(left.value.label ?? "")) -
      getGraphCommunityPresetOrder(String(right.value.label ?? ""));

    if (graphCommunityPresetDelta !== 0) {
      return graphCommunityPresetDelta;
    }

    const hierarchyPresetDelta =
      getHierarchyPresetOrder(String(left.value.label ?? "")) -
      getHierarchyPresetOrder(String(right.value.label ?? ""));

    if (hierarchyPresetDelta !== 0) {
      return hierarchyPresetDelta;
    }

    const presetDelta =
      getHdbscanPresetOrder(String(left.value.label ?? "")) -
      getHdbscanPresetOrder(String(right.value.label ?? ""));

    if (presetDelta !== 0) {
      return presetDelta;
    }

    return left.fileName.localeCompare(right.fileName);
  });
}

function getClusterMethodOrder(method: string): number {
  if (method === "graph_communities") {
    return 0;
  }
  if (method === "hierarchy") {
    return 1;
  }
  if (method === "hdbscan") {
    return 2;
  }
  if (method === "kmeans") {
    return 3;
  }

  return 4;
}

function getGraphCommunityPresetOrder(label: string): number {
  const labels = new Map([
    ["Graph communities · Broad", 0],
    ["Graph communities · Balanced", 1],
    ["Graph communities · Detail", 2],
    ["Graph communities · Fine", 3],
  ]);

  return labels.get(label) ?? 99;
}

function getHierarchyPresetOrder(label: string): number {
  const labels = new Map([
    ["Hierarchy · Broad", 0],
    ["Hierarchy · Balanced", 1],
    ["Hierarchy · Detail", 2],
    ["Hierarchy · Fine", 3],
  ]);

  return labels.get(label) ?? 99;
}

function getHdbscanPresetOrder(label: string): number {
  const labels = new Map([
    ["HDBSCAN · Fine", 0],
    ["HDBSCAN · Detail", 1],
    ["HDBSCAN · Balanced", 2],
    ["HDBSCAN · Broad", 3],
  ]);

  return labels.get(label) ?? 99;
}

function pickOutputById<T>({
  idField,
  outputs,
  selectedId,
}: {
  idField: keyof T;
  outputs: LoadedRunOutput<T>[];
  selectedId?: string | null;
}): LoadedRunOutput<T> | undefined {
  return (
    outputs.find((output) => String(output.value[idField] ?? "") === selectedId) ??
    outputs[0]
  );
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function inferRecipeFamily(recipeName: string): string {
  return recipeName.startsWith("dinov3") ? "dinov3" : "unknown";
}

function inferLongEdge(recipeName: string): number | null {
  const match = /_(\d+)$/.exec(recipeName);
  const longEdge = match ? Number(match[1]) : Number.NaN;

  return Number.isFinite(longEdge) ? longEdge : null;
}

async function existingRelativePath(
  runDir: string,
  relativePath: string,
): Promise<string | undefined> {
  try {
    await readFile(path.join(runDir, relativePath), "utf-8");
    return relativePath;
  } catch {
    return undefined;
  }
}

async function findThumbnailAtlasManifestPaths(
  runDir: string,
): Promise<Record<string, string>> {
  const atlasRoot = path.join(runDir, "viewer", "atlases");
  const atlasDirs = await safeReadDir(atlasRoot);
  const manifestPaths: Record<string, string> = {};

  for (const atlasDir of atlasDirs.sort((left, right) =>
    left.localeCompare(right),
  )) {
    const match = /^(\d+)px$/.exec(atlasDir);

    if (!match) {
      continue;
    }

    const relativePath = path.join(
      "viewer",
      "atlases",
      atlasDir,
      "atlas-manifest.json",
    );
    const found = await existingRelativePath(runDir, relativePath);

    if (found) {
      manifestPaths[match[1]] = found;
    }
  }

  return manifestPaths;
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
