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
import { Keyboard, Palette, X } from "lucide-react";

import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
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
  getLatentMapThumbnailAtlasManifestStatus,
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
  type LatentMapClusterGroup,
  type LatentMapRenderMode,
  type LatentMapRuntimePerformanceInfo,
  type LatentMapTextureDetail,
  type LatentMapRuntimeRendererInfo,
  type LatentMapThumbnailSize,
  type LatentMapGeneratedThumbnailAtlas,
  type LatentMapPoint,
  type LatentMapViewerData,
} from "@/lib/latent-map-viewer";
import { getLatentMapHoverPreviewSources } from "@/lib/latent-map-hover-preview";
import {
  createLatentMapPointerHitRadius,
  createLatentMapSpatialIndex,
} from "@/lib/latent-map-spatial-index";
import {
  createLatentMapScreenSurfaceWheelZoomView,
  createLatentMapScreenTargetWheelZoomView,
  createLatentMapWheelZoomView,
} from "@/lib/latent-map-view-controls";
import {
  createLatentMapViewTween,
  shouldAnimateLatentMapView,
  stepLatentMapViewTween,
  type LatentMapViewTween,
} from "@/lib/latent-map-view-tween";
import { getLatentMapNeighborhoodKeyboardAction } from "@/lib/latent-map-neighborhood-mode";
import {
  LATENT_MAP_SHORTCUT_HELP_ITEMS,
  shouldYieldLatentMapShortcutToFocusedTarget,
} from "@/lib/latent-map-keyboard-shortcuts";
import {
  getLatentMapNeighborhoodClickAction,
  isLatentMapNeighborRequestCurrent,
} from "@/lib/latent-map-neighborhood-interaction";
import { createLatentMapNeighborhoodPreviewPlan } from "@/lib/latent-map-neighborhood-previews";
import {
  createLatentMapNeighborhoodRuntimePlan,
  getLatentMapNeighborhoodMaxZoom,
} from "@/lib/latent-map-neighborhood-targets";
import {
  createLatentMapFilterOptions,
  DEFAULT_LATENT_MAP_DURABLE_STATE,
  filterLatentMapViewerData,
  serializeLatentMapUrlState,
  type LatentMapDurableState,
} from "@/lib/latent-map-viewer-state";
import {
  mergeLatentMapViewerDataThumbnailAtlases,
  normalizeLatentMapRelationResponse,
} from "@/lib/latent-map-viewer-data";
import type { LatentMapStartupMeasurement } from "@/lib/latent-map-startup-measurement";
import {
  createLatentMapWebglRuntime,
  getLatentMapThumbnailWorldScale,
  type LatentMapRuntimeState,
  type LatentMapViewState,
  type LatentMapWebglRuntime,
  type LatentMapRuntimeDiagnostics,
} from "@/lib/latent-map-webgl-runtime";
import { DEFAULT_THEME } from "@/lib/theme";

type LatentMapViewerProps = {
  className?: string;
  data: LatentMapViewerData;
  initialState?: LatentMapDurableState;
  initialRenderMode?: LatentMapRenderMode;
  initialSelectedImageId?: string | null;
  startupMeasurement?: LatentMapStartupMeasurement;
};

type PointerPosition = {
  x: number;
  y: number;
};

type HoverPointerPosition = PointerPosition & {
  lookupId: number;
};

type LatentMapViewStateUpdate =
  | LatentMapViewState
  | ((current: LatentMapViewState) => LatentMapViewState);

const DEFAULT_VIEW: LatentMapViewState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};
const ATLAS_TEXTURE_SIZE = 2048;
const FPS_COUNTER_ACTIVE_TIMEOUT_MS = 700;
const HOVER_PREVIEW_PRELOAD_DELAY_MS = 75;
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

function isLatentMapGeneratedThumbnailAtlas(
  value: unknown,
): value is LatentMapGeneratedThumbnailAtlas {
  return Boolean(
    value &&
      typeof value === "object" &&
      "tile_size" in value &&
      typeof value.tile_size === "number" &&
      "pages" in value &&
      Array.isArray(value.pages) &&
      "items" in value &&
      Array.isArray(value.items),
  );
}

function mergeLazyThumbnailAtlases(
  current: LatentMapGeneratedThumbnailAtlas[],
  nextAtlases: LatentMapGeneratedThumbnailAtlas[],
) {
  const atlasesBySize = new Map<number, LatentMapGeneratedThumbnailAtlas>();

  [...current, ...nextAtlases].forEach((atlas) => {
    if (!atlasesBySize.has(atlas.tile_size)) {
      atlasesBySize.set(atlas.tile_size, atlas);
    }
  });

  return [...atlasesBySize.values()].sort(
    (left, right) => left.tile_size - right.tile_size,
  );
}

function mergeUnavailableThumbnailAtlasTileSizes(
  current: number[],
  nextTileSizes: number[],
  loadedAtlases: LatentMapGeneratedThumbnailAtlas[],
) {
  const loadedTileSizes = new Set(loadedAtlases.map((atlas) => atlas.tile_size));

  return [...new Set([...current, ...nextTileSizes])]
    .filter(
      (tileSize) =>
        Number.isFinite(tileSize) &&
        tileSize > 0 &&
        !loadedTileSizes.has(tileSize),
    )
    .sort((left, right) => left - right);
}

type LazyThumbnailAtlasManifestResult = {
  atlas?: LatentMapGeneratedThumbnailAtlas;
  tileSize: number;
};

function getAppliedThemePreference(): LatentMapRuntimeState["visualTheme"] {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function isLatentMapTextEditingShortcutTarget(
  targetElement: HTMLElement | null,
) {
  return Boolean(
    targetElement?.closest(
      "input, textarea, [contenteditable='true'], [contenteditable='']",
    ),
  );
}

function isLatentMapOpenCompositeShortcutTarget({
  key,
  targetElement,
}: {
  key: string;
  targetElement: HTMLElement | null;
}) {
  if (!targetElement) {
    return false;
  }

  if (
    targetElement.closest(
      "[data-slot='select-content'], [data-slot='dropdown-menu-content'], [data-slot='popover-content'], [role='listbox'], [role='option']",
    )
  ) {
    return true;
  }

  if (
    key === "Escape" ||
    key === "Enter" ||
    key === " " ||
    key.startsWith("Arrow")
  ) {
    return Boolean(
      targetElement.closest("[aria-expanded='true'], [data-state='open']"),
    );
  }

  return false;
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
  if (cluster.label) {
    return cluster.label;
  }

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

function formatGroupFilterLabel(group: LatentMapClusterGroup) {
  return `${group.label} · ${group.count}`;
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

function getLatentMapHoverAtlasPreview({
  point,
  thumbnailAtlas,
}: {
  point: LatentMapPoint;
  thumbnailAtlas: LatentMapGeneratedThumbnailAtlas | undefined;
}): LatentMapHoverAtlasPreview | null {
  if (!thumbnailAtlas) {
    return null;
  }

  const item = thumbnailAtlas.items.find(
    (candidate) => candidate.image_id === point.image_id,
  );

  if (!item) {
    return null;
  }

  const page = thumbnailAtlas.pages.find(
    (candidate) => candidate.index === item.page_index,
  );
  const rect = item.content_rect ?? item.tile_rect;

  if (
    !page ||
    page.path.length === 0 ||
    page.width <= 0 ||
    page.height <= 0 ||
    rect[2] <= 0 ||
    rect[3] <= 0
  ) {
    return null;
  }

  return {
    pageHeight: page.height,
    pagePath: page.path,
    pageWidth: page.width,
    rect,
  };
}

type LatentMapPreviewBox = ReturnType<typeof getLatentMapPreviewBox>;
type LatentMapHoverPreviewStatus = "failed" | "loading" | "ready";
type LatentMapHoverAtlasPreview = {
  pageHeight: number;
  pagePath: string;
  pageWidth: number;
  rect: [number, number, number, number];
};

export function LatentMapHoverPreview({
  atlasPreview,
  box,
  point,
  position,
}: {
  atlasPreview?: LatentMapHoverAtlasPreview | null;
  box: LatentMapPreviewBox;
  point: LatentMapPoint;
  position: PointerPosition;
}) {
  const { fallbackSource, primarySource } =
    getLatentMapHoverPreviewSources(point);
  const thumbnailSource = fallbackSource ?? primarySource;
  const initialSource = atlasPreview ? null : thumbnailSource;
  const [failedPrimarySource, setFailedPrimarySource] = useState<string | null>(
    null,
  );
  const [activeSource, setActiveSource] = useState(initialSource);
  const [loadState, setLoadState] = useState<{
    source: string | null;
    status: LatentMapHoverPreviewStatus;
  }>({
    source: initialSource,
    status: initialSource ? "loading" : atlasPreview ? "ready" : "failed",
  });
  const previewSource =
    primarySource &&
    primarySource !== thumbnailSource &&
    failedPrimarySource !== primarySource
      ? primarySource
      : null;
  const placeholderReady =
    Boolean(atlasPreview) ||
    Boolean(
      thumbnailSource &&
        activeSource === thumbnailSource &&
        loadState.source === thumbnailSource &&
        loadState.status === "ready",
    );
  const status =
    activeSource && loadState.source === activeSource
      ? loadState.status
      : atlasPreview
        ? "ready"
        : activeSource
          ? "loading"
          : "failed";

  useEffect(() => {
    if (!previewSource || !placeholderReady || typeof window === "undefined") {
      return undefined;
    }

    let image: HTMLImageElement | null = null;
    const timeoutId = window.setTimeout(() => {
      image = new window.Image();
      image.onload = () => {
        setActiveSource(previewSource);
        setLoadState({ source: previewSource, status: "ready" });
      };
      image.onerror = () => {
        setFailedPrimarySource(previewSource);
      };
      image.src = previewSource;
    }, HOVER_PREVIEW_PRELOAD_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (!image) {
        return;
      }
      image.onload = null;
      image.onerror = null;
    };
  }, [placeholderReady, previewSource]);

  if ((!activeSource && !atlasPreview) || status === "failed") {
    return null;
  }

  const viewportWidth =
    typeof window === "undefined"
      ? position.x + box.width + 30
      : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined"
      ? position.y + box.height + 30
      : window.innerHeight;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed z-50 overflow-hidden rounded-lg ring-0 transition-opacity duration-75",
        status === "ready"
          ? "bg-background opacity-100 shadow-2xl"
          : "opacity-0",
      )}
      data-hover-preview-fallback-source={fallbackSource ?? ""}
      data-hover-preview-image-id={point.image_id}
      data-hover-preview-preview-source={primarySource ?? ""}
      data-hover-preview-source={activeSource ?? atlasPreview?.pagePath ?? ""}
      data-hover-preview-source-kind={
        activeSource
          ? activeSource.includes("previews%2F")
            ? "preview"
            : "thumbnail"
          : "atlas"
      }
      data-hover-preview-status={status}
      data-testid="latent-map-hover-preview"
      style={{
        left: Math.min(position.x + 14, viewportWidth - box.width - 16),
        top: Math.min(position.y + 14, viewportHeight - box.height - 16),
        height: box.height,
        width: box.width,
      }}
    >
      {activeSource ? (
        <NextImage
          key={`${point.image_id}:${activeSource}`}
          alt=""
          className="block size-full object-contain"
          height={box.height}
          loading="eager"
          onError={() => {
            if (primarySource && activeSource === primarySource) {
              setFailedPrimarySource(primarySource);
              if (atlasPreview) {
                setActiveSource(null);
                setLoadState({ source: null, status: "ready" });
                return;
              }
              if (fallbackSource) {
                setActiveSource(fallbackSource);
                setLoadState({ source: fallbackSource, status: "loading" });
                return;
              }
            }

            if (primarySource && activeSource !== primarySource) {
              setActiveSource(primarySource);
              setLoadState({ source: primarySource, status: "loading" });
              return;
            }

            setLoadState({ source: activeSource, status: "failed" });
          }}
          onLoad={() => setLoadState({ source: activeSource, status: "ready" })}
          src={activeSource}
          unoptimized
          width={box.width}
        />
      ) : atlasPreview ? (
        <LatentMapHoverAtlasImage atlasPreview={atlasPreview} box={box} />
      ) : null}
    </div>
  );
}

function LatentMapHoverAtlasImage({
  atlasPreview,
  box,
}: {
  atlasPreview: LatentMapHoverAtlasPreview;
  box: LatentMapPreviewBox;
}) {
  const [rectX, rectY, rectWidth, rectHeight] = atlasPreview.rect;
  const scale = Math.min(
    box.width / Math.max(rectWidth, 1),
    box.height / Math.max(rectHeight, 1),
  );
  const width = Math.max(1, Math.round(rectWidth * scale));
  const height = Math.max(1, Math.round(rectHeight * scale));

  return (
    <div className="flex size-full items-center justify-center">
      <div
        className="bg-no-repeat"
        style={{
          backgroundImage: `url("${atlasPreview.pagePath}")`,
          backgroundPosition: `${-rectX * scale}px ${-rectY * scale}px`,
          backgroundSize: `${atlasPreview.pageWidth * scale}px ${atlasPreview.pageHeight * scale}px`,
          filter: "blur(4px)",
          height,
          transform: "scale(1.03)",
          width,
        }}
      />
    </div>
  );
}

export function LatentMapViewer({
  className,
  data: initialData,
  initialState,
  initialRenderMode = "points",
  initialSelectedImageId = null,
  startupMeasurement,
}: LatentMapViewerProps) {
  const initialDataKey = [
    initialData.run_id,
    initialData.embedding_recipe,
    initialData.layout_id,
    initialData.cluster_id,
    initialData.points.length,
  ].join("|");
  const [lazyThumbnailAtlasState, setLazyThumbnailAtlasState] = useState<{
    atlases: LatentMapGeneratedThumbnailAtlas[];
    dataKey: string;
    unavailableTileSizes: number[];
  }>({
    atlases: [],
    dataKey: initialDataKey,
    unavailableTileSizes: [],
  });
  const lazyThumbnailAtlases = useMemo(
    () =>
      lazyThumbnailAtlasState.dataKey === initialDataKey
        ? lazyThumbnailAtlasState.atlases
        : [],
    [initialDataKey, lazyThumbnailAtlasState],
  );
  const unavailableThumbnailAtlasTileSizes = useMemo(
    () =>
      lazyThumbnailAtlasState.dataKey === initialDataKey
        ? lazyThumbnailAtlasState.unavailableTileSizes
        : [],
    [initialDataKey, lazyThumbnailAtlasState],
  );
  const data = useMemo(
    () =>
      mergeLatentMapViewerDataThumbnailAtlases(
        initialData,
        lazyThumbnailAtlases,
      ),
    [initialData, lazyThumbnailAtlases],
  );
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
  const hoverPointerRef = useRef<HoverPointerPosition | null>(null);
  const hoverLookupIdRef = useRef(0);
  const fpsActivityTimeoutRef = useRef<number | null>(null);
  const previousResolvedTextureDetailRef = useRef<number | null>(null);
  const latestNeighborRequestIdRef = useRef(0);
  const neighborhoodRestoreRenderModeRef = useRef<LatentMapRenderMode | null>(
    null,
  );
  const neighborhoodRestoreViewRef = useRef<LatentMapViewState | null>(null);
  const pendingNeighborhoodRecenterRef = useRef(false);
  const viewTweenFrameRef = useRef<number | null>(null);
  const viewTweenRef = useRef<LatentMapViewTween | null>(null);
  const dragStartRef = useRef<{
    pointer: PointerPosition;
    view: LatentMapViewState;
  } | null>(null);
  const viewRef = useRef<LatentMapViewState>(DEFAULT_VIEW);
  const [clusterColorsEnabled, setClusterColorsEnabled] = useState(true);
  const [visualTheme, setVisualTheme] =
    useState<LatentMapRuntimeState["visualTheme"]>(DEFAULT_THEME);
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<HoverPointerPosition>({
    lookupId: 0,
    x: 0,
    y: 0,
  });
  const [resolvedHoverLookupId, setResolvedHoverLookupId] = useState(0);
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
  const [runtimePreviewTextureInfo, setRuntimePreviewTextureInfo] =
    useState<
      LatentMapRuntimeDiagnostics["neighborhoodPreviewTextures"] | undefined
    >();
  const [loadedThumbnailCount, setLoadedThumbnailCount] = useState(0);
  const [fpsCounterActive, setFpsCounterActive] = useState(false);
  const [uiOverlayHidden, setUiOverlayHidden] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [neighborhoodModeActive, setNeighborhoodModeActive] = useState(false);
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
  const [viewTweenActive, setViewTweenActive] = useState(false);
  const [viewTweenCount, setViewTweenCount] = useState(0);
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
  const liveNeighborLookupEnabled = Boolean(data.neighbor_lookup_path);
  const relationData = useMemo(() => {
    if (!liveNeighborLookupEnabled) {
      return filteredData;
    }

    return {
      ...filteredData,
      points: filteredData.points.map((point) => ({
        ...point,
        neighbors: [],
        opposites: [],
      })),
    };
  }, [filteredData, liveNeighborLookupEnabled]);
  const stats = useMemo(() => createLatentMapStats(filteredData), [filteredData]);
  const totalStats = useMemo(() => createLatentMapStats(data), [data]);
  const renderPoints = useMemo(
    () =>
      createLatentMapRenderState({
        clusterColorsEnabled,
        clusterFilter,
        data: relationData,
        faissNeighborCount,
        faissRelationMode,
        neighborsByImageId,
        oppositesByImageId,
        selectedImageId,
      }),
    [
      clusterColorsEnabled,
      clusterFilter,
      faissNeighborCount,
      faissRelationMode,
      neighborsByImageId,
      oppositesByImageId,
      relationData,
      selectedImageId,
    ],
  );
  const neighborhoodRuntimePlan = useMemo(
    () =>
      createLatentMapNeighborhoodRuntimePlan({
        neighborCount: faissNeighborCount,
        neighborsByImageId,
        oppositesByImageId,
        points: renderPoints,
        relationMode: faissRelationMode,
        selectedImageId,
        thumbnailSize,
        viewport: {
          height: Math.max(mapViewportSize.height, 1),
          width: Math.max(mapViewportSize.width, 1),
        },
      }),
    [
      faissNeighborCount,
      faissRelationMode,
      mapViewportSize.height,
      mapViewportSize.width,
      neighborsByImageId,
      oppositesByImageId,
      renderPoints,
      selectedImageId,
      thumbnailSize,
    ],
  );
  const neighborhoodLayoutActive =
    neighborhoodModeActive && neighborhoodRuntimePlan.status === "ready";
  const neighborhoodActiveImageCount =
    neighborhoodRuntimePlan.activeImageIds.size;
  const neighborhoodMaxZoom = useMemo(
    () =>
      neighborhoodLayoutActive
        ? getLatentMapNeighborhoodMaxZoom(neighborhoodRuntimePlan.points)
        : null,
    [neighborhoodLayoutActive, neighborhoodRuntimePlan.points],
  );
  const runtimeRenderPoints = useMemo(() => {
    if (!neighborhoodLayoutActive) {
      return renderPoints;
    }

    return neighborhoodRuntimePlan.points.map((point) =>
      point.image_id === selectedImageId
        ? {
            ...point,
            point_state: "selected" as const,
          }
        : neighborhoodRuntimePlan.activeImageIds.has(point.image_id)
          ? {
              ...point,
              point_state: neighborhoodRuntimePlan.oppositeImageIds.has(
                point.image_id,
              )
                ? "opposite" as const
                : "neighbor" as const,
            }
          : {
              ...point,
              point_state: "base" as const,
            },
    );
  }, [
    neighborhoodLayoutActive,
    neighborhoodRuntimePlan.activeImageIds,
    neighborhoodRuntimePlan.oppositeImageIds,
    neighborhoodRuntimePlan.points,
    renderPoints,
    selectedImageId,
  ]);
  const neighborhoodPreviewPlan = useMemo(
    () =>
      createLatentMapNeighborhoodPreviewPlan({
        activeImageIds: neighborhoodRuntimePlan.activeImageIds,
        isActive: neighborhoodLayoutActive,
        layout: neighborhoodRuntimePlan.layout,
        points: runtimeRenderPoints,
      }),
    [
      neighborhoodLayoutActive,
      neighborhoodRuntimePlan.activeImageIds,
      neighborhoodRuntimePlan.layout,
      runtimeRenderPoints,
    ],
  );
  const spatialIndex = useMemo(
    () => createLatentMapSpatialIndex(runtimeRenderPoints),
    [runtimeRenderPoints],
  );
  const selectedPoint = useMemo(
    () =>
      filteredData.points.find((point) => point.image_id === selectedImageId) ??
      null,
    [filteredData.points, selectedImageId],
  );
  const selectedNeighborRows = selectedPoint
    ? (neighborsByImageId[selectedPoint.image_id] ??
      (liveNeighborLookupEnabled ? [] : selectedPoint.neighbors ?? []))
    : [];
  const selectedOppositeRows = selectedPoint
    ? (oppositesByImageId[selectedPoint.image_id] ??
      (liveNeighborLookupEnabled ? [] : selectedPoint.opposites ?? []))
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
  const hoverPreviewEnabled = !neighborhoodLayoutActive;
  const hoverPreviewBox = hoverPreviewEnabled && hoveredPoint
    ? getLatentMapPreviewBox({
        height: hoveredPoint.height,
        maxSize: DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
        width: hoveredPoint.width,
      })
    : null;
  const hoverPreviewResolved =
    hoverPosition.lookupId === resolvedHoverLookupId;
  const textureDetailOptions = useMemo(
    () => getLatentMapAvailableTextureDetails(data),
    [data],
  );
  const textureDetailScaleMultiplier = useMemo(
    () =>
      runtimeRenderPoints.reduce(
        (maxScale, point) =>
          Math.max(
            maxScale,
            getLatentMapThumbnailStateScaleMultiplier(point.point_state),
          ),
        1,
      ),
    [runtimeRenderPoints],
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
  const thumbnailAtlasManifestStatus = useMemo(
    () =>
      getLatentMapThumbnailAtlasManifestStatus({
        atlases: [
          ...(data.thumbnail_atlases ?? []),
          ...(data.thumbnail_atlas ? [data.thumbnail_atlas] : []),
        ],
        manifestUrls: initialData.thumbnail_atlas_manifest_urls,
        unavailableTileSizes: unavailableThumbnailAtlasTileSizes,
      }),
    [
      data.thumbnail_atlas,
      data.thumbnail_atlases,
      initialData.thumbnail_atlas_manifest_urls,
      unavailableThumbnailAtlasTileSizes,
    ],
  );
  const thumbnailAtlasManifestPending = useMemo(() => {
    if (renderMode !== "thumbnails") {
      return false;
    }

    return thumbnailAtlasManifestStatus.pendingTileSizes.length > 0;
  }, [renderMode, thumbnailAtlasManifestStatus.pendingTileSizes.length]);
  const runtimeRenderMode: LatentMapRenderMode = thumbnailAtlasManifestPending
    ? "points"
    : renderMode;
  const hoverAtlasPreview = hoveredPoint
    ? getLatentMapHoverAtlasPreview({
        point: hoveredPoint,
        thumbnailAtlas,
      })
    : null;
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
        points: thumbnailAtlasManifestPending ? [] : runtimeRenderPoints,
        strategy: "all-atlas",
        textureDetail,
        thumbnailAtlas,
        thumbnailSize,
        viewport: thumbnailViewport,
      }),
    [
      fallbackThumbnailAtlas,
      runtimeRenderPoints,
      thumbnailAtlasManifestPending,
      textureDetail,
      thumbnailAtlas,
      thumbnailSize,
      thumbnailViewport,
    ],
  );
  const pointLayer = useMemo(
    () => {
      const nextPointLayer = createLatentMapPointLayerPlan({
        points: runtimeRenderPoints,
        renderMode: runtimeRenderMode,
        thumbnailPlan,
      });

      if (neighborhoodLayoutActive) {
        return {
          ...nextPointLayer,
          points: [],
          visible: false,
        };
      }

      return nextPointLayer;
    },
    [
      neighborhoodLayoutActive,
      runtimeRenderMode,
      runtimeRenderPoints,
      thumbnailPlan,
    ],
  );
  const thumbnailRendererComparison = useMemo(
    () => createLatentMapThumbnailRendererComparison(thumbnailPlan),
    [thumbnailPlan],
  );
  const runtimeState = useMemo<LatentMapRuntimeState>(
    () => ({
      neighborhoodPreviewPlan,
      pointLayer,
      points: runtimeRenderPoints,
      renderMode: runtimeRenderMode,
      thumbnailPlan,
      tweenPoints: runtimeRenderPoints,
      visualTheme,
    }),
    [
      neighborhoodPreviewPlan,
      pointLayer,
      runtimeRenderMode,
      runtimeRenderPoints,
      thumbnailPlan,
      visualTheme,
    ],
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
  useEffect(() => {
    if (renderMode !== "thumbnails") {
      return;
    }

    const manifestUrls = initialData.thumbnail_atlas_manifest_urls ?? {};
    const missingManifestUrls = thumbnailAtlasManifestStatus.pendingTileSizes
      .map((tileSize) => ({
        manifestUrl: manifestUrls[String(tileSize)],
        tileSize,
      }))
      .filter(
        (
          request,
        ): request is {
          manifestUrl: string;
          tileSize: number;
        } => typeof request.manifestUrl === "string",
      );

    if (missingManifestUrls.length === 0) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    void Promise.all(
      missingManifestUrls.map(
        async ({
          manifestUrl,
          tileSize,
        }): Promise<LazyThumbnailAtlasManifestResult> => {
          try {
            const response = await fetch(manifestUrl, {
              signal: abortController.signal,
            });

            if (!response.ok) {
              return { tileSize };
            }

            const atlas = await response.json() as unknown;

            return isLatentMapGeneratedThumbnailAtlas(atlas)
              ? { atlas, tileSize }
              : { tileSize };
          } catch (error: unknown) {
            if (
              error instanceof DOMException &&
              error.name === "AbortError"
            ) {
              throw error;
            }

            return { tileSize };
          }
        },
      ),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }

        const validAtlases = results
          .map((result) => result.atlas)
          .filter((atlas): atlas is LatentMapGeneratedThumbnailAtlas =>
            Boolean(atlas),
          );
        const unavailableTileSizes = results
          .filter((result) => !result.atlas)
          .map((result) => result.tileSize);

        if (validAtlases.length === 0 && unavailableTileSizes.length === 0) {
          return;
        }

        setLazyThumbnailAtlasState((current) => {
          const currentAtlases =
            current.dataKey === initialDataKey ? current.atlases : [];
          const currentUnavailableTileSizes =
            current.dataKey === initialDataKey
              ? current.unavailableTileSizes
              : [];
          const atlases = mergeLazyThumbnailAtlases(
            currentAtlases,
            validAtlases,
          );

          return {
            atlases,
            dataKey: initialDataKey,
            unavailableTileSizes: mergeUnavailableThumbnailAtlasTileSizes(
              currentUnavailableTileSizes,
              unavailableTileSizes,
              atlases,
            ),
          };
        });
      })
      .catch((error: unknown) => {
        if (
          !cancelled &&
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    initialDataKey,
    initialData.thumbnail_atlas_manifest_urls,
    renderMode,
    thumbnailAtlasManifestStatus.pendingTileSizes,
  ]);
  const runtimeSnapshot = useMemo(
    () =>
      createLatentMapRuntimeSnapshot({
        loadedThumbnailCount,
        neighborhoodPreviewTextureInfo: runtimePreviewTextureInfo,
        performanceInfo: runtimePerformanceInfo,
        pointCount: stats.pointCount,
        renderMode: runtimeRenderMode,
        rendererInfo: runtimeRendererInfo,
        thumbnailPlan,
      }),
    [
      loadedThumbnailCount,
      runtimeRenderMode,
      runtimePreviewTextureInfo,
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
  const cancelViewTween = useCallback(() => {
    if (viewTweenFrameRef.current !== null) {
      window.cancelAnimationFrame(viewTweenFrameRef.current);
      viewTweenFrameRef.current = null;
    }

    viewTweenRef.current = null;
    setViewTweenActive(false);
  }, []);
  const setViewImmediately = useCallback(
    (nextView: LatentMapViewStateUpdate) => {
      cancelViewTween();
      setView((currentView) =>
        typeof nextView === "function" ? nextView(currentView) : nextView,
      );
    },
    [cancelViewTween],
  );
  const animateViewTo = useCallback(
    (targetView: LatentMapViewState) => {
      const now = window.performance.now();
      const activeTween = viewTweenRef.current;
      const currentView = activeTween
        ? stepLatentMapViewTween(activeTween, now).view
        : viewRef.current;

      cancelViewTween();

      if (
        !shouldAnimateLatentMapView({
          from: currentView,
          to: targetView,
        })
      ) {
        setView(targetView);
        return;
      }

      const tween = createLatentMapViewTween({
        from: currentView,
        now,
        to: targetView,
      });

      viewTweenRef.current = tween;
      setViewTweenActive(true);
      setViewTweenCount((count) => count + 1);
      setView(currentView);

      const stepTween = (frameNow: number) => {
        const activeViewTween = viewTweenRef.current;

        if (activeViewTween !== tween) {
          return;
        }

        const result = stepLatentMapViewTween(activeViewTween, frameNow);

        setView(result.view);

        if (result.isAnimating) {
          viewTweenFrameRef.current = window.requestAnimationFrame(stepTween);
          return;
        }

        viewTweenFrameRef.current = null;
        viewTweenRef.current = null;
        setViewTweenActive(false);
      };

      viewTweenFrameRef.current = window.requestAnimationFrame(stepTween);
    },
    [cancelViewTween],
  );
  const exitNeighborhoodMode = useCallback(() => {
    pendingNeighborhoodRecenterRef.current = false;
    hoverPointerRef.current = null;
    setHoveredImageId(null);
    setNeighborhoodModeActive(false);

    const restoreRenderMode = neighborhoodRestoreRenderModeRef.current;
    const restoreView = neighborhoodRestoreViewRef.current;

    neighborhoodRestoreRenderModeRef.current = null;
    neighborhoodRestoreViewRef.current = null;

    if (restoreRenderMode) {
      setRenderMode(restoreRenderMode);
    }
    if (restoreView) {
      animateViewTo(restoreView);
    }
  }, [animateViewTo]);
  const cancelNeighborhoodModeForManualModeChange = useCallback(() => {
    pendingNeighborhoodRecenterRef.current = false;
    hoverPointerRef.current = null;
    setHoveredImageId(null);
    const restoreView = neighborhoodRestoreViewRef.current;

    neighborhoodRestoreRenderModeRef.current = null;
    neighborhoodRestoreViewRef.current = null;
    if (restoreView) {
      setViewImmediately(restoreView);
    }
    setNeighborhoodModeActive(false);
  }, [setViewImmediately]);
  const enterNeighborhoodMode = useCallback(() => {
    if (!selectedImageId) {
      return;
    }

    if (!neighborhoodModeActive) {
      neighborhoodRestoreRenderModeRef.current = renderMode;
      neighborhoodRestoreViewRef.current = viewRef.current;
    }

    pendingNeighborhoodRecenterRef.current = true;
    hoverPointerRef.current = null;
    setHoveredImageId(null);
    setRenderMode("thumbnails");
    setNeighborhoodModeActive(true);
    markFpsCounterActive();
  }, [
    markFpsCounterActive,
    neighborhoodModeActive,
    renderMode,
    selectedImageId,
  ]);

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
    if (
      !neighborhoodLayoutActive ||
      !pendingNeighborhoodRecenterRef.current ||
      !neighborhoodRuntimePlan.recenterView
    ) {
      return;
    }

    if (
      loadingNeighborImageId === selectedImageId &&
      neighborhoodActiveImageCount <= 1
    ) {
      return;
    }

    const nextView = neighborhoodRuntimePlan.recenterView;
    const frameId = window.requestAnimationFrame(() => {
      pendingNeighborhoodRecenterRef.current = false;
      markFpsCounterActive();
      animateViewTo(nextView);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    animateViewTo,
    loadingNeighborImageId,
    markFpsCounterActive,
    neighborhoodActiveImageCount,
    neighborhoodLayoutActive,
    neighborhoodRuntimePlan.recenterView,
    selectedImageId,
  ]);

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
        setRuntimePreviewTextureInfo(diagnostics.neighborhoodPreviewTextures);
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

    const serializedView =
      neighborhoodModeActive && neighborhoodRestoreViewRef.current
        ? neighborhoodRestoreViewRef.current
        : view;
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
        view: serializedView,
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
    neighborhoodModeActive,
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
      if (viewTweenFrameRef.current !== null) {
        window.cancelAnimationFrame(viewTweenFrameRef.current);
      }
      viewTweenRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const getWheelNeighborhoodGridPointAt = (pointer: PointerPosition) => {
      const runtime = runtimeRef.current;

      if (!runtime || !neighborhoodLayoutActive) {
        return null;
      }

      const rect = wrapper.getBoundingClientRect();
      const localPointer = {
        x: pointer.x - rect.left,
        y: pointer.y - rect.top,
      };
      let nearestPoint: (typeof runtimeRenderPoints)[number] | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const point of runtimeRenderPoints) {
        if (
          point.image_id === selectedImageId ||
          !neighborhoodRuntimePlan.activeImageIds.has(point.image_id)
        ) {
          continue;
        }

        const screenBounds = runtime.getPointScreenBounds(point.image_id);

        if (!screenBounds) {
          continue;
        }

        const dx = localPointer.x - screenBounds.centerX;
        const dy = localPointer.y - screenBounds.centerY;

        if (
          Math.abs(dx) > screenBounds.width / 2 ||
          Math.abs(dy) > screenBounds.height / 2
        ) {
          continue;
        }

        const distance = Math.hypot(dx, dy);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPoint = point;
        }
      }

      return nearestPoint;
    };

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      markFpsCounterActive();
      const rect = wrapper.getBoundingClientRect();
      const wheelPointer = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      const canvasPointer = {
        x: event.clientX,
        y: event.clientY,
      };
      const neighborhoodGridPoint =
        neighborhoodLayoutActive
          ? getWheelNeighborhoodGridPointAt(canvasPointer)
          : null;
      const neighborhoodGridBounds =
        neighborhoodGridPoint && runtimeRef.current
          ? runtimeRef.current.getPointScreenBounds(
              neighborhoodGridPoint.image_id,
            )
          : null;

      setViewImmediately((current) =>
        neighborhoodLayoutActive && neighborhoodRuntimePlan.recenterView
          ? createLatentMapScreenTargetWheelZoomView({
              bounds: neighborhoodGridBounds,
              deltaMode: event.deltaMode,
              deltaY: event.deltaY,
              maxZoom: neighborhoodMaxZoom,
              pointer: wheelPointer,
              target: neighborhoodGridPoint,
              view: current,
              viewport: rect,
            }) ??
            createLatentMapScreenSurfaceWheelZoomView({
              baseView: neighborhoodRuntimePlan.recenterView,
              deltaMode: event.deltaMode,
              deltaY: event.deltaY,
              maxZoom: neighborhoodMaxZoom,
              pointer: wheelPointer,
              view: current,
              viewport: rect,
            })
          : createLatentMapWheelZoomView({
              deltaMode: event.deltaMode,
              deltaY: event.deltaY,
              pointer: wheelPointer,
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
  }, [
    markFpsCounterActive,
    neighborhoodLayoutActive,
    neighborhoodMaxZoom,
    neighborhoodRuntimePlan.activeImageIds,
    neighborhoodRuntimePlan.recenterView,
    runtimeRenderPoints,
    selectedImageId,
    setViewImmediately,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement =
        target instanceof HTMLElement ? target : null;

      if (shortcutsHelpOpen && event.key === "Escape") {
        event.preventDefault();
        setShortcutsHelpOpen(false);
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (
        shouldYieldLatentMapShortcutToFocusedTarget({
          isOpenCompositeTarget: isLatentMapOpenCompositeShortcutTarget({
            key: event.key,
            targetElement,
          }),
          isTextEditingTarget:
            isLatentMapTextEditingShortcutTarget(targetElement),
        })
      ) {
        return;
      }

      const neighborhoodAction = getLatentMapNeighborhoodKeyboardAction({
        key: event.key,
        mapRecenterView: DEFAULT_VIEW,
        mode: {
          isActive: neighborhoodModeActive,
          recenterView: neighborhoodRuntimePlan.recenterView,
          selectedImageId,
        },
      });

      if (neighborhoodAction) {
        event.preventDefault();

        if (neighborhoodAction.kind === "enter") {
          enterNeighborhoodMode();
          return;
        }

        if (neighborhoodAction.kind === "exit") {
          markFpsCounterActive();
          exitNeighborhoodMode();
          return;
        }

        markFpsCounterActive();
        animateViewTo(neighborhoodAction.view);
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
        cancelNeighborhoodModeForManualModeChange();
        setRenderMode((currentMode) =>
          currentMode === "points" ? "thumbnails" : "points",
        );
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setShortcutsHelpOpen(false);
        setUiOverlayHidden((isHidden) => !isHidden);
        return;
      }

    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    animateViewTo,
    cancelNeighborhoodModeForManualModeChange,
    enterNeighborhoodMode,
    exitNeighborhoodMode,
    markFpsCounterActive,
    neighborhoodModeActive,
    neighborhoodRuntimePlan.recenterView,
    selectedImageId,
    shortcutsHelpOpen,
    textureDetailOptions,
  ]);

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

  function getNeighborhoodGridPointAt({
    includeSelected = false,
    pointer,
  }: {
    includeSelected?: boolean;
    pointer: PointerPosition;
  }) {
    const wrapper = wrapperRef.current;
    const runtime = runtimeRef.current;
    const worldPoint = runtime?.getWorldPoint(pointer.x, pointer.y) ?? null;

    if (!wrapper || !runtime || !worldPoint || !neighborhoodLayoutActive) {
      return null;
    }

    const rect = wrapper.getBoundingClientRect();
    const localPointer = {
      x: pointer.x - rect.left,
      y: pointer.y - rect.top,
    };
    let nearestPoint: (typeof runtimeRenderPoints)[number] | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of runtimeRenderPoints) {
      if (
        (!includeSelected && point.image_id === selectedImageId) ||
        !neighborhoodRuntimePlan.activeImageIds.has(point.image_id) ||
        typeof point.tween_x !== "number" ||
        typeof point.tween_y !== "number"
      ) {
        continue;
      }

      const screenBounds = runtime.getPointScreenBounds(point.image_id);

      if (screenBounds) {
        const dx = localPointer.x - screenBounds.centerX;
        const dy = localPointer.y - screenBounds.centerY;

        if (
          Math.abs(dx) > screenBounds.width / 2 ||
          Math.abs(dy) > screenBounds.height / 2
        ) {
          continue;
        }

        const distance = Math.hypot(dx, dy);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPoint = point;
        }

        continue;
      }

      const tweenValues = runtime.getPointTweenValues(point.image_id);

      if (!tweenValues) {
        continue;
      }

      const [baseWidth, baseHeight] = getLatentMapThumbnailWorldScale({
        point,
        thumbnailSize,
        viewportHeight: rect.height,
        zoom: viewRef.current.zoom,
      });
      const scaleMultiplier =
        Number.isFinite(tweenValues.size) && tweenValues.size > 0
          ? tweenValues.size
          : 1;
      const width = baseWidth * scaleMultiplier;
      const height = baseHeight * scaleMultiplier;
      const dx = worldPoint.x - tweenValues.x;
      const dy = worldPoint.y - tweenValues.y;

      if (Math.abs(dx) > width / 2 || Math.abs(dy) > height / 2) {
        continue;
      }

      const distance = Math.hypot(dx, dy);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  function scheduleHoverLookup(pointer: HoverPointerPosition) {
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

      if (neighborhoodLayoutActive) {
        setHoveredImageId(null);
        setResolvedHoverLookupId(nextPointer.lookupId);
        return;
      }

      setHoveredImageId(getNearestPointAt(nextPointer)?.image_id ?? null);
      setResolvedHoverLookupId(nextPointer.lookupId);
    });
  }

  const loadNeighborsForImage = useCallback(async (imageId: string) => {
    const requestId = latestNeighborRequestIdRef.current + 1;

    latestNeighborRequestIdRef.current = requestId;

    const selectedPoint = data.points.find((point) => point.image_id === imageId);
    const loadedNeighbors = neighborsByImageId[imageId] ?? [];
    const loadedOpposites = oppositesByImageId[imageId] ?? [];
    const needsClosest = faissRelationMode !== "opposite";
    const needsOpposite = faissRelationMode !== "closest";

    if (data.neighbor_lookup_path) {
      const hasClosest =
        !needsClosest || loadedNeighbors.length >= faissNeighborCount;
      const hasOpposite =
        !needsOpposite || loadedOpposites.length >= faissNeighborCount;

      if (hasClosest && hasOpposite) {
        setLoadingNeighborImageId(null);
        setNeighborError(null);
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
        if (
          isLatentMapNeighborRequestCurrent({
            latestRequestId: latestNeighborRequestIdRef.current,
            requestId,
          })
        ) {
          setNeighborError(null);
        }
      } catch {
        if (
          isLatentMapNeighborRequestCurrent({
            latestRequestId: latestNeighborRequestIdRef.current,
            requestId,
          })
        ) {
          setNeighborError("FAISS neighbors are unavailable for this image.");
        }
      } finally {
        if (
          isLatentMapNeighborRequestCurrent({
            latestRequestId: latestNeighborRequestIdRef.current,
            requestId,
          })
        ) {
          setLoadingNeighborImageId((current) =>
            current === imageId ? null : current,
          );
        }
      }
      return;
    }

    const embeddedNeighbors = selectedPoint?.neighbors ?? [];
    const embeddedOpposites = selectedPoint?.opposites ?? [];
    const hasFallbackClosest =
      !needsClosest ||
      loadedNeighbors.length > 0 ||
      embeddedNeighbors.length > 0;
    const hasFallbackOpposite =
      !needsOpposite ||
      loadedOpposites.length > 0 ||
      embeddedOpposites.length > 0;

    setLoadingNeighborImageId(null);
    setNeighborError(
      hasFallbackClosest && hasFallbackOpposite
        ? null
        : "FAISS neighbors are unavailable for this image.",
    );
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

      const serializedView =
        neighborhoodModeActive && neighborhoodRestoreViewRef.current
          ? neighborhoodRestoreViewRef.current
          : view;
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
          view: serializedView,
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
      neighborhoodModeActive,
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
    const hoverLookupId = hoverLookupIdRef.current + 1;
    const hoverPointer = {
      lookupId: hoverLookupId,
      x: event.clientX,
      y: event.clientY,
    };

    hoverLookupIdRef.current = hoverLookupId;
    setHoverPosition({
      lookupId: hoverPointer.lookupId,
      x: hoverPointer.x,
      y: hoverPointer.y,
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

      setViewImmediately({
        ...dragStart.view,
        offsetX: dragStart.view.offsetX + deltaX,
        offsetY: dragStart.view.offsetY + deltaY,
      });
      setHoveredImageId(null);
      return;
    }

    scheduleHoverLookup(hoverPointer);
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

    if (neighborhoodLayoutActive) {
      const clickedPoint = getNeighborhoodGridPointAt({
        pointer: {
          x: event.clientX,
          y: event.clientY,
        },
      });
      const action = getLatentMapNeighborhoodClickAction({
        activeImageIds: neighborhoodRuntimePlan.activeImageIds,
        clickedImageId: clickedPoint?.image_id ?? null,
        isActive: neighborhoodLayoutActive,
        selectedImageId,
      });

      if (action.kind === "select") {
        pendingNeighborhoodRecenterRef.current = true;
        setSelectedImageId(action.imageId);
        markFpsCounterActive();
        void loadNeighborsForImage(action.imageId);
      }

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
      exitNeighborhoodMode();
      setNeighborError(null);
      setLoadingNeighborImageId(null);
      return;
    }

    void loadNeighborsForImage(nextSelectedImageId);
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
  const startupMeasurementJson = startupMeasurement
    ? JSON.stringify(startupMeasurement).replaceAll("<", "\\u003c")
    : null;

  return (
    <SidebarProvider
      className={cn("min-h-screen bg-background text-foreground", className)}
      defaultOpen
      style={sidebarStyle}
    >
      {startupMeasurementJson ? (
        <script
          data-testid="latent-map-startup-measurement"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: startupMeasurementJson }}
        />
      ) : null}
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
                    Group
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
                      aria-label="Group focus"
                      className="w-full justify-between"
                      size="sm"
                    >
                      <SelectValue>
                        {(selectedClusterFilter) =>
                          selectedClusterFilter === "all"
                            ? "All groups"
                            : formatGroupFilterLabel(
                                filterOptions.groups.find(
                                  (group) =>
                                    group.group_key === selectedClusterFilter,
                                ) ?? {
                                  cluster_id: 0,
                                  count: 0,
                                  group_key: selectedClusterFilter,
                                  kind: "cluster",
                                  label: selectedClusterFilter,
                                },
                              )
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectGroup>
                        <SelectLabel>Group focus</SelectLabel>
                        <SelectItem label="All groups" value="all">
                          All groups
                        </SelectItem>
                        {filterOptions.groups.map((group) => (
                          <SelectItem
                            key={group.group_key}
                            label={formatGroupFilterLabel(group)}
                            value={group.group_key}
                          >
                            {formatGroupFilterLabel(group)}
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
            data-hover-preview-enabled={hoverPreviewEnabled}
            data-map-theme={visualTheme}
            data-neighborhood-active={neighborhoodLayoutActive}
            data-neighborhood-active-count={neighborhoodActiveImageCount}
            data-neighborhood-mode={neighborhoodModeActive}
            data-neighborhood-row-count={
              neighborhoodRuntimePlan.layout.status === "ready"
                ? neighborhoodRuntimePlan.layout.rows.length
                : 0
            }
            data-neighborhood-status={neighborhoodRuntimePlan.status}
            data-point-count={stats.pointCount}
            data-render-mode={renderMode}
            data-runtime-render-mode={runtimeRenderMode}
            data-startup-artifact-fetch-ms={
              startupMeasurement?.summary.artifactFetchMs
            }
            data-startup-measured={startupMeasurement ? "true" : undefined}
            data-startup-normalization-ms={
              startupMeasurement?.summary.normalizationMs
            }
            data-startup-serialization-bytes={
              startupMeasurement?.summary.serializationBytes
            }
            data-startup-total-ms={startupMeasurement?.totalMs}
            data-runtime-average-frame-ms={runtimeSnapshot.averageFrameMs}
            data-runtime-average-render-ms={runtimeSnapshot.averageRenderMs}
            data-runtime-atlas-page-count={runtimeSnapshot.atlasPageCount}
            data-runtime-draw-calls={runtimeSnapshot.drawCalls}
            data-runtime-estimated-fps={runtimeSnapshot.estimatedFps}
            data-runtime-geometries={runtimeSnapshot.geometryCount}
            data-runtime-last-render-ms={runtimeSnapshot.lastRenderMs}
            data-runtime-loaded-thumbnails={runtimeSnapshot.loadedThumbnailCount}
            data-runtime-preview-texture-budget={
              runtimeSnapshot.neighborhoodPreviewTextureBudget
            }
            data-runtime-preview-texture-bytes={
              runtimeSnapshot.neighborhoodPreviewTextureBytes
            }
            data-runtime-preview-texture-count={
              runtimeSnapshot.neighborhoodPreviewTextureCount
            }
            data-runtime-preview-texture-failed={
              runtimeSnapshot.neighborhoodPreviewFailedTextureCount
            }
            data-runtime-preview-texture-loading={
              runtimeSnapshot.neighborhoodPreviewLoadingTextureCount
            }
            data-runtime-preview-texture-requested={
              runtimeSnapshot.neighborhoodPreviewRequestedTextureCount
            }
            data-runtime-renderer-points={runtimeSnapshot.rendererPointCount}
            data-runtime-renderer-triangles={runtimeSnapshot.rendererTriangleCount}
            data-runtime-textures={runtimeSnapshot.liveTextureCount}
            data-selected-image-id={selectedImageId ?? undefined}
            data-shortcuts-help-open={shortcutsHelpOpen}
            data-source-filter={sourceFilter}
            data-total-point-count={totalStats.pointCount}
            data-ui-overlay-hidden={uiOverlayHidden}
            data-point-layer-size={pointLayer.pointSize}
            data-point-layer-visible={pointLayer.visible}
            data-thumbnail-atlas-page-count={
              runtimeRenderMode === "thumbnails"
                ? thumbnailPlan.atlasPages.length +
                  thumbnailPlan.fallbackAtlasPages.length
                : 0
            }
            data-thumbnail-atlas-cache-active={thumbnailPlan.atlasPageCacheActive}
            data-thumbnail-atlas-page-budget={thumbnailPlan.atlasPageBudget ?? 0}
            data-thumbnail-estimated-atlas-texture-bytes={
              runtimeRenderMode === "thumbnails"
                ? thumbnailPlan.estimatedAtlasTextureBytes
                : 0
            }
            data-thumbnail-count={
              runtimeRenderMode === "thumbnails"
                ? thumbnailPlan.thumbnailPoints.length
                : 0
            }
            data-thumbnail-atlas-manifest-pending={thumbnailAtlasManifestPending}
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
              runtimeRenderMode === "thumbnails"
                ? thumbnailRendererComparison.instancedAtlas.drawCalls
                : 0
            }
            data-thumbnail-instanced-textures={
              runtimeRenderMode === "thumbnails"
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
              runtimeRenderMode === "thumbnails"
                ? thumbnailRendererComparison.spriteBaseline.drawCalls
                : 0
            }
            data-thumbnail-sprite-baseline-textures={
              runtimeRenderMode === "thumbnails"
                ? thumbnailRendererComparison.spriteBaseline.gpuTextures
                : 0
            }
            data-thumbnail-source-kind="generated"
            data-thumbnail-strategy={thumbnailPlan.strategy}
            data-thumbnail-texture-detail={thumbnailPlan.textureDetail}
            data-thumbnail-total-atlas-page-count={
              thumbnailPlan.totalAtlasPageCount
            }
            data-view-tween-active={viewTweenActive}
            data-view-tween-count={viewTweenCount}
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
            <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-end gap-2">
              <div
                className="pointer-events-auto relative flex items-end gap-2"
                data-testid="latent-map-canvas-control-strip"
              >
                {shortcutsHelpOpen ? (
                  <Card
                    aria-label="Latent map shortcuts"
                    className="absolute bottom-9 right-0 w-72 rounded-2xl border border-border/55 bg-background/85 py-3 shadow-sm backdrop-blur-md"
                    data-testid="latent-map-shortcuts-help"
                    id="latent-map-shortcuts-help"
                    size="sm"
                  >
                    <CardHeader className="grid-cols-[1fr_auto] gap-2 px-3">
                      <CardTitle className="text-sm">Shortcuts</CardTitle>
                      <CardAction>
                        <Button
                          aria-label="Close shortcuts"
                          onClick={() => setShortcutsHelpOpen(false)}
                          size="icon-xs"
                          title="Close shortcuts"
                          variant="ghost"
                        >
                          <X data-icon="inline-start" />
                        </Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="px-3">
                      <dl className="flex flex-col gap-1.5">
                        {LATENT_MAP_SHORTCUT_HELP_ITEMS.map((item) => (
                          <div
                            className="grid grid-cols-[4.5rem_1fr] items-center gap-2"
                            key={item.label}
                          >
                            <dt>
                              <KbdGroup>
                                {item.keys.map((key) => (
                                  <Kbd key={key}>{key}</Kbd>
                                ))}
                              </KbdGroup>
                            </dt>
                            <dd className="min-w-0 text-xs leading-snug text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {item.label}
                              </span>
                              <span aria-hidden="true"> · </span>
                              {item.description}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>
                ) : null}

                <Field className="gap-0">
                  <FieldLabel
                    className="sr-only"
                    htmlFor="latent-map-thumbnail-size"
                  >
                    Thumbnail display size
                  </FieldLabel>
                  <Select
                    id="latent-map-thumbnail-size"
                    name="latent-map-thumbnail-size"
                    onValueChange={handleThumbnailSizeChange}
                    value={String(thumbnailSize)}
                  >
                    <SelectTrigger
                      aria-label="Thumbnail display size"
                      className="h-7 w-[4.75rem] justify-between rounded-lg border-border/50 bg-background/70 px-2 text-xs text-foreground/85 shadow-sm backdrop-blur-sm"
                      data-testid="latent-map-thumbnail-size-control"
                      size="sm"
                    >
                      <SelectValue>
                        {(selectedSize) => `${selectedSize}px`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="end" className="min-w-32">
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
                  <Field className="gap-0">
                    <FieldLabel
                      className="sr-only"
                      htmlFor="latent-map-texture-detail"
                    >
                      Thumbnail detail
                    </FieldLabel>
                    <Select
                      id="latent-map-texture-detail"
                      name="latent-map-texture-detail"
                      onValueChange={handleTextureDetailChange}
                      value={String(textureDetail)}
                    >
                      <SelectTrigger
                        aria-label="Thumbnail detail"
                        className="h-7 w-[4.75rem] justify-between rounded-lg border-border/50 bg-background/70 px-2 text-xs text-foreground/85 shadow-sm backdrop-blur-sm"
                        data-testid="latent-map-texture-detail-control"
                        size="sm"
                      >
                        <SelectValue>
                          {(selectedDetail) =>
                            formatTextureDetailLabel(selectedDetail)
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="end" className="min-w-32">
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

                <Button
                  aria-label="Cluster colors"
                  aria-pressed={clusterColorsEnabled}
                  className="h-7 rounded-lg border-border/50 bg-background/70 text-foreground/85 shadow-sm backdrop-blur-sm"
                  data-testid="latent-map-cluster-colors-button"
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
                  aria-controls="latent-map-shortcuts-help"
                  aria-expanded={shortcutsHelpOpen}
                  aria-label="Show keyboard shortcuts"
                  className="h-7 rounded-lg border-border/50 bg-background/70 text-foreground/85 shadow-sm backdrop-blur-sm"
                  data-testid="latent-map-shortcuts-button"
                  onClick={() =>
                    setShortcutsHelpOpen((isOpen) => !isOpen)
                  }
                  size="icon-sm"
                  title="Shortcuts"
                  variant="outline"
                >
                  <Keyboard data-icon="inline-start" />
                </Button>

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

          {hoveredPoint && hoverPreviewBox && hoverPreviewResolved ? (
            <LatentMapHoverPreview
              key={hoveredPoint.image_id}
              atlasPreview={hoverAtlasPreview}
              box={hoverPreviewBox}
              point={hoveredPoint}
              position={hoverPosition}
            />
          ) : null}
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
