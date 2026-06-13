import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

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

export async function loadLatentMapRunExportedViewerData({
  runDir,
  selectedClusterId,
  selectedLayoutId,
  selectedRecipeName,
}: {
  runDir: string;
  selectedClusterId?: string | null;
  selectedLayoutId?: string | null;
  selectedRecipeName?: string | null;
}): Promise<ExportedLatentMapViewerData> {
  const resolvedRunDir = path.resolve(runDir);
  const manifestRows = await readJsonLines<ManifestRow>(
    path.join(resolvedRunDir, "manifest.jsonl"),
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

  const layouts = await loadRunOutputs<LayoutFile>({
    dir: path.join(resolvedRunDir, "layouts"),
    recipeName: selectedRecipe,
  });
  const clusters = sortClusterOutputs(
    await loadRunOutputs<ClusterFile>({
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

  const manifestByImageId = new Map(
    manifestRows.map((row) => [String(row.image_id ?? ""), row]),
  );
  const clusterByImageId = new Map(
    (cluster.value.points ?? []).map((point) => [
      String(point.image_id ?? ""),
      point,
    ]),
  );
  const neighborIndexPath = await existingRelativePath(
    resolvedRunDir,
    path.join("indexes", `${selectedRecipe}_neighbors.jsonl`),
  );
  const thumbnailAtlasManifestPaths = await findThumbnailAtlasManifestPaths(
    resolvedRunDir,
  );
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
    ...(neighborIndexPath ? { neighbor_index_path: neighborIndexPath } : {}),
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

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function loadAvailableRecipes(
  runDir: string,
): Promise<LoadedRecipe[]> {
  const embeddingDir = path.join(runDir, "embeddings");
  const fileNames = await listJsonFiles(embeddingDir);
  const recipes = await Promise.all(
    fileNames.map(async (fileName) => {
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

  return recipes.sort((left, right) =>
    left.recipe_name.localeCompare(right.recipe_name),
  );
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
