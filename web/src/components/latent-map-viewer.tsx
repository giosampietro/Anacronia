"use client";

import NextImage from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Images, Palette, RotateCcw, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  createLatentMapThumbnailRendererComparison,
  createLatentMapRuntimeSnapshot,
  createLatentMapThumbnailRenderPlan,
  createLatentMapPointLayerPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  getLatentMapAvailableTextureDetails,
  getNextLatentMapSelection,
  getLatentMapThumbnailAtlasForSize,
  getLatentMapThumbnailScreenLongSide,
  getLatentMapThumbnailStateScaleMultiplier,
  DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
  resolveLatentMapTextureDetail,
  type LatentMapRenderMode,
  type LatentMapRuntimePerformanceInfo,
  type LatentMapTextureDetail,
  type LatentMapRuntimeRendererInfo,
  type LatentMapThumbnailSize,
  type LatentMapViewerData,
} from "@/lib/latent-map-viewer";
import {
  createLatentMapPointerHitRadius,
  createLatentMapSpatialIndex,
} from "@/lib/latent-map-spatial-index";
import { createLatentMapWheelZoomView } from "@/lib/latent-map-view-controls";
import {
  createLatentMapFilterOptions,
  DEFAULT_LATENT_MAP_DURABLE_STATE,
  filterLatentMapViewerData,
  serializeLatentMapUrlState,
  type LatentMapDurableState,
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
  initialState?: LatentMapDurableState;
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

function compactNumberLabel(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.replace("p", ".");
  }

  return null;
}

function getTrailingNumber(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[1]?.replace("p", ".") ?? null;
}

function formatRecipeLabel(
  recipe: NonNullable<LatentMapViewerData["available_recipes"]>[number],
) {
  if (recipe.label) {
    return recipe.long_edge
      ? `${recipe.label} · ${recipe.long_edge}px`
      : recipe.label;
  }

  const recipeName = recipe.recipe_name.toLowerCase();
  const recipeFamily = recipe.family?.toLowerCase() ?? "";
  const family =
    recipeFamily === "dinov3" || recipeName.includes("dinov3")
      ? "DINOv3"
      : recipe.family || recipe.recipe_name;
  const variant = recipeName.includes("vits")
    ? "ViT-S"
    : recipeName.includes("vitb")
      ? "ViT-B"
      : recipeName.includes("vitl")
        ? "ViT-L"
        : null;
  const longEdge =
    recipe.long_edge ?? Number(getTrailingNumber(recipeName, /_(\d+)$/));

  return [family, variant, longEdge ? `${longEdge}px` : null]
    .filter(Boolean)
    .join(" · ");
}

function formatLayoutLabel(
  layout: NonNullable<LatentMapViewerData["available_layouts"]>[number],
) {
  const layoutId = layout.layout_id.toLowerCase();
  const method = layout.method
    ? layout.method.toUpperCase()
    : layoutId.includes("umap")
      ? "UMAP"
      : layout.layout_id;
  const neighbors =
    compactNumberLabel(layout.params.n_neighbors) ??
    getTrailingNumber(layoutId, /umap_n(\d+)/);
  const minDistance =
    compactNumberLabel(layout.params.min_dist) ??
    getTrailingNumber(layoutId, /mindist([0-9p]+)/);

  return [
    method,
    neighbors ? `n=${neighbors}` : null,
    minDistance ? `min=${minDistance}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatClusterResultLabel(
  cluster: NonNullable<LatentMapViewerData["available_clusters"]>[number],
) {
  const clusterId = cluster.cluster_id.toLowerCase();
  const clusterMethod = cluster.method?.toLowerCase() ?? "";
  const method =
    clusterMethod === "kmeans" || clusterId.includes("kmeans")
      ? "K-means"
      : cluster.method || cluster.cluster_id;
  const clusterCount =
    compactNumberLabel(cluster.cluster_count) ??
    getTrailingNumber(clusterId, /kmeans_k(\d+)/);

  return [method, clusterCount ? `${clusterCount} clusters` : null]
    .filter(Boolean)
    .join(" · ");
}

function formatTextureDetailLabel(
  detail: LatentMapTextureDetail | string | null,
) {
  if (detail === "auto" || detail === null || detail === "") {
    return "Auto";
  }

  return `${detail}px`;
}

function createInitialDurableState({
  data,
  initialState,
  initialRenderMode,
  initialSelectedImageId,
}: {
  data: LatentMapViewerData;
  initialState?: LatentMapDurableState;
  initialRenderMode: LatentMapRenderMode;
  initialSelectedImageId: string | null;
}) {
  if (initialState) {
    return initialState;
  }

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

function getLatentMapPreviewBox({
  height,
  maxSize,
  width,
}: {
  height: number;
  maxSize: number;
  width: number;
}) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);

  if (aspect >= 1) {
    return {
      height: Math.max(1, Math.round(maxSize / aspect)),
      width: maxSize,
    };
  }

  return {
    height: maxSize,
    width: Math.max(1, Math.round(maxSize * aspect)),
  };
}

export function LatentMapViewer({
  className,
  data,
  initialState,
  initialRenderMode = "points",
  initialSelectedImageId = null,
}: LatentMapViewerProps) {
  const initialDurableState = createInitialDurableState({
    data,
    initialState,
    initialRenderMode,
    initialSelectedImageId,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<LatentMapWebglRuntime | null>(null);
  const runtimeStateRef = useRef<LatentMapRuntimeState | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPointerRef = useRef<PointerPosition | null>(null);
  const previousResolvedTextureDetailRef = useRef<number | null>(null);
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
  const [runtimePerformanceInfo, setRuntimePerformanceInfo] =
    useState<LatentMapRuntimePerformanceInfo>();
  const [loadedThumbnailCount, setLoadedThumbnailCount] = useState(0);
  const [thumbnailSize, setThumbnailSize] =
    useState<LatentMapThumbnailSize>(initialDurableState.thumbnailSize);
  const [textureDetail, setTextureDetail] =
    useState<LatentMapTextureDetail>(initialDurableState.textureDetail);
  const [mapViewportSize, setMapViewportSize] = useState({
    height: 0,
    width: 0,
  });
  const [view, setView] = useState<LatentMapViewState>(
    initialDurableState.view,
  );
  const [clusterFilter, setClusterFilter] = useState(
    initialDurableState.clusterFilter,
  );
  const [sourceFilter, setSourceFilter] = useState(
    initialDurableState.sourceFilter,
  );
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
  const hoverPreviewBox = hoveredPoint
    ? getLatentMapPreviewBox({
        height: hoveredPoint.height,
        maxSize: DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
        width: hoveredPoint.width,
      })
    : null;
  const textureDetailOptions = useMemo(
    () => getLatentMapAvailableTextureDetails(data),
    [data],
  );
  const textureDetailScaleMultiplier = useMemo(
    () =>
      renderPoints.reduce(
        (maxScale, point) =>
          Math.max(
            maxScale,
            getLatentMapThumbnailStateScaleMultiplier(point.point_state),
          ),
        1,
      ),
    [renderPoints],
  );
  const displayThumbnailScreenLongSide = useMemo(
    () =>
      getLatentMapThumbnailScreenLongSide({
        scaleMultiplier: textureDetailScaleMultiplier,
        thumbnailSize,
        viewportHeight: mapViewportSize.height,
        zoom: view.zoom,
      }),
    [
      mapViewportSize.height,
      textureDetailScaleMultiplier,
      thumbnailSize,
      view.zoom,
    ],
  );
  // eslint-disable-next-line react-hooks/refs -- ref stores non-rendering LOD hysteresis memory.
  const previousResolvedTextureDetail = previousResolvedTextureDetailRef.current;
  const resolvedTextureDetail = useMemo(
    () =>
      resolveLatentMapTextureDetail({
        data,
        displayThumbnailScreenLongSide:
          mapViewportSize.height > 0
            ? displayThumbnailScreenLongSide
            : undefined,
        previousResolvedDetail: previousResolvedTextureDetail,
        textureDetail,
        thumbnailSize,
      }),
    [
      data,
      displayThumbnailScreenLongSide,
      mapViewportSize.height,
      previousResolvedTextureDetail,
      textureDetail,
      thumbnailSize,
    ],
  );
  const thumbnailAtlas = useMemo(
    () => getLatentMapThumbnailAtlasForSize(data, resolvedTextureDetail),
    [data, resolvedTextureDetail],
  );
  const thumbnailPlan = useMemo(
    () =>
      createLatentMapThumbnailRenderPlan({
        atlasSize: ATLAS_TEXTURE_SIZE,
        hoverPreviewSize: DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
        points: renderPoints,
        strategy: "all-atlas",
        textureDetail,
        thumbnailAtlas,
        thumbnailSize,
      }),
    [renderPoints, textureDetail, thumbnailAtlas, thumbnailSize],
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
  const thumbnailRendererComparison = useMemo(
    () => createLatentMapThumbnailRendererComparison(thumbnailPlan),
    [thumbnailPlan],
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
        performanceInfo: runtimePerformanceInfo,
        pointCount: stats.pointCount,
        renderMode,
        rendererInfo: runtimeRendererInfo,
        thumbnailPlan,
      }),
    [
      loadedThumbnailCount,
      renderMode,
      runtimePerformanceInfo,
      runtimeRendererInfo,
      stats.pointCount,
      thumbnailPlan,
    ],
  );

  useEffect(() => {
    previousResolvedTextureDetailRef.current = resolvedTextureDetail;
  }, [resolvedTextureDetail]);

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
        setRuntimePerformanceInfo(diagnostics.performanceInfo);
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

    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const updateViewportSize = () => {
      const rect = wrapper.getBoundingClientRect();
      const nextSize = {
        height: Math.max(0, Math.round(rect.height)),
        width: Math.max(0, Math.round(rect.width)),
      };

      setMapViewportSize((current) =>
        current.height === nextSize.height && current.width === nextSize.width
          ? current
          : nextSize,
      );
    };
    const ResizeObserverConstructor = window.ResizeObserver;
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(updateViewportSize)
      : null;

    updateViewportSize();

    if (resizeObserver) {
      resizeObserver.observe(wrapper);
    } else {
      window.addEventListener("resize", updateViewportSize);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateViewportSize);
      }
    };
  }, [dataMountKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextSearchParams = serializeLatentMapUrlState(
      {
        clusterFilter,
        renderMode,
        selectedImageId,
        sourceFilter,
        textureDetail,
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
    textureDetail,
    thumbnailSize,
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

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      const rect = wrapper.getBoundingClientRect();

      setView((current) =>
        createLatentMapWheelZoomView({
          deltaMode: event.deltaMode,
          deltaY: event.deltaY,
          pointer: {
            clientX: event.clientX,
            clientY: event.clientY,
          },
          view: current,
          viewport: rect,
        }),
      );
    };

    wrapper.addEventListener("wheel", handleNativeWheel, {
      passive: false,
    });

    return () => {
      wrapper.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement =
        target instanceof HTMLElement ? target : null;

      if (
        targetElement?.closest(
          "input, textarea, select, button, [contenteditable='true']",
        )
      ) {
        return;
      }

      if (event.key.toLowerCase() === "h") {
        setView(DEFAULT_VIEW);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
  }, [
    data.neighbor_lookup_path,
    data.points,
    neighborsByImageId,
    setLoadingNeighborImageId,
    setNeighborError,
    setNeighborsByImageId,
  ]);

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
          textureDetail,
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
      textureDetail,
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
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Embedding</span>
            <Select
              id="latent-map-recipe"
              name="latent-map-recipe"
              onValueChange={(nextRecipe) => {
                if (typeof nextRecipe !== "string") {
                  return;
                }

                navigateToMethodSelection({
                  recipeName: nextRecipe,
                });
              }}
              value={data.embedding_recipe}
            >
              <SelectTrigger
                aria-label="Embedding"
                className="w-[220px] justify-between"
                size="sm"
              >
                <SelectValue>
                  {(selectedRecipe) => {
                    const recipe =
                      methodOptions.recipes.find(
                        (candidate) =>
                          candidate.recipe_name === selectedRecipe,
                      ) ?? methodOptions.recipes[0];

                    return (
                      <span className="truncate">
                        {formatRecipeLabel(recipe)}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="min-w-64">
                <SelectGroup>
                  <SelectLabel>Embedding</SelectLabel>
                  {methodOptions.recipes.map((recipe) => (
                    <SelectItem
                      key={recipe.recipe_name}
                      label={formatRecipeLabel(recipe)}
                      value={recipe.recipe_name}
                    >
                      <span className="truncate">
                        {formatRecipeLabel(recipe)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Layout</span>
            <Select
              id="latent-map-layout"
              name="latent-map-layout"
              onValueChange={(nextLayout) => {
                if (typeof nextLayout !== "string") {
                  return;
                }

                navigateToMethodSelection({
                  layoutId: nextLayout,
                });
              }}
              value={data.layout_id}
            >
              <SelectTrigger
                aria-label="Layout"
                className="w-[220px] justify-between"
                size="sm"
              >
                <SelectValue>
                  {(selectedLayout) => {
                    const layout =
                      methodOptions.layouts.find(
                        (candidate) => candidate.layout_id === selectedLayout,
                      ) ?? methodOptions.layouts[0];

                    return (
                      <span className="truncate">
                        {formatLayoutLabel(layout)}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="min-w-64">
                <SelectGroup>
                  <SelectLabel>Layout</SelectLabel>
                  {methodOptions.layouts.map((layout) => (
                    <SelectItem
                      key={layout.layout_id}
                      label={formatLayoutLabel(layout)}
                      value={layout.layout_id}
                    >
                      <span className="truncate">
                        {formatLayoutLabel(layout)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Clusters</span>
            <Select
              id="latent-map-cluster-result"
              name="latent-map-cluster-result"
              onValueChange={(nextClusterId) => {
                if (typeof nextClusterId !== "string") {
                  return;
                }

                navigateToMethodSelection({
                  clusterId: nextClusterId,
                });
              }}
              value={data.cluster_id}
            >
              <SelectTrigger
                aria-label="Cluster result"
                className="w-[190px] justify-between"
                size="sm"
              >
                <SelectValue>
                  {(selectedClusterId) => {
                    const cluster =
                      methodOptions.clusters.find(
                        (candidate) =>
                          candidate.cluster_id === selectedClusterId,
                      ) ?? methodOptions.clusters[0];

                    return (
                      <span className="truncate">
                        {formatClusterResultLabel(cluster)}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="min-w-56">
                <SelectGroup>
                  <SelectLabel>Clusters</SelectLabel>
                  {methodOptions.clusters.map((cluster) => (
                    <SelectItem
                      key={cluster.cluster_id}
                      label={formatClusterResultLabel(cluster)}
                      value={cluster.cluster_id}
                    >
                      <span className="truncate">
                        {formatClusterResultLabel(cluster)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Select
            id="latent-map-cluster-filter"
            name="latent-map-cluster-filter"
            onValueChange={(nextClusterFilter) => {
              if (typeof nextClusterFilter === "string") {
                handleClusterFilterChange(nextClusterFilter);
              }
            }}
            value={clusterFilter}
          >
            <SelectTrigger
              aria-label="Cluster filter"
              className="w-[132px] justify-between"
              size="sm"
            >
              <SelectValue>
                {(selectedClusterFilter) =>
                  selectedClusterFilter === "all"
                    ? "All clusters"
                    : `Cluster ${selectedClusterFilter}`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                <SelectLabel>Cluster filter</SelectLabel>
                <SelectItem label="All clusters" value="all">
                  All clusters
                </SelectItem>
                {filterOptions.clusters.map((clusterId) => (
                  <SelectItem
                    key={clusterId}
                    label={`Cluster ${clusterId}`}
                    value={String(clusterId)}
                  >
                    Cluster {clusterId}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            id="latent-map-source-filter"
            name="latent-map-source-filter"
            onValueChange={(nextSourceFilter) => {
              if (typeof nextSourceFilter === "string") {
                handleSourceFilterChange(nextSourceFilter);
              }
            }}
            value={sourceFilter}
          >
            <SelectTrigger
              aria-label="Source filter"
              className="w-[124px] justify-between"
              size="sm"
            >
              <SelectValue>
                {(selectedSourceFilter) =>
                  selectedSourceFilter === "all"
                    ? "All sources"
                    : selectedSourceFilter
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                <SelectLabel>Source filter</SelectLabel>
                <SelectItem label="All sources" value="all">
                  All sources
                </SelectItem>
                {filterOptions.sources.map((source) => (
                  <SelectItem key={source} label={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
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
            <>
              <Select
                id="latent-map-thumbnail-size"
                name="latent-map-thumbnail-size"
                onValueChange={(nextValue) => {
                  const nextSize = Number(nextValue);

                  if (
                    LATENT_MAP_THUMBNAIL_SIZE_OPTIONS.includes(
                      nextSize as LatentMapThumbnailSize,
                    )
                  ) {
                    setThumbnailSize(nextSize as LatentMapThumbnailSize);
                  }
                }}
                value={String(thumbnailSize)}
              >
                <SelectTrigger
                  aria-label="Thumbnail display size"
                  className="w-[146px] justify-between"
                  size="sm"
                >
                  <SelectValue>
                    {(selectedSize) => (
                      <>
                        <span className="text-muted-foreground">
                          Display
                        </span>
                        <span>{selectedSize}px</span>
                      </>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="min-w-44">
                  <SelectGroup>
                    <SelectLabel>Display size</SelectLabel>
                    {LATENT_MAP_THUMBNAIL_SIZE_OPTIONS.map((size) => (
                      <SelectItem
                        key={size}
                        label={`${size}px`}
                        value={String(size)}
                      >
                        {size}px
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {textureDetailOptions.length > 0 ? (
                <Select
                  id="latent-map-texture-detail"
                  name="latent-map-texture-detail"
                  onValueChange={(value) => {
                    const nextDetail =
                      value === "auto" ? "auto" : Number(value);

                    if (
                      nextDetail === "auto" ||
                      textureDetailOptions.includes(nextDetail)
                    ) {
                      setTextureDetail(nextDetail);
                    }
                  }}
                  value={String(textureDetail)}
                >
                  <SelectTrigger
                    aria-label="Image detail"
                    className="w-[150px] justify-between"
                    size="sm"
                  >
                    <SelectValue>
                      {(selectedDetail) => (
                        <>
                          <span className="text-muted-foreground">Detail</span>
                          <span>
                            {formatTextureDetailLabel(selectedDetail)}
                          </span>
                        </>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" className="min-w-44">
                    <SelectGroup>
                      <SelectLabel>Atlas image detail</SelectLabel>
                      <SelectItem label="Auto" value="auto">
                        Auto
                      </SelectItem>
                      {textureDetailOptions.map((detail) => (
                        <SelectItem
                          key={detail}
                          label={`${detail}px`}
                          value={String(detail)}
                        >
                          {detail}px
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : null}
            </>
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
          data-runtime-average-frame-ms={runtimeSnapshot.averageFrameMs}
          data-runtime-average-render-ms={runtimeSnapshot.averageRenderMs}
          data-runtime-atlas-page-count={runtimeSnapshot.atlasPageCount}
          data-runtime-draw-calls={runtimeSnapshot.drawCalls}
          data-runtime-estimated-fps={runtimeSnapshot.estimatedFps}
          data-runtime-geometries={runtimeSnapshot.geometryCount}
          data-runtime-last-render-ms={runtimeSnapshot.lastRenderMs}
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
          data-thumbnail-atlas-tile-size={thumbnailAtlas?.tile_size ?? 0}
          data-thumbnail-display-size={thumbnailPlan.displayThumbnailSize}
          data-thumbnail-instanced-draw-calls={
            renderMode === "thumbnails"
              ? thumbnailRendererComparison.instancedAtlas.drawCalls
              : 0
          }
          data-thumbnail-instanced-textures={
            renderMode === "thumbnails"
              ? thumbnailRendererComparison.instancedAtlas.gpuTextures
              : 0
          }
          data-thumbnail-recommendation={
            thumbnailRendererComparison.recommendation
          }
          data-thumbnail-renderer="instanced-atlas"
          data-thumbnail-resolved-texture-detail={
            thumbnailPlan.resolvedTextureDetail
          }
          data-thumbnail-screen-long-side={Number(
            displayThumbnailScreenLongSide.toFixed(2),
          )}
          data-thumbnail-size={thumbnailPlan.thumbnailSize}
          data-thumbnail-sprite-baseline-draw-calls={
            renderMode === "thumbnails"
              ? thumbnailRendererComparison.spriteBaseline.drawCalls
              : 0
          }
          data-thumbnail-sprite-baseline-textures={
            renderMode === "thumbnails"
              ? thumbnailRendererComparison.spriteBaseline.gpuTextures
              : 0
          }
          data-thumbnail-source-kind="generated"
          data-thumbnail-strategy={thumbnailPlan.strategy}
          data-thumbnail-texture-detail={thumbnailPlan.textureDetail}
          data-testid="latent-map-canvas"
          onPointerDown={handlePointerDown}
          onPointerLeave={() => {
            dragStartRef.current = null;
            hoverPointerRef.current = null;
            setHoveredImageId(null);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
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

        {hoveredPoint && hoverPreviewBox ? (
          <div
            className="pointer-events-none fixed z-50 overflow-hidden rounded-lg border bg-background shadow-xl"
            style={{
              left: Math.min(
                hoverPosition.x + 14,
                window.innerWidth - hoverPreviewBox.width - 16,
              ),
              top: Math.min(
                hoverPosition.y + 14,
                window.innerHeight - hoverPreviewBox.height - 16,
              ),
              height: hoverPreviewBox.height,
              width: hoverPreviewBox.width,
            }}
        >
            <NextImage
              alt=""
              className="block size-full object-contain"
              height={hoverPreviewBox.height}
              src={hoveredPoint.preview_path ?? hoveredPoint.thumbnail_path}
              unoptimized
              width={hoverPreviewBox.width}
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
