"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
  type LatentMapRenderMode,
  type LatentMapRuntimeRendererInfo,
  type LatentMapThumbnailSize,
  type LatentMapViewerData,
} from "@/lib/latent-map-viewer";
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

export function LatentMapViewer({
  className,
  data,
  initialRenderMode = "points",
}: LatentMapViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<LatentMapWebglRuntime | null>(null);
  const runtimeStateRef = useRef<LatentMapRuntimeState | null>(null);
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
    data.points[0]?.image_id ?? null,
  );
  const [renderMode, setRenderMode] =
    useState<LatentMapRenderMode>(initialRenderMode);
  const [runtimeRendererInfo, setRuntimeRendererInfo] =
    useState<LatentMapRuntimeRendererInfo>();
  const [loadedThumbnailCount, setLoadedThumbnailCount] = useState(0);
  const [thumbnailSize, setThumbnailSize] =
    useState<LatentMapThumbnailSize>(DEFAULT_LATENT_MAP_THUMBNAIL_SIZE);
  const [view, setView] = useState<LatentMapViewState>(DEFAULT_VIEW);
  const stats = useMemo(() => createLatentMapStats(data), [data]);
  const renderPoints = useMemo(
    () =>
      createLatentMapRenderState({
        clusterColorsEnabled,
        data,
        selectedImageId,
      }),
    [clusterColorsEnabled, data, selectedImageId],
  );
  const selectedPoint = useMemo(
    () =>
      data.points.find((point) => point.image_id === selectedImageId) ?? null,
    [data.points, selectedImageId],
  );
  const hoveredPoint = useMemo(
    () => data.points.find((point) => point.image_id === hoveredImageId) ?? null,
    [data.points, hoveredImageId],
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
  const runtimeState = useMemo<LatentMapRuntimeState>(
    () => ({
      points: renderPoints,
      renderMode,
      thumbnailPlan,
    }),
    [renderMode, renderPoints, thumbnailPlan],
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

  function getWorldPointFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    return runtimeRef.current?.getWorldPoint(event.clientX, event.clientY) ?? null;
  }

  function getNearestPoint(event: React.PointerEvent<HTMLDivElement>) {
    const worldPoint = getWorldPointFromPointer(event);

    if (!worldPoint) {
      return null;
    }

    return findNearestLatentMapPoint({
      maxDistance: 0.065 / view.zoom,
      points: renderPoints,
      x: worldPoint.x,
      y: worldPoint.y,
    });
  }

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

    setHoveredImageId(getNearestPoint(event)?.image_id ?? null);
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

    const nearestPoint = getNearestPoint(event);

    if (nearestPoint) {
      setSelectedImageId(nearestPoint.image_id);
    }
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
          <Badge variant="outline">{stats.clusterCount} clusters</Badge>
          <Badge variant="outline">{data.embedding_recipe}</Badge>
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
        <div className="flex shrink-0 items-center gap-2">
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
                {selectedPoint.neighbors.length} neighbors
              </Badge>
            </>
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
