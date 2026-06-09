"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Images, Palette, RotateCcw, ScanSearch } from "lucide-react";
import * as THREE from "three";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  createLatentMapThumbnailRenderPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  DEFAULT_LATENT_MAP_THUMBNAIL_CAP,
  type LatentMapRenderMode,
  type LatentMapRenderablePoint,
  type LatentMapViewerData,
} from "@/lib/latent-map-viewer";

type LatentMapViewerProps = {
  className?: string;
  data: LatentMapViewerData;
  initialRenderMode?: LatentMapRenderMode;
};

type ViewState = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

type PointerPosition = {
  x: number;
  y: number;
};

const DEFAULT_VIEW: ViewState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};
const THUMBNAIL_BASE_WORLD_SIZE = 0.13;

function rgbToThreeColor([r, g, b]: [number, number, number]): THREE.Color {
  return new THREE.Color(r / 255, g / 255, b / 255);
}

function updateCamera({
  camera,
  height,
  view,
  width,
}: {
  camera: THREE.OrthographicCamera;
  height: number;
  view: ViewState;
  width: number;
}) {
  const aspect = width / Math.max(height, 1);

  camera.left = -aspect;
  camera.right = aspect;
  camera.top = 1;
  camera.bottom = -1;
  camera.position.x = view.offsetX;
  camera.position.y = view.offsetY;
  camera.zoom = view.zoom;
  camera.updateProjectionMatrix();
}

function createPointGeometry(points: LatentMapRenderablePoint[]) {
  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);

  points.forEach((point, index) => {
    positions[index * 3] = point.fitted_x;
    positions[index * 3 + 1] = point.fitted_y;
    positions[index * 3 + 2] = point.point_state === "selected" ? 0.08 : 0;

    const color = rgbToThreeColor(point.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return geometry;
}

function getThumbnailScale(point: LatentMapRenderablePoint): [number, number] {
  const aspect = Math.max(point.width, 1) / Math.max(point.height, 1);
  const scaleMultiplier =
    point.point_state === "selected" ? 1.36 : point.point_state === "neighbor" ? 1.16 : 1;
  const baseSize = THUMBNAIL_BASE_WORLD_SIZE * scaleMultiplier;
  const boundedAspect = Math.min(1.45, Math.max(0.7, aspect));

  if (boundedAspect >= 1) {
    return [baseSize * boundedAspect, baseSize];
  }

  return [baseSize, baseSize / boundedAspect];
}

function createThumbnailSprite(point: LatentMapRenderablePoint) {
  const material = new THREE.SpriteMaterial({
    color: rgbToThreeColor(point.color),
    opacity: point.point_state === "cluster" ? 0.88 : 0.98,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  const [width, height] = getThumbnailScale(point);

  sprite.position.set(
    point.fitted_x,
    point.fitted_y,
    point.point_state === "selected" ? 0.3 : 0.18,
  );
  sprite.scale.set(width, height, 1);
  sprite.renderOrder =
    point.point_state === "selected" ? 30 : point.point_state === "neighbor" ? 20 : 10;

  return { material, sprite };
}

export function LatentMapViewer({
  className,
  data,
  initialRenderMode = "points",
}: LatentMapViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const dragStartRef = useRef<{
    pointer: PointerPosition;
    view: ViewState;
  } | null>(null);
  const viewRef = useRef<ViewState>(DEFAULT_VIEW);
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
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
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
        maxThumbnails: DEFAULT_LATENT_MAP_THUMBNAIL_CAP,
        points: renderPoints,
      }),
    [renderPoints],
  );

  const renderCurrentScene = useCallback(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const wrapper = wrapperRef.current;

    if (!camera || !renderer || !scene || !wrapper) {
      return;
    }

    const { height, width } = wrapper.getBoundingClientRect();
    renderer.setSize(width, height, false);
    updateCamera({
      camera,
      height,
      view: viewRef.current,
      width,
    });
    renderer.render(scene, camera);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !wrapper) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
    });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    const geometry = createPointGeometry(renderPoints);
    const material = new THREE.PointsMaterial({
      alphaTest: 0.2,
      size: 9,
      sizeAttenuation: false,
      vertexColors: true,
    });
    const pointCloud = new THREE.Points(geometry, material);
    const thumbnailMaterials: THREE.SpriteMaterial[] = [];
    const thumbnailTextures: THREE.Texture[] = [];
    let isDisposed = false;

    renderer.setClearColor(0x101113, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene.add(pointCloud);

    if (renderMode === "thumbnails") {
      const textureLoader = new THREE.TextureLoader();

      thumbnailPlan.thumbnailPoints.forEach((point) => {
        const { material: spriteMaterial, sprite } = createThumbnailSprite(point);

        thumbnailMaterials.push(spriteMaterial);
        scene.add(sprite);
        textureLoader.load(point.thumbnail_path, (texture) => {
          if (isDisposed) {
            texture.dispose();
            return;
          }

          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          spriteMaterial.map = texture;
          spriteMaterial.needsUpdate = true;
          thumbnailTextures.push(texture);
          renderCurrentScene();
        });
      });
    }

    camera.position.z = 4;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    sceneRef.current = scene;

    const resize = () => {
      renderCurrentScene();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", resize);
      cameraRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      geometry.dispose();
      material.dispose();
      thumbnailMaterials.forEach((spriteMaterial) => spriteMaterial.dispose());
      thumbnailTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
    };
  }, [renderCurrentScene, renderMode, renderPoints, thumbnailPlan]);

  useEffect(() => {
    viewRef.current = view;
    renderCurrentScene();
  }, [renderCurrentScene, view]);

  function getWorldPointFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const wrapper = wrapperRef.current;
    const camera = cameraRef.current;

    if (!wrapper || !camera) {
      return null;
    }

    const rect = wrapper.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const vector = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);

    return { x: vector.x, y: vector.y };
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
          data-selected-image-id={selectedImageId ?? undefined}
          data-thumbnail-count={
            renderMode === "thumbnails"
              ? thumbnailPlan.thumbnailPoints.length
              : 0
          }
          data-thumbnail-source-kind="generated"
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
                {selectedPoint.relative_path}
              </Badge>
              <Badge className="bg-background/85 text-foreground" variant="outline">
                {selectedPoint.neighbors.length} neighbors
              </Badge>
            </>
          ) : null}
        </div>

        {hoveredPoint ? (
          <div
            className="pointer-events-none fixed z-50 w-40 overflow-hidden rounded-lg border bg-background shadow-xl"
            style={{
              left: Math.min(hoverPosition.x + 14, window.innerWidth - 176),
              top: Math.min(hoverPosition.y + 14, window.innerHeight - 196),
            }}
        >
            <div
              aria-hidden="true"
              className="aspect-square w-full bg-cover bg-center"
              style={{
                backgroundImage: `url("${hoveredPoint.thumbnail_path}")`,
              }}
            />
            <div className="truncate border-t px-2 py-1 text-xs text-muted-foreground">
              {hoveredPoint.relative_path}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
