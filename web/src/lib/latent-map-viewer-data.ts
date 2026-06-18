import type {
  LatentMapAvailableCluster,
  LatentMapClusterGroup,
  LatentMapGeneratedThumbnailAtlas,
  LatentMapNeighbor,
  LatentMapPoint,
  LatentMapViewerData,
} from "@/lib/latent-map-viewer";

export type LatentMapRelationResponse = {
  neighbors: LatentMapNeighbor[];
  opposites: LatentMapNeighbor[];
};

export type ExportedLatentMapViewerData = {
  available_clusters?: {
    asset_kind?: unknown;
    cluster_count?: unknown;
    cluster_id?: unknown;
    groups?: unknown;
    label?: unknown;
    method?: unknown;
    params?: unknown;
    random_state?: unknown;
    schema_version?: unknown;
    unassigned_count?: unknown;
  }[];
  cluster_result?: {
    asset_kind?: unknown;
    cluster_count?: unknown;
    cluster_id?: unknown;
    groups?: unknown;
    label?: unknown;
    method?: unknown;
    params?: unknown;
    random_state?: unknown;
    schema_version?: unknown;
    unassigned_count?: unknown;
  };
  available_layouts?: {
    layout_id?: unknown;
    method?: unknown;
    params?: unknown;
  }[];
  available_recipes?: {
    family?: unknown;
    label?: unknown;
    long_edge?: unknown;
    model_id?: unknown;
    recipe_name?: unknown;
  }[];
  cluster_id?: string;
  layout_id?: string;
  neighbor_index_path?: string;
  points?: Partial<LatentMapPoint>[];
  recipe_name?: string;
  run_id?: string;
  thumbnail_atlas?: Partial<LatentMapGeneratedThumbnailAtlas>;
  thumbnail_atlases?: Partial<LatentMapGeneratedThumbnailAtlas>[];
  thumbnail_atlas_manifest_path?: string;
  thumbnail_atlas_manifest_paths?: Record<string, string>;
};

type ExportedLatentMapCluster =
  NonNullable<ExportedLatentMapViewerData["available_clusters"]>[number];

function createResourceUrl({
  apiPath,
  resourcePath,
  resourceParamName = "path",
}: {
  apiPath: string;
  resourcePath: string;
  resourceParamName?: string;
}): string {
  const separator = apiPath.includes("?") ? "&" : "?";

  return `${apiPath}${separator}${encodeURIComponent(resourceParamName)}=${encodeURIComponent(resourcePath)}`;
}

function appendResourceQueryParam({
  apiPath,
  key,
  value,
}: {
  apiPath: string;
  key: string;
  value: string;
}): string {
  const separator = apiPath.includes("?") ? "&" : "?";

  return `${apiPath}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function normalizeExportedLatentMapViewerData({
  atlasManifestApiPath = "/api/latent-map/atlas-manifests",
  rawData,
  neighborApiPath = "/api/latent-map/neighbors",
  sourceFolder,
  thumbnailApiPath = "/api/latent-map/thumbnails",
  thumbnailResourceParamName = "path",
}: {
  atlasManifestApiPath?: string;
  neighborApiPath?: string;
  rawData: ExportedLatentMapViewerData;
  sourceFolder: string;
  thumbnailApiPath?: string;
  thumbnailResourceParamName?: string;
}): LatentMapViewerData {
  const points = Array.isArray(rawData.points) ? rawData.points : [];
  const thumbnailAtlas = normalizeThumbnailAtlas({
    rawAtlas: rawData.thumbnail_atlas,
    thumbnailApiPath,
    thumbnailResourceParamName,
  });
  const thumbnailAtlases = normalizeThumbnailAtlases({
    rawAtlases: rawData.thumbnail_atlases,
    singleAtlas: thumbnailAtlas,
    thumbnailApiPath,
    thumbnailResourceParamName,
  });
  const thumbnailAtlasManifestUrls = normalizeThumbnailAtlasManifestUrls({
    atlasManifestApiPath,
    rawData,
    thumbnailResourceParamName,
  });
  const clusterResult = normalizeAvailableCluster(rawData.cluster_result);
  const recipeName = String(rawData.recipe_name ?? "");
  const neighborLookupPath =
    recipeName.length > 0
      ? appendResourceQueryParam({
          apiPath: neighborApiPath,
          key: "recipe",
          value: recipeName,
        })
      : typeof rawData.neighbor_index_path === "string" &&
          rawData.neighbor_index_path.length > 0
        ? createResourceUrl({
            apiPath: neighborApiPath,
            resourcePath: rawData.neighbor_index_path,
          })
        : null;

  return {
    schema_version: 1,
    run_id: String(rawData.run_id ?? "external-run"),
    available_clusters: normalizeAvailableClusters(rawData.available_clusters),
    available_layouts: normalizeAvailableLayouts(rawData.available_layouts),
    available_recipes: normalizeAvailableRecipes(rawData.available_recipes),
    embedding_recipe: recipeName || "unknown_recipe",
    layout_id: String(rawData.layout_id ?? "unknown_layout"),
    cluster_id: String(rawData.cluster_id ?? "unknown_cluster"),
    ...(clusterResult ? { cluster_result: clusterResult } : {}),
    source_folder: sourceFolder,
    ...(neighborLookupPath ? { neighbor_lookup_path: neighborLookupPath } : {}),
    ...(thumbnailAtlas ? { thumbnail_atlas: thumbnailAtlas } : {}),
    ...(thumbnailAtlases.length > 0 ? { thumbnail_atlases: thumbnailAtlases } : {}),
    ...(Object.keys(thumbnailAtlasManifestUrls).length > 0
      ? { thumbnail_atlas_manifest_urls: thumbnailAtlasManifestUrls }
      : {}),
    points: points.map((point): LatentMapPoint => {
      const thumbnailPath = String(point.thumbnail_path ?? "");
      const rawPreviewPath =
        typeof point.preview_path === "string" ? point.preview_path : "";
      const previewPath =
        rawPreviewPath.trim().length > 0 ? rawPreviewPath : thumbnailPath;

      return {
        image_id: String(point.image_id ?? ""),
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0),
        cluster_id: Number(point.cluster_id ?? 0),
        ...(typeof point.cluster_group_key === "string" &&
        point.cluster_group_key.length > 0
          ? { cluster_group_key: point.cluster_group_key }
          : {}),
        ...(typeof point.cluster_membership === "number"
          ? { cluster_membership: point.cluster_membership }
          : {}),
        thumbnail_path: createResourceUrl({
          apiPath: thumbnailApiPath,
          resourcePath: thumbnailPath,
          resourceParamName: thumbnailResourceParamName,
        }),
        preview_path: createResourceUrl({
          apiPath: thumbnailApiPath,
          resourcePath: previewPath,
          resourceParamName: thumbnailResourceParamName,
        }),
        source_path: "",
        relative_path: String(point.relative_path ?? ""),
        width: Number(point.width ?? 1),
        height: Number(point.height ?? 1),
        neighbors: Array.isArray(point.neighbors)
          ? point.neighbors.map((neighbor) => ({
              image_id: String(neighbor.image_id),
              rank:
                typeof neighbor.rank === "number" ? neighbor.rank : undefined,
              score: Number(neighbor.score ?? 0),
            }))
          : [],
        opposites: Array.isArray(point.opposites)
          ? point.opposites.map((neighbor) => ({
              image_id: String(neighbor.image_id),
              rank:
                typeof neighbor.rank === "number" ? neighbor.rank : undefined,
              score: Number(neighbor.score ?? 0),
            }))
          : [],
      };
    }),
  };
}

export function normalizeExportedLatentMapThumbnailAtlas({
  expectedTileSize,
  rawAtlas,
  thumbnailApiPath = "/api/latent-map/thumbnails",
  thumbnailResourceParamName = "path",
}: {
  expectedTileSize?: number;
  rawAtlas: Partial<LatentMapGeneratedThumbnailAtlas> | undefined;
  thumbnailApiPath?: string;
  thumbnailResourceParamName?: string;
}): LatentMapGeneratedThumbnailAtlas | undefined {
  return normalizeThumbnailAtlas({
    expectedTileSize,
    rawAtlas,
    thumbnailApiPath,
    thumbnailResourceParamName,
  });
}

export function mergeLatentMapViewerDataThumbnailAtlases(
  data: LatentMapViewerData,
  atlases: LatentMapGeneratedThumbnailAtlas[],
): LatentMapViewerData {
  if (atlases.length === 0) {
    return data;
  }

  const atlasesBySize = new Map<number, LatentMapGeneratedThumbnailAtlas>();

  [
    ...(data.thumbnail_atlases ?? []),
    ...(data.thumbnail_atlas ? [data.thumbnail_atlas] : []),
    ...atlases,
  ]
    .filter((atlas) => Number.isFinite(atlas.tile_size) && atlas.tile_size > 0)
    .forEach((atlas) => {
      if (!atlasesBySize.has(atlas.tile_size)) {
        atlasesBySize.set(atlas.tile_size, atlas);
      }
    });

  const mergedAtlases = [...atlasesBySize.values()].sort(
    (left, right) => left.tile_size - right.tile_size,
  );
  const primaryAtlas =
    mergedAtlases.find((atlas) => atlas.tile_size === 64) ?? mergedAtlases[0];

  return {
    ...data,
    ...(primaryAtlas ? { thumbnail_atlas: primaryAtlas } : {}),
    ...(mergedAtlases.length > 0 ? { thumbnail_atlases: mergedAtlases } : {}),
  };
}

function normalizeThumbnailAtlasManifestUrls({
  atlasManifestApiPath,
  rawData,
  thumbnailResourceParamName,
}: {
  atlasManifestApiPath: string;
  rawData: ExportedLatentMapViewerData;
  thumbnailResourceParamName: string;
}): Record<string, string> {
  const manifestPaths = normalizeThumbnailAtlasManifestPaths(rawData);

  return Object.fromEntries(
    Object.entries(manifestPaths).map(([tileSize, manifestPath]) => [
      tileSize,
      createResourceUrl({
        apiPath: atlasManifestApiPath,
        resourcePath: manifestPath,
        resourceParamName: thumbnailResourceParamName,
      }),
    ]),
  );
}

function normalizeThumbnailAtlasManifestPaths(
  rawData: ExportedLatentMapViewerData,
): Record<string, string> {
  if (rawData.thumbnail_atlas_manifest_paths) {
    return Object.fromEntries(
      Object.entries(rawData.thumbnail_atlas_manifest_paths).filter(
        (entry): entry is [string, string] =>
          entry[0].length > 0 &&
          typeof entry[1] === "string" &&
          entry[1].length > 0,
      ),
    );
  }

  if (
    typeof rawData.thumbnail_atlas_manifest_path === "string" &&
    rawData.thumbnail_atlas_manifest_path.length > 0
  ) {
    const tileSize =
      /(?:^|\/)(\d+)px\/atlas-manifest\.json$/.exec(
        rawData.thumbnail_atlas_manifest_path,
      )?.[1] ?? "64";

    return { [tileSize]: rawData.thumbnail_atlas_manifest_path };
  }

  return {};
}

function normalizeThumbnailAtlases({
  rawAtlases,
  singleAtlas,
  thumbnailApiPath,
  thumbnailResourceParamName,
}: {
  rawAtlases: Partial<LatentMapGeneratedThumbnailAtlas>[] | undefined;
  singleAtlas: LatentMapGeneratedThumbnailAtlas | undefined;
  thumbnailApiPath: string;
  thumbnailResourceParamName: string;
}): LatentMapGeneratedThumbnailAtlas[] {
  const atlases = [
    ...(Array.isArray(rawAtlases)
      ? rawAtlases
          .map((rawAtlas) =>
            normalizeThumbnailAtlas({
              rawAtlas,
              thumbnailApiPath,
              thumbnailResourceParamName,
            }),
          )
          .filter((atlas): atlas is LatentMapGeneratedThumbnailAtlas =>
            Boolean(atlas),
          )
      : []),
    ...(singleAtlas ? [singleAtlas] : []),
  ];
  const atlasesBySize = new Map<number, LatentMapGeneratedThumbnailAtlas>();

  atlases.forEach((atlas) => {
    if (!atlasesBySize.has(atlas.tile_size)) {
      atlasesBySize.set(atlas.tile_size, atlas);
    }
  });

  return [...atlasesBySize.values()].sort(
    (left, right) => left.tile_size - right.tile_size,
  );
}

function normalizeAvailableRecipes(
  recipes: ExportedLatentMapViewerData["available_recipes"],
): LatentMapViewerData["available_recipes"] {
  return Array.isArray(recipes)
    ? recipes.map((recipe) => ({
        family: String(recipe.family ?? ""),
        ...(typeof recipe.label === "string" && recipe.label.length > 0
          ? { label: recipe.label }
          : {}),
        long_edge:
          typeof recipe.long_edge === "number" ? recipe.long_edge : null,
        model_id: String(recipe.model_id ?? ""),
        recipe_name: String(recipe.recipe_name ?? ""),
      }))
    : [];
}

function normalizeAvailableLayouts(
  layouts: ExportedLatentMapViewerData["available_layouts"],
): LatentMapViewerData["available_layouts"] {
  return Array.isArray(layouts)
    ? layouts.map((layout) => ({
        layout_id: String(layout.layout_id ?? ""),
        method: String(layout.method ?? ""),
        params:
          layout.params &&
          typeof layout.params === "object" &&
          !Array.isArray(layout.params)
            ? (layout.params as Record<string, unknown>)
            : {},
      }))
    : [];
}

function normalizeAvailableClusters(
  clusters: ExportedLatentMapViewerData["available_clusters"],
): LatentMapViewerData["available_clusters"] {
  return Array.isArray(clusters)
    ? clusters
        .map(normalizeAvailableCluster)
        .filter(
          (cluster): cluster is LatentMapAvailableCluster => cluster !== undefined,
        )
    : [];
}

function normalizeAvailableCluster(
  cluster:
    | ExportedLatentMapCluster
    | ExportedLatentMapViewerData["cluster_result"]
    | undefined,
): LatentMapAvailableCluster | undefined {
  if (!cluster) {
    return undefined;
  }

  return {
    ...(typeof cluster.asset_kind === "string" && cluster.asset_kind.length > 0
      ? { asset_kind: cluster.asset_kind }
      : {}),
    cluster_count:
      typeof cluster.cluster_count === "number" ? cluster.cluster_count : null,
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
    random_state:
      typeof cluster.random_state === "number" ? cluster.random_state : null,
    ...(typeof cluster.schema_version === "number"
      ? { schema_version: cluster.schema_version }
      : {}),
    ...(typeof cluster.unassigned_count === "number"
      ? { unassigned_count: cluster.unassigned_count }
      : {}),
  };
}

function normalizeClusterGroups(groups: unknown[]): LatentMapClusterGroup[] {
  return groups
    .filter((group): group is Record<string, unknown> => {
      return Boolean(group && typeof group === "object" && !Array.isArray(group));
    })
    .map((group) => {
      const kind: LatentMapClusterGroup["kind"] =
        group.kind === "unassigned" ? "unassigned" : "cluster";

      return {
        cluster_id: Number(group.cluster_id ?? 0),
        count: Number(group.count ?? 0),
        group_key: String(group.group_key ?? group.cluster_id ?? ""),
        kind,
        label: String(
          group.label ??
            (kind === "unassigned"
              ? "Unassigned"
              : `Group ${String(group.cluster_id ?? "")}`),
        ),
      };
    })
    .filter((group) => group.group_key.length > 0);
}

function normalizeThumbnailAtlas({
  expectedTileSize,
  rawAtlas,
  thumbnailApiPath,
  thumbnailResourceParamName,
}: {
  expectedTileSize?: number;
  rawAtlas: Partial<LatentMapGeneratedThumbnailAtlas> | undefined;
  thumbnailApiPath: string;
  thumbnailResourceParamName: string;
}): LatentMapGeneratedThumbnailAtlas | undefined {
  if (!isValidThumbnailAtlas(rawAtlas, expectedTileSize)) {
    return undefined;
  }

  return {
    schema_version: 1,
    asset_kind: "latent-map-thumbnail-atlas",
    run_id: String(rawAtlas.run_id ?? ""),
    tile_size: Number(rawAtlas.tile_size ?? 64) as LatentMapGeneratedThumbnailAtlas["tile_size"],
    atlas_size: Number(rawAtlas.atlas_size ?? 2048),
    image_count: Number(rawAtlas.image_count ?? 0),
    page_count: Number(rawAtlas.page_count ?? 0),
    pages: Array.isArray(rawAtlas.pages)
      ? rawAtlas.pages.map((page) => ({
          height: Number(page.height ?? 0),
          index: Number(page.index ?? 0),
          path: createResourceUrl({
            apiPath: thumbnailApiPath,
            resourcePath: String(page.path ?? ""),
            resourceParamName: thumbnailResourceParamName,
          }),
          width: Number(page.width ?? 0),
        }))
      : [],
    items: Array.isArray(rawAtlas.items)
      ? rawAtlas.items.map((item) => {
          const contentRect = Array.isArray(item.content_rect)
            ? { content_rect: normalizeNumberTuple(item.content_rect) }
            : {};

          return {
            height: Number(item.height ?? 0),
            image_id: String(item.image_id ?? ""),
            page_index: Number(item.page_index ?? 0),
            page_path: String(item.page_path ?? ""),
            source_thumbnail_path: String(item.source_thumbnail_path ?? ""),
            tile_rect: normalizeNumberTuple(item.tile_rect),
            uv_rect: normalizeNumberTuple(item.uv_rect),
            width: Number(item.width ?? 0),
            ...contentRect,
          };
        })
      : [],
  };
}

function isValidThumbnailAtlas(
  rawAtlas: Partial<LatentMapGeneratedThumbnailAtlas> | undefined,
  expectedTileSize?: number,
): rawAtlas is LatentMapGeneratedThumbnailAtlas {
  if (!rawAtlas || typeof rawAtlas !== "object") {
    return false;
  }

  const tileSize = Number(rawAtlas.tile_size);
  const atlasSize = Number(rawAtlas.atlas_size);
  const imageCount = Number(rawAtlas.image_count);
  const pageCount = Number(rawAtlas.page_count);

  if (
    rawAtlas.schema_version !== 1 ||
    rawAtlas.asset_kind !== "latent-map-thumbnail-atlas" ||
    typeof rawAtlas.run_id !== "string" ||
    rawAtlas.run_id.length === 0 ||
    !isPositiveInteger(tileSize) ||
    !isPositiveInteger(atlasSize) ||
    !isNonNegativeInteger(imageCount) ||
    !isNonNegativeInteger(pageCount) ||
    (expectedTileSize !== undefined && tileSize !== expectedTileSize) ||
    !Array.isArray(rawAtlas.pages) ||
    rawAtlas.pages.length !== pageCount ||
    !Array.isArray(rawAtlas.items)
  ) {
    return false;
  }

  return (
    rawAtlas.pages.every(isValidThumbnailAtlasPage) &&
    rawAtlas.items.every(isValidThumbnailAtlasItem)
  );
}

function isValidThumbnailAtlasPage(
  page: LatentMapGeneratedThumbnailAtlas["pages"][number],
) {
  return (
    typeof page.path === "string" &&
    page.path.length > 0 &&
    isNonNegativeInteger(Number(page.index)) &&
    isPositiveInteger(Number(page.width)) &&
    isPositiveInteger(Number(page.height))
  );
}

function isValidThumbnailAtlasItem(
  item: LatentMapGeneratedThumbnailAtlas["items"][number],
) {
  return (
    typeof item.image_id === "string" &&
    item.image_id.length > 0 &&
    typeof item.page_path === "string" &&
    item.page_path.length > 0 &&
    typeof item.source_thumbnail_path === "string" &&
    item.source_thumbnail_path.length > 0 &&
    isNonNegativeInteger(Number(item.page_index)) &&
    isPositiveInteger(Number(item.width)) &&
    isPositiveInteger(Number(item.height)) &&
    isNumberTuple(item.tile_rect) &&
    isNumberTuple(item.uv_rect) &&
    (item.content_rect === undefined || isNumberTuple(item.content_rect))
  );
}

function isNumberTuple(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => Number.isFinite(Number(entry)))
  );
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function normalizeNumberTuple(
  value: unknown,
): [number, number, number, number] {
  const numbers = Array.isArray(value) ? value.map(Number) : [];

  return [
    numbers[0] ?? 0,
    numbers[1] ?? 0,
    numbers[2] ?? 0,
    numbers[3] ?? 0,
  ];
}

export function normalizeLatentMapNeighborResponse(
  rawData: unknown,
  selectedImageId: string,
): LatentMapNeighbor[] {
  return normalizeLatentMapRelationResponse(
    rawData,
    selectedImageId,
  ).neighbors;
}

export function normalizeLatentMapRelationResponse(
  rawData: unknown,
  selectedImageId: string,
): LatentMapRelationResponse {
  if (!rawData || typeof rawData !== "object") {
    throw new Error("FAISS neighbors are unavailable for the selected image.");
  }

  const response = rawData as {
    image_id?: unknown;
    neighbors?: unknown;
  };
  const imageId = String(response.image_id ?? "");

  if (imageId !== selectedImageId) {
    throw new Error("FAISS neighbor response mismatch.");
  }

  if (!Array.isArray(response.neighbors)) {
    throw new Error("FAISS neighbors are unavailable for the selected image.");
  }

  const rawOpposites = (response as { opposites?: unknown }).opposites;

  return {
    neighbors: normalizeNeighborRows(response.neighbors),
    opposites: Array.isArray(rawOpposites)
      ? normalizeNeighborRows(rawOpposites)
      : [],
  };
}

function normalizeNeighborRows(rows: unknown[]): LatentMapNeighbor[] {
  return rows.map((neighbor) => {
    const row = neighbor as { image_id?: unknown; rank?: unknown; score?: unknown };
    const rank = Number(row.rank);

    return {
      image_id: String(row.image_id ?? ""),
      ...(Number.isFinite(rank) ? { rank } : {}),
      score: Number(row.score ?? 0),
    };
  });
}
