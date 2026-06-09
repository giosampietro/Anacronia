"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Images, Palette, RotateCcw, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  createLatentMapRuntimeSnapshot,
  createLatentMapThumbnailRenderPlan,
  createLatentMapPointLayerPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  getNextLatentMapSelection,
  DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
  type LatentMapRenderMode,
  type LatentMapRuntimeRendererInfo,
  type LatentMapThumbnailSize,
  type LatentMapViewerData,
} from "@/lib/latent-map-viewer";
import {
  createLatentMapPointerHitRadius,
  createLatentMapSpatialIndex,
} from "@/lib/latent-map-spatial-index";
import {
  createLatentMapFilterOptions,
  DEFAULT_LATENT_MAP_DURABLE_STATE,
  filterLatentMapViewerData,
  parseLatentMapUrlState,
  serializeLatentMapUrlState,
} from "@/lib/latent-map-viewer-state";
import { normalizeLatentMapNeighborResponse } from "@/lib/latent-map-viewer-data";
import {
  createLatentMapWebglRuntime,
  type LatentMapRuntimeState,
  type LatentMapViewState,
  type LatentMapWebglRuntime,
} from "@/lib/latent-map-webgl-runtime";

type LatentMapViewerProps = {
  className?: string;
  data: LatentMapViewerData;
  initialRenderMode?: LatentMapRenderMode;
  initialSelectedImageId?: string | null;
};

type PointerPosition = {
  x: number;
  y: number;
};

const DEFAULT_VIEW: LatentMapViewState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};
const ATLAS_TEXTURE_SIZE = 2048;

function getAvailableRecipes(data: LatentMapViewerData) {
  return data.available_recipes && data.available_recipes.length > 0
    ? data.available_recipes
    : [
        {
          family: "",
          long_edge: null,
          model_id: "",
          recipe_name: data.embedding_recipe,
        },
      ];
}

function getAvailableLayouts(data: LatentMapViewerData) {
  return data.available_layouts && data.available_layouts.length > 0
    ? data.available_layouts
    : [
        {
          layout_id: data.layout_id,
          method: "",
          params: {},
        },
      ];
}

function getAvailableClusters(data: LatentMapViewerData) {
  return data.available_clusters && data.available_clusters.length > 0
    ? data.available_clusters
    : [
        {
          cluster_count: null,
          cluster_id: data.cluster_id,
          method: "",
          random_state: null,
        },
      ];
}

function formatRecipeLabel(
  recipe: NonNullable<LatentMapViewerData["available_recipes"]>[number],
) {
  const label = recipe.label ?? recipe.recipe_name;

  return recipe.long_edge ? `${label} (${recipe.long_edge}px)` : label;
}

function createInitialDurableState({
  data,
  initialRenderMode,
  initialSelectedImageId,
}: {
  data: LatentMapViewerData;
  initialRenderMode: LatentMapRenderMode;
  initialSelectedImageId: string | null;
}) {
  const fallback = {
    ...DEFAULT_LATENT_MAP_DURABLE_STATE,
    renderMode: initialRenderMode,
    selectedImageId: data.points.some(
      (point) => point.image_id === initialSelectedImageId,
    )
      ? initialSelectedImageId
      : null,
  };

  return fallback;
}

export function LatentMapViewer({
  className,
  data,
  initialRenderMode = "points",
  initialSelectedImageId = null,
}: LatentMapViewerProps) {
  const initialDurableState = useMemo(
    () =>
      createInitialDurableState({
        data,
        initialRenderMode,
        initialSelectedImageId,
      }),
    [data, initialRenderMode, initialSelectedImageId],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<LatentMapWebglRuntime | null>(null);
  const runtimeStateRef = useRef<LatentMapRuntimeState | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPointerRef = useRef<PointerPosition | null>(null);
  const dragStartRef = useRef<{
    pointer: PointerPosition;
    view: LatentMapViewState;
  } | null>(null);
  const viewRef = useRef<LatentMapViewState>(DEFAULT_VIEW);
  const [clusterColorsEnabled, setClusterColorsEnabled] = useState(true);
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<PointerPosition>({
    x: 0,
    y: 0,
  });
  const [selectedImageId, setSelectedImageId] = useState<string | null>(
    initialDurableState.selectedImageId,
  );
  const [neighborsByImageId, setNeighborsByImageId] = useState<
    Record<string, NonNullable<LatentMapViewerData["points"][number]["neighbors"]>>
  >({});
  const [loadingNeighborImageId, setLoadingNeighborImageId] = useState<
    string | null
  >(null);
  const [neighborError, setNeighborError] = useState<string | null>(null);
  const [renderMode, setRenderMode] =
    useState<LatentMapRenderMode>(initialDurableState.renderMode);
  const [runtimeRendererInfo, setRuntimeRendererInfo] =
    useState<LatentMapRuntimeRendererInfo>();
  const [loadedThumbnailCount, setLoadedThumbnailCount] = useState(0);
  const [thumbnailSize, setThumbnailSize] =
    useState<LatentMapThumbnailSize>(initialDurableState.thumbnailSize);
  const [view, setView] = useState<LatentMapViewState>(
    initialDurableState.view,
  );
  const [clusterFilter, setClusterFilter] = useState(
    initialDurableState.clusterFilter,
  );
  const [sourceFilter, setSourceFilter] = useState(
    initialDurableState.sourceFilter,
  );
  const [urlStateHydrated, setUrlStateHydrated] = useState(false);
  const filterOptions = useMemo(
    () => createLatentMapFilterOptions(data),
    [data],
  );
  const methodOptions = useMemo(
    () => ({
      clusters: getAvailableClusters(data),
      layouts: getAvailableLayouts(data),
      recipes: getAvailableRecipes(data),
    }),
    [data],
  );
  const filteredData = useMemo(
    () =>
      filterLatentMapViewerData(data, {
        clusterFilter,
        sourceFilter,
      }),
    [clusterFilter, data, sourceFilter],
  );
  const stats = useMemo(() => createLatentMapStats(filteredData), [filteredData]);
  const totalStats = useMemo(() => createLatentMapStats(data), [data]);
  const renderPoints = useMemo(
    () =>
      createLatentMapRenderState({
        clusterColorsEnabled,
        data: filteredData,
        neighborsByImageId,
        selectedImageId,
      }),
    [clusterColorsEnabled, filteredData, neighborsByImageId, selectedImageId],
  );
  const spatialIndex = useMemo(
    () => createLatentMapSpatialIndex(renderPoints),
    [renderPoints],
  );
  const selectedPoint = useMemo(
    () =>
      filteredData.points.find((point) => point.image_id === selectedImageId) ??
      null,
    [filteredData.points, selectedImageId],
  );
  const hoveredPoint = useMemo(
    () =>
      filteredData.points.find((point) => point.image_id === hoveredImageId) ??
      null,
    [filteredData.points, hoveredImageId],
  );
  const thumbnailPlan = useMemo(
    () =>
      createLatentMapThumbnailRenderPlan({
        atlasSize: ATLAS_TEXTURE_SIZE,
        hoverPreviewSize: DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
        points: renderPoints,
        strategy: "all-atlas",
        thumbnailAtlas: data.thumbnail_atlas,
        thumbnailSize,
      }),
    [data.thumbnail_atlas, renderPoints, thumbnailSize],
  );
  const pointLayer = useMemo(
    () =>
      createLatentMapPointLayerPlan({
        points: renderPoints,
        renderMode,
        thumbnailPlan,
      }),
    [renderMode, renderPoints, thumbnailPlan],
  );
  const runtimeState = useMemo<LatentMapRuntimeState>(
    () => ({
      pointLayer,
      points: renderPoints,
      renderMode,
      thumbnailPlan,
    }),
    [pointLayer, renderMode, renderPoints, thumbnailPlan],
  );
  const dataMountKey = useMemo(
    () =>
      [
        data.run_id,
        data.embedding_recipe,
        data.layout_id,
        data.cluster_id,
        data.points.length,
      ].join("|"),
    [
      data.cluster_id,
      data.embedding_recipe,
      data.layout_id,
      data.points.length,
      data.run_id,
    ],
  );
  const runtimeSnapshot = useMemo(
    () =>
      createLatentMapRuntimeSnapshot({
        loadedThumbnailCount,
        pointCount: stats.pointCount,
        renderMode,
        rendererInfo: runtimeRendererInfo,
        thumbnailPlan,
      }),
    [
      loadedThumbnailCount,
      renderMode,
      runtimeRendererInfo,
      stats.pointCount,
      thumbnailPlan,
    ],
  );

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
    runtimeRef.current?.setRenderState(runtimeState);
  }, [runtimeState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const initialRuntimeState = runtimeStateRef.current;

    if (!canvas || !wrapper || !initialRuntimeState) {
      return;
    }

    const runtime = createLatentMapWebglRuntime({
      canvas,
      onDiagnosticsChange: (diagnostics) => {
        setLoadedThumbnailCount(diagnostics.loadedThumbnailCount);
        setRuntimeRendererInfo(diagnostics.rendererInfo);
      },
      view: viewRef.current,
      wrapper,
      ...initialRuntimeState,
    });
    runtimeRef.current = runtime;

    return () => {
      runtime.dispose();
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
    };
  }, [dataMountKey]);

  useEffect(() => {
    viewRef.current = view;
    runtimeRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextDurableState =
      window.location.search.length > 0
        ? parseLatentMapUrlState(
            new URLSearchParams(window.location.search),
            data,
          )
        : initialDurableState;

    setClusterFilter(nextDurableState.clusterFilter);
    setRenderMode(nextDurableState.renderMode);
    setSelectedImageId(nextDurableState.selectedImageId);
    setSourceFilter(nextDurableState.sourceFilter);
    setThumbnailSize(nextDurableState.thumbnailSize);
    setView(nextDurableState.view);
    setUrlStateHydrated(true);
  }, [data, dataMountKey, initialDurableState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!urlStateHydrated) {
      return;
    }

    const nextSearchParams = serializeLatentMapUrlState(
      {
        clusterFilter,
        renderMode,
        selectedImageId,
        sourceFilter,
        thumbnailSize,
        view,
      },
      data,
    );
    const nextUrl = `${window.location.pathname}?${nextSearchParams.toString()}${
      window.location.hash
    }`;

    window.history.replaceState(null, "", nextUrl);
  }, [
    clusterFilter,
    data,
    renderMode,
    selectedImageId,
    sourceFilter,
    thumbnailSize,
    urlStateHydrated,
    view,
  ]);

  useEffect(
    () => () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
    },
    [],
  );

  function getNearestPointAt(pointer: PointerPosition) {
    const wrapper = wrapperRef.current;
    const worldPoint =
      runtimeRef.current?.getWorldPoint(pointer.x, pointer.y) ?? null;

    if (!wrapper || !worldPoint) {
      return null;
    }
    const rect = wrapper.getBoundingClientRect();

    return spatialIndex.findNearest({
      maxDistance: createLatentMapPointerHitRadius({
        renderMode,
        thumbnailSize,
        viewportHeight: rect.height,
        zoom: viewRef.current.zoom,
      }),
      x: worldPoint.x,
      y: worldPoint.y,
    });
  }

  function scheduleHoverLookup(pointer: PointerPosition) {
    hoverPointerRef.current = pointer;

    if (hoverFrameRef.current !== null) {
      return;
    }

    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const nextPointer = hoverPointerRef.current;

      if (!nextPointer) {
        return;
      }

      setHoveredImageId(getNearestPointAt(nextPointer)?.image_id ?? null);
    });
  }

  const loadNeighborsForImage = useCallback(async (imageId: string) => {
    const selectedPoint = data.points.find((point) => point.image_id === imageId);

    if (
      (selectedPoint?.neighbors?.length ?? 0) > 0 ||
      Object.hasOwn(neighborsByImageId, imageId)
    ) {
      setNeighborError(null);
      return;
    }

    if (!data.neighbor_lookup_path) {
      setNeighborError("FAISS neighbors are unavailable for this image.");
      return;
    }

    const requestUrl = new URL(data.neighbor_lookup_path, window.location.origin);
    requestUrl.searchParams.set("image_id", imageId);
    setLoadingNeighborImageId(imageId);
    setNeighborError(null);

    try {
      const response = await fetch(requestUrl);

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const neighbors = normalizeLatentMapNeighborResponse(
        await response.json(),
        imageId,
      );

      setNeighborsByImageId((current) => ({
        ...current,
        [imageId]: neighbors,
      }));
      setNeighborError(null);
    } catch {
      setNeighborError("FAISS neighbors are unavailable for this image.");
    } finally {
      setLoadingNeighborImageId((current) =>
        current === imageId ? null : current,
      );
    }
  }, [data.neighbor_lookup_path, data.points, neighborsByImageId]);

  useEffect(() => {
    if (selectedImageId) {
      const timeoutId = window.setTimeout(() => {
        void loadNeighborsForImage(selectedImageId);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [loadNeighborsForImage, selectedImageId]);

  function clearSelectionIfHiddenByFilters(nextFilters: {
    clusterFilter: string;
    sourceFilter: string;
  }) {
    if (
      selectedImageId &&
      !filterLatentMapViewerData(data, nextFilters).points.some(
        (point) => point.image_id === selectedImageId,
      )
    ) {
      setSelectedImageId(null);
      setNeighborError(null);
      setLoadingNeighborImageId(null);
    }
  }

  function handleClusterFilterChange(nextClusterFilter: string) {
    setClusterFilter(nextClusterFilter);
    clearSelectionIfHiddenByFilters({
      clusterFilter: nextClusterFilter,
      sourceFilter,
    });
  }

  function handleSourceFilterChange(nextSourceFilter: string) {
    setSourceFilter(nextSourceFilter);
    clearSelectionIfHiddenByFilters({
      clusterFilter,
      sourceFilter: nextSourceFilter,
    });
  }

  const navigateToMethodSelection = useCallback(
    ({
      clusterId = data.cluster_id,
      layoutId = data.layout_id,
      recipeName = data.embedding_recipe,
    }: {
      clusterId?: string;
      layoutId?: string;
      recipeName?: string;
    }) => {
      if (typeof window === "undefined") {
        return;
      }

      const nextSearchParams = serializeLatentMapUrlState(
        {
          clusterFilter,
          renderMode,
          selectedImageId,
          sourceFilter,
          thumbnailSize,
          view,
        },
        data,
      );
      nextSearchParams.set("recipe", recipeName);
      nextSearchParams.set("layout", layoutId);
      nextSearchParams.set("clusterResult", clusterId);

      window.location.assign(
        `${window.location.pathname}?${nextSearchParams.toString()}${
          window.location.hash
        }`,
      );
    },
    [
      clusterFilter,
      data,
      renderMode,
      selectedImageId,
      sourceFilter,
      thumbnailSize,
      view,
    ],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser checks may not create an active pointer capture target.
    }
    dragStartRef.current = {
      pointer: {
        x: event.clientX,
        y: event.clientY,
      },
      view,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    setHoverPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const wrapper = wrapperRef.current;
    const dragStart = dragStartRef.current;

    if (dragStart && wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const aspect = rect.width / Math.max(rect.height, 1);
      const deltaX =
        ((dragStart.pointer.x - event.clientX) / rect.width) *
        ((2 * aspect) / dragStart.view.zoom);
      const deltaY =
        ((event.clientY - dragStart.pointer.y) / rect.height) *
        (2 / dragStart.view.zoom);

      setView({
        ...dragStart.view,
        offsetX: dragStart.view.offsetX + deltaX,
        offsetY: dragStart.view.offsetY + deltaY,
      });
      setHoveredImageId(null);
      return;
    }

    scheduleHoverLookup({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;

    dragStartRef.current = null;

    if (!dragStart) {
      return;
    }

    const travel = Math.hypot(
      event.clientX - dragStart.pointer.x,
      event.clientY - dragStart.pointer.y,
    );

    if (travel > 5) {
      return;
    }

    const nearestPoint = getNearestPointAt({
      x: event.clientX,
      y: event.clientY,
    });

    const nextSelectedImageId = getNextLatentMapSelection({
      currentSelectedImageId: selectedImageId,
      pickedImageId: nearestPoint?.image_id ?? null,
    });

    setSelectedImageId(nextSelectedImageId);

    if (!nextSelectedImageId) {
      setNeighborError(null);
      setLoadingNeighborImageId(null);
      return;
    }

    void loadNeighborsForImage(nextSelectedImageId);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.12;

    setView((current) => ({
      ...current,
      zoom: Math.min(7, Math.max(0.45, current.zoom * zoomFactor)),
    }));
  }

  return (
    <main
      className={cn(
        "flex min-h-screen flex-col bg-background text-foreground",
        className,
      )}
    >
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ScanSearch className="size-4 shrink-0 text-muted-foreground" />
            <h1 className="truncate text-sm font-semibold tracking-normal">
              Latent Map
            </h1>
          </div>
          <Badge variant="outline">{stats.pointCount} images</Badge>
          {stats.pointCount !== totalStats.pointCount ? (
            <Badge variant="outline">{totalStats.pointCount} total</Badge>
          ) : null}
          <Badge variant="outline">{stats.clusterCount} clusters</Badge>
          {renderMode === "thumbnails" ? (
            <Badge variant="outline">
              {thumbnailPlan.thumbnailPoints.length}
              {thumbnailPlan.capped ? `/${stats.pointCount}` : ""} thumbnails
            </Badge>
          ) : null}
          {renderMode === "thumbnails" ? (
            <Badge variant="outline">
              {thumbnailPlan.thumbnailSize}px / {thumbnailPlan.atlasPages.length} atlas pages
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Embedding recipe</span>
            <NativeSelect
              aria-label="Embedding recipe"
              className="w-[180px]"
              id="latent-map-recipe"
              name="latent-map-recipe"
              onChange={(event) =>
                navigateToMethodSelection({
                  recipeName: event.currentTarget.value,
                })
              }
              size="sm"
              value={data.embedding_recipe}
            >
              {methodOptions.recipes.map((recipe) => (
                <NativeSelectOption
                  key={recipe.recipe_name}
                  value={recipe.recipe_name}
                >
                  {formatRecipeLabel(recipe)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Layout result</span>
            <NativeSelect
              aria-label="Layout result"
              className="w-[220px]"
              id="latent-map-layout"
              name="latent-map-layout"
              onChange={(event) =>
                navigateToMethodSelection({
                  layoutId: event.currentTarget.value,
                })
              }
              size="sm"
              value={data.layout_id}
            >
              {methodOptions.layouts.map((layout) => (
                <NativeSelectOption
                  key={layout.layout_id}
                  value={layout.layout_id}
                >
                  {layout.layout_id}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Cluster result</span>
            <NativeSelect
              aria-label="Cluster result"
              className="w-[190px]"
              id="latent-map-cluster-result"
              name="latent-map-cluster-result"
              onChange={(event) =>
                navigateToMethodSelection({
                  clusterId: event.currentTarget.value,
                })
              }
              size="sm"
              value={data.cluster_id}
            >
              {methodOptions.clusters.map((cluster) => (
                <NativeSelectOption
                  key={cluster.cluster_id}
                  value={cluster.cluster_id}
                >
                  {cluster.cluster_id}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <NativeSelect
            aria-label="Cluster filter"
            className="w-[116px]"
            id="latent-map-cluster-filter"
            name="latent-map-cluster-filter"
            onChange={(event) =>
              handleClusterFilterChange(event.currentTarget.value)
            }
            size="sm"
            value={clusterFilter}
          >
            <NativeSelectOption value="all">All clusters</NativeSelectOption>
            {filterOptions.clusters.map((clusterId) => (
              <NativeSelectOption key={clusterId} value={String(clusterId)}>
                Cluster {clusterId}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Source filter"
            className="w-[112px]"
            id="latent-map-source-filter"
            name="latent-map-source-filter"
            onChange={(event) =>
              handleSourceFilterChange(event.currentTarget.value)
            }
            size="sm"
            value={sourceFilter}
          >
            <NativeSelectOption value="all">All sources</NativeSelectOption>
            {filterOptions.sources.map((source) => (
              <NativeSelectOption key={source} value={source}>
                {source}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <ToggleGroup
            aria-label="Map render mode"
            size="sm"
            spacing={0}
            value={[renderMode]}
            variant="outline"
            onValueChange={(nextValue) => {
              const nextMode = Array.isArray(nextValue)
                ? nextValue[0]
                : nextValue;

              if (nextMode === "points" || nextMode === "thumbnails") {
                setRenderMode(nextMode);
              }
            }}
          >
            <ToggleGroupItem aria-label="Point mode" value="points">
              <CircleDot data-icon="inline-start" />
              <span className="hidden sm:inline">Points</span>
            </ToggleGroupItem>
            <ToggleGroupItem aria-label="Thumbnail mode" value="thumbnails">
              <Images data-icon="inline-start" />
              <span className="hidden sm:inline">Thumbnails</span>
            </ToggleGroupItem>
          </ToggleGroup>
          {renderMode === "thumbnails" ? (
            <NativeSelect
              aria-label="Thumbnail size"
              className="w-[84px]"
              id="latent-map-thumbnail-size"
              name="latent-map-thumbnail-size"
              onChange={(event) => {
                const nextSize = Number(event.currentTarget.value);

                if (
                  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS.includes(
                    nextSize as LatentMapThumbnailSize,
                  )
                ) {
                  setThumbnailSize(nextSize as LatentMapThumbnailSize);
                }
              }}
              size="sm"
              value={String(thumbnailSize)}
            >
              {LATENT_MAP_THUMBNAIL_SIZE_OPTIONS.map((size) => (
                <NativeSelectOption key={size} value={size}>
                  {size}px
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-pressed={clusterColorsEnabled}
                  onClick={() =>
                    setClusterColorsEnabled((isEnabled) => !isEnabled)
                  }
                  size="icon"
                  variant={clusterColorsEnabled ? "secondary" : "outline"}
                />
              }
            >
                  <Palette />
            </TooltipTrigger>
            <TooltipContent>Cluster colors</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  onClick={() => setView(DEFAULT_VIEW)}
                  size="icon"
                  variant="outline"
                />
              }
            >
              <RotateCcw />
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <section className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={wrapperRef}
          aria-label="Latent image map"
          className="absolute inset-0 cursor-crosshair touch-none bg-[#101113]"
          data-cluster-colors={clusterColorsEnabled}
          data-cluster-filter={clusterFilter}
          data-point-count={stats.pointCount}
          data-render-mode={renderMode}
          data-runtime-atlas-page-count={runtimeSnapshot.atlasPageCount}
          data-runtime-draw-calls={runtimeSnapshot.drawCalls}
          data-runtime-geometries={runtimeSnapshot.geometryCount}
          data-runtime-loaded-thumbnails={runtimeSnapshot.loadedThumbnailCount}
          data-runtime-renderer-points={runtimeSnapshot.rendererPointCount}
          data-runtime-renderer-triangles={runtimeSnapshot.rendererTriangleCount}
          data-runtime-textures={runtimeSnapshot.liveTextureCount}
          data-selected-image-id={selectedImageId ?? undefined}
          data-source-filter={sourceFilter}
          data-total-point-count={totalStats.pointCount}
          data-point-layer-size={pointLayer.pointSize}
          data-point-layer-visible={pointLayer.visible}
          data-thumbnail-atlas-page-count={
            renderMode === "thumbnails" ? thumbnailPlan.atlasPages.length : 0
          }
          data-thumbnail-estimated-atlas-texture-bytes={
            renderMode === "thumbnails"
              ? thumbnailPlan.estimatedAtlasTextureBytes
              : 0
          }
          data-thumbnail-count={
            renderMode === "thumbnails"
              ? thumbnailPlan.thumbnailPoints.length
              : 0
          }
          data-thumbnail-hover-preview-size={thumbnailPlan.hoverPreviewSize}
          data-thumbnail-size={thumbnailPlan.thumbnailSize}
          data-thumbnail-source-kind="generated"
          data-thumbnail-strategy={thumbnailPlan.strategy}
          data-testid="latent-map-canvas"
          onPointerDown={handlePointerDown}
          onPointerLeave={() => {
            dragStartRef.current = null;
            hoverPointerRef.current = null;
            setHoveredImageId(null);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          role="application"
        >
          <canvas className="block size-full" ref={canvasRef} />
        </div>

        <div className="pointer-events-none absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2">
          {selectedPoint ? (
            <>
              <Badge className="bg-background/85 text-foreground" variant="outline">
                {(
                  neighborsByImageId[selectedPoint.image_id] ??
                  selectedPoint.neighbors ??
                  []
                ).length} neighbors
              </Badge>
            </>
          ) : null}
          {loadingNeighborImageId ? (
            <Badge className="bg-background/85 text-foreground" variant="outline">
              Loading FAISS neighbors
            </Badge>
          ) : null}
          {neighborError ? (
            <Badge className="bg-background/85 text-foreground" variant="outline">
              {neighborError}
            </Badge>
          ) : null}
        </div>

        {hoveredPoint ? (
          <div
            className="pointer-events-none fixed z-50 overflow-hidden rounded-lg border bg-background shadow-xl"
            style={{
              left: Math.min(
                hoverPosition.x + 14,
                window.innerWidth - thumbnailPlan.hoverPreviewSize - 16,
              ),
              top: Math.min(
                hoverPosition.y + 14,
                window.innerHeight - thumbnailPlan.hoverPreviewSize - 16,
              ),
              width: thumbnailPlan.hoverPreviewSize,
            }}
        >
            <div
              aria-hidden="true"
              className="aspect-square w-full bg-cover bg-center"
              style={{
                backgroundImage: `url("${hoveredPoint.thumbnail_path}")`,
              }}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
