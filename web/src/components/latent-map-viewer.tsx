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
  createLatentMapThumbnailRenderPlan,
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
  DEFAULT_LATENT_MAP_THUMBNAIL_SIZE,
  LATENT_MAP_THUMBNAIL_SIZE_OPTIONS,
  type LatentMapRenderMode,
  type LatentMapRenderablePoint,
  type LatentMapThumbnailAtlasPage,
  type LatentMapThumbnailSize,
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
const THUMBNAIL_WORLD_SIZE_PER_PIXEL = 0.13 / 64;
const ATLAS_TEXTURE_SIZE = 2048;

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

function getThumbnailScale(
  point: LatentMapRenderablePoint,
  thumbnailSize: LatentMapThumbnailSize,
): [number, number] {
  const aspect = Math.max(point.width, 1) / Math.max(point.height, 1);
  const scaleMultiplier =
    point.point_state === "selected" ? 1.36 : point.point_state === "neighbor" ? 1.16 : 1;
  const baseSize = thumbnailSize * THUMBNAIL_WORLD_SIZE_PER_PIXEL * scaleMultiplier;
  const boundedAspect = Math.min(1.45, Math.max(0.7, aspect));

  if (boundedAspect >= 1) {
    return [baseSize * boundedAspect, baseSize];
  }

  return [baseSize, baseSize / boundedAspect];
}

function getThumbnailLayer(point: LatentMapRenderablePoint): number {
  if (point.point_state === "selected") {
    return 0.32;
  }
  if (point.point_state === "neighbor") {
    return 0.24;
  }

  return 0.16;
}

function getThumbnailStateValue(point: LatentMapRenderablePoint): number {
  if (point.point_state === "selected") {
    return 2;
  }
  if (point.point_state === "neighbor") {
    return 1;
  }

  return 0;
}

function createAtlasGeometry({
  page,
  thumbnailSize,
}: {
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
}) {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    -0.5, 0.5, 0,
    0.5, 0.5, 0,
  ]);
  const uvs = new Float32Array([
    0, 1,
    1, 1,
    0, 0,
    1, 0,
  ]);
  const indices = [0, 1, 2, 2, 1, 3];
  const instancePositions = new Float32Array(page.items.length * 3);
  const instanceScales = new Float32Array(page.items.length * 2);
  const instanceUvRects = new Float32Array(page.items.length * 4);
  const instanceStates = new Float32Array(page.items.length);

  page.items.forEach((item, index) => {
    const [width, height] = getThumbnailScale(item.point, thumbnailSize);

    instancePositions[index * 3] = item.point.fitted_x;
    instancePositions[index * 3 + 1] = item.point.fitted_y;
    instancePositions[index * 3 + 2] = getThumbnailLayer(item.point);
    instanceScales[index * 2] = width;
    instanceScales[index * 2 + 1] = height;
    instanceUvRects.set(item.uvRect, index * 4);
    instanceStates[index] = getThumbnailStateValue(item.point);
  });

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute(
    "instancePosition",
    new THREE.InstancedBufferAttribute(instancePositions, 3),
  );
  geometry.setAttribute(
    "instanceScale",
    new THREE.InstancedBufferAttribute(instanceScales, 2),
  );
  geometry.setAttribute(
    "instanceUvRect",
    new THREE.InstancedBufferAttribute(instanceUvRects, 4),
  );
  geometry.setAttribute(
    "instanceState",
    new THREE.InstancedBufferAttribute(instanceStates, 1),
  );
  geometry.instanceCount = page.items.length;

  return geometry;
}

function createAtlasMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: true,
    transparent: false,
    uniforms: {
      atlasTexture: { value: texture },
    },
    vertexShader: `
      attribute vec3 instancePosition;
      attribute vec2 instanceScale;
      attribute vec4 instanceUvRect;
      attribute float instanceState;
      varying vec2 vAtlasUv;
      varying vec2 vLocalUv;
      varying float vState;

      void main() {
        vLocalUv = uv;
        vAtlasUv = instanceUvRect.xy + (uv * instanceUvRect.zw);
        vState = instanceState;
        vec3 transformed = vec3(
          (position.xy * instanceScale) + instancePosition.xy,
          instancePosition.z
        );
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D atlasTexture;
      varying vec2 vAtlasUv;
      varying vec2 vLocalUv;
      varying float vState;

      void main() {
        vec4 texel = texture2D(atlasTexture, vAtlasUv);
        float edgeDistance = min(
          min(vLocalUv.x, 1.0 - vLocalUv.x),
          min(vLocalUv.y, 1.0 - vLocalUv.y)
        );
        float selected = step(1.5, vState);
        float neighbor = step(0.5, vState) * (1.0 - selected);
        float emphasis = max(selected, neighbor);
        vec3 borderColor = mix(vec3(1.0, 0.62, 0.24), vec3(1.0), selected);
        float border = (1.0 - step(0.045, edgeDistance)) * emphasis;
        vec3 color = mix(texel.rgb, borderColor, border);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

function drawAtlasTile({
  context,
  image,
  item,
  tileSize,
}: {
  context: CanvasRenderingContext2D;
  image: HTMLImageElement;
  item: LatentMapThumbnailAtlasPage["items"][number];
  tileSize: LatentMapThumbnailSize;
}) {
  const x = item.column * tileSize;
  const y = item.row * tileSize;

  context.fillStyle = "#101113";
  context.fillRect(x, y, tileSize, tileSize);
  context.drawImage(image, x, y, tileSize, tileSize);
}

function fillMissingAtlasTile({
  context,
  item,
  tileSize,
}: {
  context: CanvasRenderingContext2D;
  item: LatentMapThumbnailAtlasPage["items"][number];
  tileSize: LatentMapThumbnailSize;
}) {
  const x = item.column * tileSize;
  const y = item.row * tileSize;
  const color = rgbToThreeColor(item.point.color);

  context.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(
    color.g * 255,
  )}, ${Math.round(color.b * 255)})`;
  context.fillRect(x, y, tileSize, tileSize);
}

function createAtlasPageMesh({
  page,
  thumbnailSize,
}: {
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create latent-map thumbnail atlas canvas.");
  }

  canvas.width = page.atlasSize;
  canvas.height = page.atlasSize;
  context.fillStyle = "#101113";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.premultiplyAlpha = false;

  const geometry = createAtlasGeometry({ page, thumbnailSize });
  const material = createAtlasMaterial(texture);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.frustumCulled = false;
  mesh.renderOrder = 10 + page.index;

  return {
    canvas,
    context,
    geometry,
    material,
    mesh,
    texture,
  };
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
  const [thumbnailSize, setThumbnailSize] =
    useState<LatentMapThumbnailSize>(DEFAULT_LATENT_MAP_THUMBNAIL_SIZE);
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
        atlasSize: ATLAS_TEXTURE_SIZE,
        hoverPreviewSize: DEFAULT_LATENT_MAP_HOVER_PREVIEW_SIZE,
        points: renderPoints,
        strategy: "all-atlas",
        thumbnailSize,
      }),
    [renderPoints, thumbnailSize],
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
    const atlasPages: ReturnType<typeof createAtlasPageMesh>[] = [];
    const atlasImages: HTMLImageElement[] = [];
    let animationFrameId: number | null = null;
    let isDisposed = false;

    renderer.setClearColor(0x101113, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene.add(pointCloud);

    const scheduleRender = () => {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        renderCurrentScene();
      });
    };

    if (renderMode === "thumbnails") {
      thumbnailPlan.atlasPages.forEach((page) => {
        const atlasPage = createAtlasPageMesh({
          page,
          thumbnailSize: thumbnailPlan.thumbnailSize,
        });

        atlasPages.push(atlasPage);
        scene.add(atlasPage.mesh);

        page.items.forEach((item) => {
          const image = new Image();

          atlasImages.push(image);
          image.decoding = "async";
          image.onload = () => {
            if (isDisposed) {
              return;
            }

            drawAtlasTile({
              context: atlasPage.context,
              image,
              item,
              tileSize: page.tileSize,
            });
            atlasPage.texture.needsUpdate = true;
            scheduleRender();
          };
          image.onerror = () => {
            if (isDisposed) {
              return;
            }

            fillMissingAtlasTile({
              context: atlasPage.context,
              item,
              tileSize: page.tileSize,
            });
            atlasPage.texture.needsUpdate = true;
            scheduleRender();
          };
          image.src = item.point.thumbnail_path;
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
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      atlasImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
      cameraRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      geometry.dispose();
      material.dispose();
      atlasPages.forEach((atlasPage) => {
        scene.remove(atlasPage.mesh);
        atlasPage.geometry.dispose();
        atlasPage.material.dispose();
        atlasPage.texture.dispose();
      });
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
          data-selected-image-id={selectedImageId ?? undefined}
          data-thumbnail-atlas-page-count={
            renderMode === "thumbnails" ? thumbnailPlan.atlasPages.length : 0
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
