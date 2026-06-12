"use client";

import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CircleDot, Images, Palette, RotateCcw } from "lucide-react";

import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
import { cn } from "@/lib/utils";
import {
  createLatentMapThumbnailRendererComparison,
  createLatentMapRuntimeSnapshot,
  createLatentMapThumbnailRenderPlan,
  createLatentMapPointLayerPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  getNextLatentMapTextureDetail,
  getNextLatentMapThumbnailSize,
  getLatentMapAvailableTextureDetails,
  getLatentMapFallbackThumbnailAtlas,
  getNextLatentMapSelection,
  getLatentMapThumbnailAtlasForSize,
  getLatentMapThumbnailScreenLongSide,
  getLatentMapThumbnailStateScaleMultiplier,
  DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  LATENT_MAP_FAISS_NEIGHBOR_COUNT_OPTIONS,
  LATENT_MAP_FAISS_RELATION_MODE_OPTIONS,
  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
  resolveLatentMapTextureDetail,
  shouldUseLatentMapAutoFallbackAtlas,
  type LatentMapFaissNeighborCount,
  type LatentMapFaissRelationMode,
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
import { normalizeLatentMapRelationResponse } from "@/lib/latent-map-viewer-data";
import {
  createLatentMapWebglRuntime,
  type LatentMapRuntimeState,
  type LatentMapViewState,
  type LatentMapWebglRuntime,
} from "@/lib/latent-map-webgl-runtime";
import { DEFAULT_THEME } from "@/lib/theme";

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
const FPS_COUNTER_ACTIVE_TIMEOUT_MS = 700;
const THUMBNAIL_PLANNING_VIEW_IDLE_DELAY_MS = 220;

function areLatentMapViewsEqual(
  left: LatentMapViewState,
  right: LatentMapViewState,
) {
  return (
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.zoom === right.zoom
  );
}

function getAppliedThemePreference(): LatentMapRuntimeState["visualTheme"] {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

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

function formatFaissRelationLabel(relation: LatentMapFaissRelationMode | string) {
  if (relation === "opposite") {
    return "Opposite";
  }
  if (relation === "both") {
    return "Both";
  }

  return "Closest";
}

function getFpsIndicatorTone({
  active,
  estimatedFps,
}: {
  active: boolean;
  estimatedFps: number;
}) {
  if (!active || estimatedFps <= 0) {
    return "bg-muted-foreground";
  }

  if (estimatedFps >= 50) {
    return "bg-emerald-500";
  }

  if (estimatedFps >= 30) {
    return "bg-amber-400";
  }

  return "bg-rose-500";
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
  const fpsActivityTimeoutRef = useRef<number | null>(null);
  const previousResolvedTextureDetailRef = useRef<number | null>(null);
  const dragStartRef = useRef<{
    pointer: PointerPosition;
    view: LatentMapViewState;
  } | null>(null);
  const viewRef = useRef<LatentMapViewState>(DEFAULT_VIEW);
  const [clusterColorsEnabled, setClusterColorsEnabled] = useState(true);
  const [visualTheme, setVisualTheme] =
    useState<LatentMapRuntimeState["visualTheme"]>(DEFAULT_THEME);
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
  const [oppositesByImageId, setOppositesByImageId] = useState<
    Record<string, NonNullable<LatentMapViewerData["points"][number]["opposites"]>>
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
  const [fpsCounterActive, setFpsCounterActive] = useState(false);
  const [uiOverlayHidden, setUiOverlayHidden] = useState(false);
  const [thumbnailSize, setThumbnailSize] =
    useState<LatentMapThumbnailSize>(initialDurableState.thumbnailSize);
  const [faissNeighborCount, setFaissNeighborCount] =
    useState<LatentMapFaissNeighborCount>(
      initialDurableState.faissNeighborCount,
    );
  const [faissRelationMode, setFaissRelationMode] =
    useState<LatentMapFaissRelationMode>(
      initialDurableState.faissRelationMode,
    );
  const [textureDetail, setTextureDetail] =
    useState<LatentMapTextureDetail>(initialDurableState.textureDetail);
  const [mapViewportSize, setMapViewportSize] = useState({
    height: 0,
    width: 0,
  });
  const [view, setView] = useState<LatentMapViewState>(
    initialDurableState.view,
  );
  const [thumbnailPlanningView, setThumbnailPlanningView] =
    useState<LatentMapViewState>(initialDurableState.view);
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
        faissNeighborCount,
        faissRelationMode,
        neighborsByImageId,
        oppositesByImageId,
        selectedImageId,
      }),
    [
      clusterColorsEnabled,
      faissNeighborCount,
      faissRelationMode,
      filteredData,
      neighborsByImageId,
      oppositesByImageId,
      selectedImageId,
    ],
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
  const selectedNeighborRows = selectedPoint
    ? (neighborsByImageId[selectedPoint.image_id] ?? selectedPoint.neighbors ?? [])
    : [];
  const selectedOppositeRows = selectedPoint
    ? (oppositesByImageId[selectedPoint.image_id] ?? selectedPoint.opposites ?? [])
    : [];
  const selectedVisibleClosestCount = Math.min(
    selectedNeighborRows.length,
    faissNeighborCount,
  );
  const selectedVisibleOppositeCount = Math.min(
    selectedOppositeRows.length,
    faissNeighborCount,
  );
  const selectedFocusBadgeParts = [
    faissRelationMode !== "opposite" && selectedVisibleClosestCount > 0
      ? `${selectedVisibleClosestCount} closest`
      : null,
    faissRelationMode !== "closest" && selectedVisibleOppositeCount > 0
      ? `${selectedVisibleOppositeCount} opposite`
      : null,
  ].filter(Boolean);
  const selectedFocusBadgeText = selectedFocusBadgeParts.join(" · ");
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
        zoom: thumbnailPlanningView.zoom,
      }),
    [
      mapViewportSize.height,
      textureDetailScaleMultiplier,
      thumbnailSize,
      thumbnailPlanningView.zoom,
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
  const fallbackThumbnailAtlas = useMemo(
    () =>
      shouldUseLatentMapAutoFallbackAtlas({
        availableDetails: textureDetailOptions,
        resolvedTextureDetail,
        textureDetail,
      })
        ? getLatentMapFallbackThumbnailAtlas({
            data,
            resolvedTextureDetail,
          })
        : undefined,
    [data, resolvedTextureDetail, textureDetail, textureDetailOptions],
  );
  const thumbnailViewport = useMemo(
    () =>
      mapViewportSize.height > 0 && mapViewportSize.width > 0
        ? {
            height: mapViewportSize.height,
            offsetX: thumbnailPlanningView.offsetX,
            offsetY: thumbnailPlanningView.offsetY,
            width: mapViewportSize.width,
            zoom: thumbnailPlanningView.zoom,
          }
        : undefined,
    [
      mapViewportSize.height,
      mapViewportSize.width,
      thumbnailPlanningView.offsetX,
      thumbnailPlanningView.offsetY,
      thumbnailPlanningView.zoom,
    ],
  );
  const thumbnailPlan = useMemo(
    () =>
      createLatentMapThumbnailRenderPlan({
        atlasSize: ATLAS_TEXTURE_SIZE,
        fallbackThumbnailAtlas,
        hoverPreviewSize: DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
        points: renderPoints,
        strategy: "all-atlas",
        textureDetail,
        thumbnailAtlas,
        thumbnailSize,
        viewport: thumbnailViewport,
      }),
    [
      fallbackThumbnailAtlas,
      renderPoints,
      textureDetail,
      thumbnailAtlas,
      thumbnailSize,
      thumbnailViewport,
    ],
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
      visualTheme,
    }),
    [pointLayer, renderMode, renderPoints, thumbnailPlan, visualTheme],
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
  const markFpsCounterActive = useCallback(() => {
    setFpsCounterActive(true);

    if (fpsActivityTimeoutRef.current !== null) {
      window.clearTimeout(fpsActivityTimeoutRef.current);
    }

    fpsActivityTimeoutRef.current = window.setTimeout(() => {
      fpsActivityTimeoutRef.current = null;
      setFpsCounterActive(false);
    }, FPS_COUNTER_ACTIVE_TIMEOUT_MS);
  }, []);

  const fpsIndicatorText =
    fpsCounterActive && runtimeSnapshot.estimatedFps > 0
      ? `${Math.round(runtimeSnapshot.estimatedFps)} fps`
      : "-- fps";
  const fpsIndicatorTone = getFpsIndicatorTone({
    active: fpsCounterActive,
    estimatedFps: runtimeSnapshot.estimatedFps,
  });

  useEffect(() => {
    previousResolvedTextureDetailRef.current = resolvedTextureDetail;
  }, [resolvedTextureDetail]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncVisualTheme = () => {
      setVisualTheme(getAppliedThemePreference());
    };

    syncVisualTheme();

    if (typeof MutationObserver === "undefined") {
      return;
    }

    const themeObserver = new MutationObserver(syncVisualTheme);

    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => themeObserver.disconnect();
  }, []);

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
    const updatePlanningView = () => {
      setThumbnailPlanningView((currentView) =>
        areLatentMapViewsEqual(currentView, view) ? currentView : view,
      );
    };

    if (renderMode !== "thumbnails") {
      updatePlanningView();
      return;
    }

    // Keep atlas LOD/page-cache planning off the high-frequency wheel path.
    const timeoutId = window.setTimeout(
      updatePlanningView,
      THUMBNAIL_PLANNING_VIEW_IDLE_DELAY_MS,
    );

    return () => window.clearTimeout(timeoutId);
  }, [renderMode, view]);

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
        faissNeighborCount,
        faissRelationMode,
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
    faissNeighborCount,
    faissRelationMode,
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
      if (fpsActivityTimeoutRef.current !== null) {
        window.clearTimeout(fpsActivityTimeoutRef.current);
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
      markFpsCounterActive();
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
  }, [markFpsCounterActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement =
        target instanceof HTMLElement ? target : null;

      if (
        targetElement?.closest(
          "input, textarea, select, button, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option'], [data-slot='select-content']",
        )
      ) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setThumbnailSize((currentSize) =>
          getNextLatentMapThumbnailSize({
            currentSize,
            direction: event.key === "ArrowRight" ? "next" : "previous",
          }),
        );
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setTextureDetail((currentDetail) =>
          getNextLatentMapTextureDetail({
            availableDetails: textureDetailOptions,
            currentDetail,
            direction: event.key === "ArrowDown" ? "next" : "previous",
          }),
        );
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setRenderMode((currentMode) =>
          currentMode === "points" ? "thumbnails" : "points",
        );
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setUiOverlayHidden((isHidden) => !isHidden);
        return;
      }

      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        markFpsCounterActive();
        setView(DEFAULT_VIEW);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [markFpsCounterActive, textureDetailOptions]);

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
    const loadedNeighbors = neighborsByImageId[imageId] ?? [];
    const loadedOpposites = oppositesByImageId[imageId] ?? [];
    const embeddedNeighbors = selectedPoint?.neighbors ?? [];
    const embeddedOpposites = selectedPoint?.opposites ?? [];
    const needsClosest = faissRelationMode !== "opposite";
    const needsOpposite = faissRelationMode !== "closest";
    const hasClosest =
      !needsClosest ||
      loadedNeighbors.length >= faissNeighborCount ||
      embeddedNeighbors.length >= faissNeighborCount;
    const hasOpposite =
      !needsOpposite ||
      loadedOpposites.length >= faissNeighborCount ||
      embeddedOpposites.length >= faissNeighborCount;

    if (hasClosest && hasOpposite) {
      setNeighborError(null);
      return;
    }

    if (!data.neighbor_lookup_path) {
      if (
        loadedNeighbors.length > 0 ||
        embeddedNeighbors.length > 0 ||
        loadedOpposites.length > 0 ||
        embeddedOpposites.length > 0
      ) {
        setNeighborError(null);
      } else {
        setNeighborError("FAISS neighbors are unavailable for this image.");
      }
      return;
    }

    const requestUrl = new URL(data.neighbor_lookup_path, window.location.origin);
    requestUrl.searchParams.set("image_id", imageId);
    requestUrl.searchParams.set("top_k", String(faissNeighborCount));
    requestUrl.searchParams.set(
      "relation",
      !hasClosest && !hasOpposite
        ? "both"
        : !hasOpposite
          ? "opposite"
          : "closest",
    );
    setLoadingNeighborImageId(imageId);
    setNeighborError(null);

    try {
      const response = await fetch(requestUrl);

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const relationSet = normalizeLatentMapRelationResponse(
        await response.json(),
        imageId,
      );

      if (relationSet.neighbors.length > 0) {
        setNeighborsByImageId((current) => ({
          ...current,
          [imageId]: relationSet.neighbors,
        }));
      }
      if (relationSet.opposites.length > 0) {
        setOppositesByImageId((current) => ({
          ...current,
          [imageId]: relationSet.opposites,
        }));
      }
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
    faissNeighborCount,
    faissRelationMode,
    neighborsByImageId,
    oppositesByImageId,
    setLoadingNeighborImageId,
    setNeighborError,
    setNeighborsByImageId,
    setOppositesByImageId,
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
          faissNeighborCount,
          faissRelationMode,
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
      faissNeighborCount,
      faissRelationMode,
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
      markFpsCounterActive();
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

  function handleRenderModeChange(nextValue: string | string[]) {
    const nextMode = Array.isArray(nextValue) ? nextValue[0] : nextValue;

    if (nextMode === "points" || nextMode === "thumbnails") {
      setRenderMode(nextMode);
    }
  }

  function handleThumbnailSizeChange(nextValue: string | null) {
    if (nextValue === null) {
      return;
    }

    const nextSize = Number(nextValue);

    if (
      LATENT_MAP_THUMBNAIL_SIZE_OPTIONS.includes(
        nextSize as LatentMapThumbnailSize,
      )
    ) {
      setThumbnailSize(nextSize as LatentMapThumbnailSize);
    }
  }

  function handleTextureDetailChange(value: string | null) {
    if (value === null) {
      return;
    }

    const nextDetail = value === "auto" ? "auto" : Number(value);

    if (nextDetail === "auto" || textureDetailOptions.includes(nextDetail)) {
      setTextureDetail(nextDetail);
    }
  }

  const sidebarStyle = {
    "--sidebar-width": "20rem",
    "--sidebar-width-mobile": "20rem",
  } as CSSProperties;

  return (
    <SidebarProvider
      className={cn("min-h-screen bg-background text-foreground", className)}
      defaultOpen
      style={sidebarStyle}
    >
      {!uiOverlayHidden ? (
        <Sidebar collapsible="offcanvas" variant="inset">
          <SidebarHeader>
            <div className="flex h-12 min-w-0 items-center gap-3 rounded-xl px-2 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-lg font-semibold">Anacronia</span>
              <div className="ml-auto shrink-0">
                <ThemeSwitch />
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Method</SidebarGroupLabel>
              <SidebarGroupContent>
                <FieldGroup className="gap-3">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-recipe">Embedding</FieldLabel>
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
                      className="w-full justify-between"
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
                </Field>

                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-layout">Layout</FieldLabel>
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
                      className="w-full justify-between"
                      size="sm"
                    >
                      <SelectValue>
                        {(selectedLayout) => {
                          const layout =
                            methodOptions.layouts.find(
                              (candidate) =>
                                candidate.layout_id === selectedLayout,
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
                </Field>

                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-cluster-result">
                    Clusters
                  </FieldLabel>
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
                      className="w-full justify-between"
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
                </Field>
              </FieldGroup>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Filters</SidebarGroupLabel>
            <SidebarGroupContent>
              <FieldGroup className="gap-3">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-cluster-filter">
                    Cluster
                  </FieldLabel>
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
                      className="w-full justify-between"
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
                </Field>

                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-source-filter">
                    Source
                  </FieldLabel>
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
                      className="w-full justify-between"
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
                </Field>
              </FieldGroup>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Search</SidebarGroupLabel>
            <SidebarGroupContent>
              <FieldGroup className="gap-3">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-faiss-neighbor-count">
                    Neighbors
                  </FieldLabel>
                  <Select
                    id="latent-map-faiss-neighbor-count"
                    name="latent-map-faiss-neighbor-count"
                    onValueChange={(nextValue) => {
                      const nextCount = Number(nextValue);

                      if (
                        LATENT_MAP_FAISS_NEIGHBOR_COUNT_OPTIONS.includes(
                          nextCount as LatentMapFaissNeighborCount,
                        )
                      ) {
                        setFaissNeighborCount(
                          nextCount as LatentMapFaissNeighborCount,
                        );
                      }
                    }}
                    value={String(faissNeighborCount)}
                  >
                    <SelectTrigger
                      aria-label="FAISS neighbor count"
                      className="w-full justify-between"
                      size="sm"
                    >
                      <SelectValue>
                        {(selectedCount) => `${selectedCount}`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-44">
                      <SelectGroup>
                        <SelectLabel>FAISS neighbors</SelectLabel>
                        {LATENT_MAP_FAISS_NEIGHBOR_COUNT_OPTIONS.map((count) => (
                          <SelectItem
                            key={count}
                            label={`${count} closest`}
                            value={String(count)}
                          >
                            {count} closest
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field className="gap-1.5">
                  <FieldLabel htmlFor="latent-map-faiss-relation">
                    Focus
                  </FieldLabel>
                  <Select
                    id="latent-map-faiss-relation"
                    name="latent-map-faiss-relation"
                    onValueChange={(nextValue) => {
                      if (
                        LATENT_MAP_FAISS_RELATION_MODE_OPTIONS.includes(
                          nextValue as LatentMapFaissRelationMode,
                        )
                      ) {
                        setFaissRelationMode(
                          nextValue as LatentMapFaissRelationMode,
                        );
                      }
                    }}
                    value={faissRelationMode}
                  >
                    <SelectTrigger
                      aria-label="FAISS focus"
                      className="w-full justify-between"
                      size="sm"
                    >
                      <SelectValue>
                        {(selectedRelation) =>
                          formatFaissRelationLabel(selectedRelation)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-40">
                      <SelectGroup>
                        <SelectLabel>FAISS focus</SelectLabel>
                        {LATENT_MAP_FAISS_RELATION_MODE_OPTIONS.map(
                          (relation) => (
                            <SelectItem
                              key={relation}
                              label={formatFaissRelationLabel(relation)}
                              value={relation}
                            >
                              {formatFaissRelationLabel(relation)}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </SidebarGroupContent>
          </SidebarGroup>

          </SidebarContent>
        </Sidebar>
      ) : null}

      <SidebarInset
        className={cn(
          "min-w-0 overflow-hidden bg-[#f0f0f0] dark:bg-[#101113]",
          uiOverlayHidden && "m-0 rounded-none shadow-none md:m-0",
        )}
      >
        {!uiOverlayHidden ? (
          <div className="pointer-events-auto absolute left-3 top-3 z-30">
            <SidebarTrigger className="bg-background/85 shadow-sm" />
          </div>
        ) : null}
        <section className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={wrapperRef}
            aria-label="Latent image map"
            className="absolute inset-0 cursor-crosshair touch-none bg-[#f0f0f0] dark:bg-[#101113]"
            data-cluster-colors={clusterColorsEnabled}
            data-cluster-filter={clusterFilter}
            data-faiss-neighbor-count={faissNeighborCount}
            data-faiss-relation={faissRelationMode}
            data-map-theme={visualTheme}
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
            data-ui-overlay-hidden={uiOverlayHidden}
            data-point-layer-size={pointLayer.pointSize}
            data-point-layer-visible={pointLayer.visible}
            data-thumbnail-atlas-page-count={
              renderMode === "thumbnails"
                ? thumbnailPlan.atlasPages.length +
                  thumbnailPlan.fallbackAtlasPages.length
                : 0
            }
            data-thumbnail-atlas-cache-active={thumbnailPlan.atlasPageCacheActive}
            data-thumbnail-atlas-page-budget={thumbnailPlan.atlasPageBudget ?? 0}
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
            data-thumbnail-planning-zoom={Number(
              thumbnailPlanningView.zoom.toFixed(4),
            )}
            data-thumbnail-fallback-atlas-page-count={
              thumbnailPlan.fallbackAtlasPages.length
            }
            data-thumbnail-fallback-texture-detail={
              thumbnailPlan.fallbackResolvedTextureDetail ?? 0
            }
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
            data-thumbnail-total-atlas-page-count={
              thumbnailPlan.totalAtlasPageCount
            }
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

          {!uiOverlayHidden ? (
            <div
              className="pointer-events-auto absolute left-3 top-14 z-20 w-28 rounded-2xl border border-border/55 bg-background/80 p-1.5 shadow-sm backdrop-blur-md"
              data-testid="latent-map-display-controls"
            >
              <FieldGroup className="gap-1.5">
              <Field className="gap-1">
                <FieldLabel className="sr-only">Mode</FieldLabel>
                <ToggleGroup
                  aria-label="Map render mode"
                  className="w-full"
                  size="sm"
                  spacing={0}
                  value={[renderMode]}
                  variant="outline"
                  onValueChange={handleRenderModeChange}
                >
                  <ToggleGroupItem
                    aria-label="Points"
                    className="h-7 flex-1 px-0"
                    title="Points"
                    value="points"
                  >
                    <CircleDot data-icon="inline-start" />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    aria-label="Thumbnails"
                    className="h-7 flex-1 px-0"
                    title="Thumbnails"
                    value="thumbnails"
                  >
                    <Images data-icon="inline-start" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <Field className="gap-1">
                <FieldLabel
                  className="sr-only"
                  htmlFor="latent-map-thumbnail-size"
                >
                  Size
                </FieldLabel>
                <Select
                  id="latent-map-thumbnail-size"
                  name="latent-map-thumbnail-size"
                  onValueChange={handleThumbnailSizeChange}
                  value={String(thumbnailSize)}
                >
                  <SelectTrigger
                    aria-label="Thumbnail display size"
                    className="h-7 w-full justify-between px-2 text-xs"
                    size="sm"
                  >
                    <SelectValue>
                      {(selectedSize) => `${selectedSize}px`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" className="min-w-32">
                    <SelectGroup>
                      <SelectLabel>Size</SelectLabel>
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
              </Field>

              {textureDetailOptions.length > 0 ? (
                <Field className="gap-1">
                  <FieldLabel
                    className="sr-only"
                    htmlFor="latent-map-texture-detail"
                  >
                    Detail
                  </FieldLabel>
                  <Select
                    id="latent-map-texture-detail"
                    name="latent-map-texture-detail"
                    onValueChange={handleTextureDetailChange}
                    value={String(textureDetail)}
                  >
                    <SelectTrigger
                      aria-label="Image detail"
                      className="h-7 w-full justify-between px-2 text-xs"
                      size="sm"
                    >
                      <SelectValue>
                        {(selectedDetail) =>
                          formatTextureDetailLabel(selectedDetail)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-32">
                      <SelectGroup>
                        <SelectLabel>Detail</SelectLabel>
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
                </Field>
              ) : null}

              <div className="grid grid-cols-2 gap-1">
                <Button
                  aria-label="Cluster colors"
                  aria-pressed={clusterColorsEnabled}
                  className="w-full"
                  onClick={() =>
                    setClusterColorsEnabled((isEnabled) => !isEnabled)
                  }
                  size="icon-sm"
                  title="Cluster colors"
                  variant={clusterColorsEnabled ? "secondary" : "outline"}
                >
                  <Palette data-icon="inline-start" />
                </Button>
                <Button
                  aria-label="Reset view"
                  className="w-full"
                  onClick={() => {
                    markFpsCounterActive();
                    setView(DEFAULT_VIEW);
                  }}
                  size="icon-sm"
                  title="Reset view"
                  variant="outline"
                >
                  <RotateCcw data-icon="inline-start" />
                </Button>
              </div>
              </FieldGroup>
            </div>
          ) : null}

          {!uiOverlayHidden ? (
            <div className="pointer-events-none absolute bottom-3 right-3 z-20">
              <div
                aria-label={`WebGL performance ${fpsIndicatorText}`}
                className="flex h-7 items-center gap-2 rounded-lg border border-border/50 bg-background/70 px-2.5 font-mono text-[11px] leading-none text-foreground/85 shadow-sm backdrop-blur-sm"
                data-testid="latent-map-fps-counter"
              >
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", fpsIndicatorTone)}
                />
                <span className="min-w-10 tabular-nums">
                  {fpsIndicatorText}
                </span>
              </div>
            </div>
          ) : null}

          {!uiOverlayHidden ? (
            <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
            {selectedPoint && selectedFocusBadgeText ? (
              <>
                <Badge
                  className="bg-background/85 text-foreground"
                  variant="outline"
                >
                  {selectedFocusBadgeText}
                </Badge>
              </>
            ) : null}
            {loadingNeighborImageId ? (
              <Badge
                className="bg-background/85 text-foreground"
                variant="outline"
              >
                Loading FAISS neighbors
              </Badge>
            ) : null}
            {neighborError ? (
              <Badge
                className="bg-background/85 text-foreground"
                variant="outline"
              >
                {neighborError}
              </Badge>
            ) : null}
            </div>
          ) : null}

          {hoveredPoint && hoverPreviewBox ? (
            <div
              className="pointer-events-none fixed z-50 overflow-hidden rounded-lg bg-background shadow-2xl ring-0"
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
      </SidebarInset>
    </SidebarProvider>
  );
}
