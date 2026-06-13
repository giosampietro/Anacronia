import * as THREE from "three";

import {
  createLatentMapRuntimeTweenController,
  createLatentMapTweenValues,
  LATENT_MAP_TWEEN_STRIDE,
  LATENT_MAP_TWEEN_VALUE_OFFSETS,
  type LatentMapRuntimeTweenController,
  type LatentMapTweenDirtyRange,
  type LatentMapTweenItem,
  type LatentMapTweenRetargetResult,
  type LatentMapTweenStepResult,
} from "@/lib/latent-map-runtime-tween";
import {
  getLatentMapRenderableAtlasPages,
  getLatentMapThumbnailStateScaleMultiplier,
  LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE,
  LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL,
  type LatentMapRenderablePoint,
  type LatentMapRenderMode,
  type LatentMapPointLayerPlan,
  type LatentMapRuntimePerformanceInfo,
  type LatentMapRuntimeRendererInfo,
  type LatentMapThumbnailAtlasPage,
  type LatentMapThumbnailRenderPlan,
  type LatentMapThumbnailSize,
} from "@/lib/latent-map-viewer";
import {
  createLatentMapNeighborhoodPreviewTextureCache,
  type LatentMapNeighborhoodPreviewTextureDiagnostics,
} from "@/lib/latent-map-neighborhood-preview-cache";
import type { LatentMapNeighborhoodPreviewPlan } from "@/lib/latent-map-neighborhood-previews";

export { LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE };

export type LatentMapViewState = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type LatentMapRuntimeDiagnostics = {
  loadedThumbnailCount: number;
  neighborhoodPreviewTextures: LatentMapNeighborhoodPreviewTextureDiagnostics;
  performanceInfo: LatentMapRuntimePerformanceInfo;
  rendererInfo: LatentMapRuntimeRendererInfo;
};

export type LatentMapRuntimeState = {
  pointLayer: LatentMapPointLayerPlan;
  points: LatentMapRenderablePoint[];
  neighborhoodPreviewPlan: LatentMapNeighborhoodPreviewPlan;
  renderMode: LatentMapRenderMode;
  thumbnailPlan: LatentMapThumbnailRenderPlan;
  visualTheme: LatentMapVisualTheme;
};

export type LatentMapWebglRuntime = {
  dispose: () => void;
  getDiagnostics: () => LatentMapRuntimeDiagnostics;
  getWorldPoint: (clientX: number, clientY: number) => { x: number; y: number };
  render: () => void;
  setRenderState: (state: LatentMapRuntimeState) => void;
  setView: (view: LatentMapViewState) => void;
};

export type LatentMapVisualTheme = "dark" | "light";

const MAX_INTERACTION_FRAME_GAP_MS = 250;
const LATENT_MAP_POINT_TWEEN_DURATION_MS = 180;
const LATENT_MAP_RUNTIME_DIAGNOSTICS_MIN_INTERVAL_MS = 250;

const LATENT_MAP_RUNTIME_PALETTES: Record<
  LatentMapVisualTheme,
  {
    backgroundColor: number;
    basePointColor: [number, number, number];
    selectedPointColor: [number, number, number];
  }
> = {
  dark: {
    backgroundColor: 0x101113,
    basePointColor: [150, 156, 166],
    selectedPointColor: [250, 250, 246],
  },
  light: {
    backgroundColor: 0xf0f0f0,
    basePointColor: [58, 62, 70],
    selectedPointColor: [20, 20, 20],
  },
};

function rgbToThreeColor([r, g, b]: [number, number, number]): THREE.Color {
  return new THREE.Color(r / 255, g / 255, b / 255);
}

function getDisplayPointColor(
  point: LatentMapRenderablePoint,
  visualTheme: LatentMapVisualTheme,
): [number, number, number] {
  const palette = LATENT_MAP_RUNTIME_PALETTES[visualTheme];

  if (point.point_state === "base") {
    return palette.basePointColor;
  }

  if (point.point_state === "selected") {
    return palette.selectedPointColor;
  }

  return point.color;
}

function updateCamera({
  camera,
  height,
  view,
  width,
}: {
  camera: THREE.OrthographicCamera;
  height: number;
  view: LatentMapViewState;
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

export function createLatentMapPointTweenItem({
  point,
  pointSize,
  visualTheme,
}: {
  point: LatentMapRenderablePoint;
  pointSize: number;
  visualTheme: LatentMapVisualTheme;
}): LatentMapTweenItem {
  void pointSize;

  const color = rgbToThreeColor(getDisplayPointColor(point, visualTheme));

  return {
    imageId: point.image_id,
    values: createLatentMapTweenValues({
      alpha: point.tween_alpha ?? 1,
      b: color.b,
      g: color.g,
      r: color.r,
      size: point.tween_size ?? 1,
      state: point.tween_state ?? getThumbnailStateValue(point),
      x: point.tween_x ?? point.fitted_x,
      y: point.tween_y ?? point.fitted_y,
      z: point.tween_z ?? getThumbnailLayer(point),
    }),
  };
}

function createLatentMapPointTweenItems({
  pointSize,
  points,
  visualTheme,
}: {
  pointSize: number;
  points: LatentMapRenderablePoint[];
  visualTheme: LatentMapVisualTheme;
}) {
  return points.map((point) =>
    createLatentMapPointTweenItem({ point, pointSize, visualTheme }),
  );
}

export function writeLatentMapPointGeometryFromTween({
  dirtyRange = null,
  geometry,
  tweenController,
}: {
  dirtyRange?: LatentMapTweenDirtyRange | null;
  geometry: THREE.BufferGeometry;
  tweenController: LatentMapRuntimeTweenController;
}) {
  const pointCount = tweenController.getImageIds().length;
  const position = geometry.getAttribute("position");
  const colorAttribute = geometry.getAttribute("color");

  if (
    !position ||
    !colorAttribute ||
    position.count !== pointCount ||
    colorAttribute.count !== pointCount
  ) {
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3),
    );
    writeLatentMapPointGeometryFromTween({
      dirtyRange: pointCount > 0 ? { end: pointCount, start: 0 } : null,
      geometry,
      tweenController,
    });
    return;
  }

  const positions = position.array as Float32Array;
  const colors = colorAttribute.array as Float32Array;
  const current = tweenController.getCurrentBuffer();
  const updateRange = dirtyRange ?? { end: pointCount, start: 0 };

  for (let index = updateRange.start; index < updateRange.end; index += 1) {
    const sourceOffset = index * LATENT_MAP_TWEEN_STRIDE;

    positions[index * 3] =
      current[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.x];
    positions[index * 3 + 1] =
      current[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.y];
    positions[index * 3 + 2] =
      current[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.z];
    colors[index * 3] =
      current[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.r];
    colors[index * 3 + 1] =
      current[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.g];
    colors[index * 3 + 2] =
      current[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.b];
  }

  position.needsUpdate = true;
  colorAttribute.needsUpdate = true;
}

function createPointGeometry(tweenController: LatentMapRuntimeTweenController) {
  const geometry = new THREE.BufferGeometry();

  writeLatentMapPointGeometryFromTween({ geometry, tweenController });

  return geometry;
}

export function getLatentMapThumbnailWorldScale({
  point,
  thumbnailSize,
  viewportHeight,
  zoom,
}: {
  point: LatentMapRenderablePoint;
  thumbnailSize: LatentMapThumbnailSize;
  viewportHeight: number;
  zoom: number;
}): [number, number] {
  const sourceWidth = Math.max(point.width, 1);
  const sourceHeight = Math.max(point.height, 1);
  const aspect = sourceWidth / sourceHeight;
  const scaleMultiplier = getLatentMapThumbnailStateScaleMultiplier(
    point.point_state,
  );
  const longSideWorldSize =
    thumbnailSize *
    LATENT_MAP_THUMBNAIL_WORLD_SIZE_PER_PIXEL *
    scaleMultiplier;
  let width =
    aspect >= 1 ? longSideWorldSize : longSideWorldSize * aspect;
  let height =
    aspect >= 1 ? longSideWorldSize / aspect : longSideWorldSize;
  const pixelsPerWorldUnit =
    (Math.max(viewportHeight, 1) * Math.max(zoom, 0.001)) / 2;
  const screenLongSide = Math.max(width, height) * pixelsPerWorldUnit;
  const maxScreenLongSide =
    thumbnailSize *
    LATENT_MAP_MAX_THUMBNAIL_SCREEN_SCALE *
    scaleMultiplier;

  if (screenLongSide > maxScreenLongSide) {
    const capMultiplier = maxScreenLongSide / screenLongSide;

    width *= capMultiplier;
    height *= capMultiplier;
  }

  return [width, height];
}

function getThumbnailScale(
  point: LatentMapRenderablePoint,
  thumbnailSize: LatentMapThumbnailSize,
  view: LatentMapViewState,
  viewportHeight: number,
): [number, number] {
  return getLatentMapThumbnailWorldScale({
    point,
    thumbnailSize,
    viewportHeight,
    zoom: view.zoom,
  });
}

function getThumbnailLayer(point: LatentMapRenderablePoint): number {
  if (point.point_state === "selected") {
    return 0.32;
  }
  if (point.point_state === "neighbor") {
    return 0.24;
  }
  if (point.point_state === "opposite") {
    return 0.22;
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
  if (point.point_state === "opposite") {
    return 1;
  }

  return 0;
}

function getTweenedThumbnailScale({
  point,
  scaleMultiplier,
  thumbnailSize,
  view,
  viewportHeight,
}: {
  point: LatentMapRenderablePoint;
  scaleMultiplier: number;
  thumbnailSize: LatentMapThumbnailSize;
  view: LatentMapViewState;
  viewportHeight: number;
}): [number, number] {
  const [width, height] = getThumbnailScale(
    point,
    thumbnailSize,
    view,
    viewportHeight,
  );
  const safeScaleMultiplier =
    Number.isFinite(scaleMultiplier) && scaleMultiplier > 0
      ? scaleMultiplier
      : 1;

  return [width * safeScaleMultiplier, height * safeScaleMultiplier];
}

export function writeLatentMapAtlasInstanceAttributesFromTween({
  dirtyRange = null,
  geometry,
  page,
  thumbnailSize,
  tweenController,
  view,
  viewportHeight,
}: {
  dirtyRange?: LatentMapTweenDirtyRange | null;
  geometry: THREE.InstancedBufferGeometry;
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
  tweenController: LatentMapRuntimeTweenController;
  view: LatentMapViewState;
  viewportHeight: number;
}) {
  const instancePosition = geometry.getAttribute("instancePosition");
  const instanceScale = geometry.getAttribute("instanceScale");
  const instanceUvRect = geometry.getAttribute("instanceUvRect");
  const instanceState = geometry.getAttribute("instanceState");
  const instanceOpacity = geometry.getAttribute("instanceOpacity");
  const needsAttributeReset =
    !instancePosition ||
    !instanceScale ||
    !instanceUvRect ||
    !instanceState ||
    !instanceOpacity ||
    instancePosition.count !== page.items.length ||
    instanceScale.count !== page.items.length ||
    instanceUvRect.count !== page.items.length ||
    instanceState.count !== page.items.length ||
    instanceOpacity.count !== page.items.length;

  if (needsAttributeReset) {
    geometry.setAttribute(
      "instancePosition",
      new THREE.InstancedBufferAttribute(
        new Float32Array(page.items.length * 3),
        3,
      ),
    );
    geometry.setAttribute(
      "instanceScale",
      new THREE.InstancedBufferAttribute(
        new Float32Array(page.items.length * 2),
        2,
      ),
    );
    geometry.setAttribute(
      "instanceUvRect",
      new THREE.InstancedBufferAttribute(
        new Float32Array(page.items.length * 4),
        4,
      ),
    );
    geometry.setAttribute(
      "instanceState",
      new THREE.InstancedBufferAttribute(
        new Float32Array(page.items.length),
        1,
      ),
    );
    geometry.setAttribute(
      "instanceOpacity",
      new THREE.InstancedBufferAttribute(
        new Float32Array(page.items.length),
        1,
      ),
    );
  }

  const instancePositions = geometry.getAttribute("instancePosition")
    .array as Float32Array;
  const instanceScales = geometry.getAttribute("instanceScale")
    .array as Float32Array;
  const instanceUvRects = geometry.getAttribute("instanceUvRect")
    .array as Float32Array;
  const instanceStates = geometry.getAttribute("instanceState")
    .array as Float32Array;
  const instanceOpacities = geometry.getAttribute("instanceOpacity")
    .array as Float32Array;
  const tweenBuffer = tweenController.getCurrentBuffer();
  const zOffset = page.renderLayer === "primary" ? 0.02 : 0;
  let touched = needsAttributeReset;

  page.items.forEach((item, index) => {
    const tweenIndex = tweenController.getIndex(item.point.image_id);

    if (
      dirtyRange &&
      typeof tweenIndex === "number" &&
      !needsAttributeReset &&
      (tweenIndex < dirtyRange.start || tweenIndex >= dirtyRange.end)
    ) {
      return;
    }

    const sourceOffset =
      typeof tweenIndex === "number"
        ? tweenIndex * LATENT_MAP_TWEEN_STRIDE
        : null;
    const scaleMultiplier =
      sourceOffset === null
        ? 1
        : tweenBuffer[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.size];
    const [width, height] = getTweenedThumbnailScale({
      point: item.point,
      scaleMultiplier,
      thumbnailSize,
      view,
      viewportHeight,
    });

    instancePositions[index * 3] =
      sourceOffset === null
        ? item.point.fitted_x
        : tweenBuffer[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.x];
    instancePositions[index * 3 + 1] =
      sourceOffset === null
        ? item.point.fitted_y
        : tweenBuffer[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.y];
    instancePositions[index * 3 + 2] =
      (sourceOffset === null
        ? getThumbnailLayer(item.point)
        : tweenBuffer[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.z]) +
      zOffset;
    instanceScales[index * 2] = width;
    instanceScales[index * 2 + 1] = height;
    instanceUvRects.set(item.uvRect, index * 4);
    instanceStates[index] =
      sourceOffset === null
        ? getThumbnailStateValue(item.point)
        : tweenBuffer[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.state];
    instanceOpacities[index] =
      sourceOffset === null
        ? 1
        : clamp01(
            tweenBuffer[sourceOffset + LATENT_MAP_TWEEN_VALUE_OFFSETS.alpha],
          );
    touched = true;
  });

  geometry.instanceCount = page.items.length;

  if (!touched) {
    return;
  }

  geometry.getAttribute("instancePosition").needsUpdate = true;
  geometry.getAttribute("instanceScale").needsUpdate = true;
  geometry.getAttribute("instanceUvRect").needsUpdate = true;
  geometry.getAttribute("instanceState").needsUpdate = true;
  geometry.getAttribute("instanceOpacity").needsUpdate = true;
}

function createAtlasGeometry({
  page,
  thumbnailSize,
  tweenController,
  view,
  viewportHeight,
}: {
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
  tweenController: LatentMapRuntimeTweenController;
  view: LatentMapViewState;
  viewportHeight: number;
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

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  writeLatentMapAtlasInstanceAttributesFromTween({
    geometry,
    page,
    thumbnailSize,
    tweenController,
    view,
    viewportHeight,
  });

  return geometry;
}

export const LATENT_MAP_ATLAS_FRAGMENT_SHADER = `
  uniform sampler2D atlasTexture;
  varying vec2 vAtlasUv;
  varying vec2 vLocalUv;
  varying float vOpacity;
  varying float vState;

  void main() {
    vec4 texel = texture2D(atlasTexture, vAtlasUv);
    float edgeDistance = min(
      min(vLocalUv.x, 1.0 - vLocalUv.x),
      min(vLocalUv.y, 1.0 - vLocalUv.y)
    );
    float selected = step(1.5, vState) * (1.0 - step(2.5, vState));
    float focusRing = (1.0 - step(0.045, edgeDistance)) * selected;
    float opposite = step(2.5, vState);
    float markerDistance = distance(vLocalUv, vec2(0.88, 0.88));
    float oppositeMarker = (1.0 - step(0.055, markerDistance)) * opposite;
    vec3 focusColor = mix(texel.rgb, vec3(1.0), focusRing);
    vec3 color = mix(focusColor, vec3(1.0, 0.58, 0.66), oppositeMarker);

    gl_FragColor = vec4(color, texel.a * vOpacity);
    #include <colorspace_fragment>
  }
`;

export const LATENT_MAP_ATLAS_VERTEX_SHADER = `
  attribute vec3 instancePosition;
  attribute vec2 instanceScale;
  attribute float instanceOpacity;
  attribute vec4 instanceUvRect;
  attribute float instanceState;
  varying vec2 vAtlasUv;
  varying vec2 vLocalUv;
  varying float vOpacity;
  varying float vState;

  void main() {
    vLocalUv = uv;
    vAtlasUv = instanceUvRect.xy + (uv * instanceUvRect.zw);
    vOpacity = instanceOpacity;
    vState = instanceState;
    vec3 transformed = vec3(
      (position.xy * instanceScale) + instancePosition.xy,
      instancePosition.z
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

function createAtlasMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: true,
    transparent: true,
    uniforms: {
      atlasTexture: { value: texture },
    },
    vertexShader: LATENT_MAP_ATLAS_VERTEX_SHADER,
    fragmentShader: LATENT_MAP_ATLAS_FRAGMENT_SHADER,
  });
}

function loadNeighborhoodPreviewTexture(
  item: LatentMapNeighborhoodPreviewPlan["items"][number],
) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();

    loader.load(
      item.source,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.premultiplyAlpha = false;
        resolve(texture);
      },
      undefined,
      reject,
    );
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
  tileSize: number;
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
  tileSize: number;
}) {
  const x = item.column * tileSize;
  const y = item.row * tileSize;
  const color = rgbToThreeColor(item.point.color);

  context.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(
    color.g * 255,
  )}, ${Math.round(color.b * 255)})`;
  context.fillRect(x, y, tileSize, tileSize);
}

type AtlasPageMesh = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  page: LatentMapThumbnailAtlasPage;
  texture: THREE.CanvasTexture;
};

type PreparedAtlasPageSet = {
  atlasPages: AtlasPageMesh[];
  images: HTMLImageElement[];
  isCanceled: boolean;
  loadedImageIds: Set<string>;
  signature: string;
  thumbnailPlan: LatentMapThumbnailRenderPlan;
};

function createAtlasPageMesh({
  page,
  thumbnailSize,
  tweenController,
  view,
  viewportHeight,
}: {
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
  tweenController: LatentMapRuntimeTweenController;
  view: LatentMapViewState;
  viewportHeight: number;
}): AtlasPageMesh {
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

  const geometry = createAtlasGeometry({
    page,
    thumbnailSize,
    tweenController,
    view,
    viewportHeight,
  });
  const material = createAtlasMaterial(texture);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.frustumCulled = false;
  mesh.renderOrder =
    (page.renderLayer === "primary" ? 1_000 : 10) + page.index;

  return {
    canvas,
    context,
    geometry,
    material,
    mesh,
    page,
    texture,
  };
}

function getRendererInfo(
  renderer: THREE.WebGLRenderer,
): LatentMapRuntimeRendererInfo {
  return {
    memory: {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    render: {
      calls: renderer.info.render.calls,
      points: renderer.info.render.points,
      triangles: renderer.info.render.triangles,
    },
  };
}

function nowMilliseconds() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createThumbnailPlanSignature(plan: LatentMapThumbnailRenderPlan) {
  const sources = plan.textureSources.join("\n");
  const pages = getLatentMapRenderableAtlasPages(plan)
    .map(
      (page) =>
        `${page.renderLayer ?? "primary"}:${page.index}:${page.atlasSize}:${
          page.tileSize
        }:${page.items.length}:${
          page.texturePath ?? ""
        }`,
    )
    .join("\n");

  return [
    plan.strategy,
    plan.resolvedTextureDetail,
    plan.atlasPageCacheActive ? "cached" : "full",
    plan.atlasPages.length,
    plan.fallbackAtlasPages.length,
    plan.thumbnailPoints.length,
    pages,
    sources,
  ].join("|");
}

function disposeAtlasPage(scene: THREE.Scene, atlasPage: AtlasPageMesh) {
  scene.remove(atlasPage.mesh);
  atlasPage.geometry.dispose();
  atlasPage.material.dispose();
  atlasPage.texture.dispose();
}

function haveSameTweenItemOrder(
  tweenController: LatentMapRuntimeTweenController,
  items: LatentMapTweenItem[],
) {
  const imageIds = tweenController.getImageIds();

  if (imageIds.length !== items.length) {
    return false;
  }

  return items.every((item, index) => item.imageId === imageIds[index]);
}

function createPointTweenTargets(items: LatentMapTweenItem[]) {
  return items.map((item) => ({
    imageId: item.imageId,
    values: item.values,
  }));
}

export function createLatentMapWebglRuntime({
  canvas,
  onDiagnosticsChange,
  neighborhoodPreviewPlan,
  pointLayer,
  points,
  renderMode,
  thumbnailPlan,
  view,
  visualTheme,
  wrapper,
}: LatentMapRuntimeState & {
  canvas: HTMLCanvasElement;
  onDiagnosticsChange?: (diagnostics: LatentMapRuntimeDiagnostics) => void;
  view: LatentMapViewState;
  wrapper: HTMLElement;
}): LatentMapWebglRuntime {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  const pointTweenController = createLatentMapRuntimeTweenController(
    createLatentMapPointTweenItems({
      pointSize: pointLayer.pointSize,
      points: pointLayer.points,
      visualTheme,
    }),
  );
  const pointGeometry = createPointGeometry(pointTweenController);
  const pointMaterial = new THREE.PointsMaterial({
    alphaTest: 0.2,
    size: pointLayer.pointSize,
    sizeAttenuation: false,
    vertexColors: true,
  });
  const pointCloud = new THREE.Points(pointGeometry, pointMaterial);
  const neighborhoodPreviewTextureCache =
    createLatentMapNeighborhoodPreviewTextureCache({
      loadTexture: loadNeighborhoodPreviewTexture,
      maxEntries: neighborhoodPreviewPlan.budget,
      onChange: () => {
        if (isDisposed) {
          return;
        }

        scheduleRender();
        reportDiagnostics({ force: true });
      },
    });
  const atlasPages: AtlasPageMesh[] = [];
  let animationFrameId: number | null = null;
  let activeThumbnailPlan = thumbnailPlan;
  let activeThumbnailPlanSignature = "";
  let atlasLoadRequestId = 0;
  let currentRenderMode = renderMode;
  let currentView = view;
  let isDisposed = false;
  let pendingAtlasPageSet: PreparedAtlasPageSet | null = null;
  let averageFrameMs = 0;
  let averageRenderMs = 0;
  let lastRenderMs = 0;
  let lastRenderStartedAt = 0;
  let loadedThumbnailCount = 0;
  let currentVisualTheme = visualTheme;
  let lastDiagnosticsReportedAt = Number.NEGATIVE_INFINITY;

  renderer.setClearColor(
    LATENT_MAP_RUNTIME_PALETTES[currentVisualTheme].backgroundColor,
    1,
  );
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera.position.z = 4;
  scene.add(pointCloud);

  function getDiagnostics(): LatentMapRuntimeDiagnostics {
    return {
      loadedThumbnailCount,
      neighborhoodPreviewTextures:
        neighborhoodPreviewTextureCache.getDiagnostics(),
      performanceInfo: {
        averageFrameMs,
        averageRenderMs,
        estimatedFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
        lastRenderMs,
      },
      rendererInfo: getRendererInfo(renderer),
    };
  }

  function reportDiagnostics({ force = false }: { force?: boolean } = {}) {
    const now = nowMilliseconds();

    if (
      !force &&
      now - lastDiagnosticsReportedAt <
        LATENT_MAP_RUNTIME_DIAGNOSTICS_MIN_INTERVAL_MS
    ) {
      return;
    }

    lastDiagnosticsReportedAt = now;
    onDiagnosticsChange?.(getDiagnostics());
  }

  function getViewportHeight() {
    return Math.max(wrapper.getBoundingClientRect().height, 1);
  }

  function applyTweenStepResult(
    result: LatentMapTweenRetargetResult | LatentMapTweenStepResult,
  ) {
    if (!result.dirtyRange) {
      return;
    }

    writeLatentMapPointGeometryFromTween({
      dirtyRange: result.dirtyRange,
      geometry: pointGeometry,
      tweenController: pointTweenController,
    });
    if (currentRenderMode === "thumbnails" && atlasPages.length > 0) {
      updateAtlasInstances(activeThumbnailPlan, result.dirtyRange);
    }
  }

  function render({
    forceDiagnostics = false,
  }: { forceDiagnostics?: boolean } = {}) {
    if (isDisposed) {
      return;
    }

    const { height, width } = wrapper.getBoundingClientRect();
    renderer.setSize(width, height, false);
    updateCamera({
      camera,
      height,
      view: currentView,
      width,
    });
    const renderStartedAt = nowMilliseconds();

    if (lastRenderStartedAt > 0) {
      const frameMs = renderStartedAt - lastRenderStartedAt;

      averageFrameMs =
        frameMs > MAX_INTERACTION_FRAME_GAP_MS
          ? 0
          : averageFrameMs === 0
            ? frameMs
            : averageFrameMs * 0.8 + frameMs * 0.2;
    }
    lastRenderStartedAt = renderStartedAt;
    renderer.render(scene, camera);
    lastRenderMs = nowMilliseconds() - renderStartedAt;
    averageRenderMs =
      averageRenderMs === 0
        ? lastRenderMs
        : averageRenderMs * 0.8 + lastRenderMs * 0.2;
    reportDiagnostics({ force: forceDiagnostics });
  }

  function scheduleRender() {
    if (animationFrameId !== null || isDisposed) {
      return;
    }

    animationFrameId = window.requestAnimationFrame((timestamp) => {
      animationFrameId = null;
      applyTweenStepResult(pointTweenController.step(timestamp));
      render();

      if (pointTweenController.isAnimating()) {
        scheduleRender();
      }
    });
  }

  function unloadAtlasPages() {
    atlasLoadRequestId += 1;
    cancelPendingAtlasPageSet();
    atlasPages.splice(0).forEach((atlasPage) => {
      disposeAtlasPage(scene, atlasPage);
    });
    loadedThumbnailCount = 0;
    activeThumbnailPlanSignature = "";
  }

  function disposePreparedAtlasPageSet(pageSet: PreparedAtlasPageSet) {
    pageSet.isCanceled = true;
    pageSet.images.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
    pageSet.images.length = 0;
    pageSet.atlasPages.forEach((atlasPage) => {
      disposeAtlasPage(scene, atlasPage);
    });
    pageSet.atlasPages.length = 0;
  }

  function cancelPendingAtlasPageSet() {
    if (!pendingAtlasPageSet) {
      return;
    }

    disposePreparedAtlasPageSet(pendingAtlasPageSet);
    pendingAtlasPageSet = null;
  }

  function loadAtlasImage({
    imageSource,
    onError,
    onLoad,
    pageSet,
  }: {
    imageSource: string;
    onError: () => void;
    onLoad: (image: HTMLImageElement) => void;
    pageSet: PreparedAtlasPageSet;
  }) {
    const image = new Image();

    pageSet.images.push(image);
    image.decoding = "async";

    return new Promise<void>((resolve) => {
      const finish = () => {
        image.onload = null;
        image.onerror = null;
        resolve();
      };

      image.onload = () => {
        if (!isDisposed && !pageSet.isCanceled) {
          onLoad(image);
        }
        finish();
      };
      image.onerror = () => {
        if (!isDisposed && !pageSet.isCanceled) {
          onError();
        }
        finish();
      };
      image.src = imageSource;
    });
  }

  function createPreparedAtlasPageSet({
    plan,
    signature,
  }: {
    plan: LatentMapThumbnailRenderPlan;
    signature: string;
  }) {
    const pageSet: PreparedAtlasPageSet = {
      atlasPages: [],
      images: [],
      isCanceled: false,
      loadedImageIds: new Set<string>(),
      signature,
      thumbnailPlan: plan,
    };
    const loadPromises: Promise<void>[] = [];

    getLatentMapRenderableAtlasPages(plan).forEach((page) => {
      const atlasPage = createAtlasPageMesh({
        page,
        thumbnailSize: plan.thumbnailSize,
        tweenController: pointTweenController,
        view: currentView,
        viewportHeight: getViewportHeight(),
      });

      pageSet.atlasPages.push(atlasPage);

      if (page.texturePath) {
        loadPromises.push(
          loadAtlasImage({
            imageSource: page.texturePath,
            onError: () => {
              page.items.forEach((item) => {
                fillMissingAtlasTile({
                  context: atlasPage.context,
                  item,
                  tileSize: page.tileSize,
                });
              });
              page.items.forEach((item) => {
                pageSet.loadedImageIds.add(item.point.image_id);
              });
              atlasPage.texture.needsUpdate = true;
            },
            onLoad: (image) => {
              atlasPage.context.drawImage(
                image,
                0,
                0,
                page.atlasSize,
                page.atlasSize,
              );
              page.items.forEach((item) => {
                pageSet.loadedImageIds.add(item.point.image_id);
              });
              atlasPage.texture.needsUpdate = true;
            },
            pageSet,
          }),
        );
        return;
      }

      page.items.forEach((item) => {
        loadPromises.push(
          loadAtlasImage({
            imageSource: item.point.thumbnail_path,
            onError: () => {
              fillMissingAtlasTile({
                context: atlasPage.context,
                item,
                tileSize: page.tileSize,
              });
              pageSet.loadedImageIds.add(item.point.image_id);
              atlasPage.texture.needsUpdate = true;
            },
            onLoad: (image) => {
              drawAtlasTile({
                context: atlasPage.context,
                image,
                item,
                tileSize: page.tileSize,
              });
              pageSet.loadedImageIds.add(item.point.image_id);
              atlasPage.texture.needsUpdate = true;
            },
            pageSet,
          }),
        );
      });
    });

    return { loadPromises, pageSet };
  }

  function installPreparedAtlasPageSet(pageSet: PreparedAtlasPageSet) {
    atlasPages.splice(0).forEach((atlasPage) => {
      disposeAtlasPage(scene, atlasPage);
    });
    atlasPages.push(...pageSet.atlasPages);
    pageSet.atlasPages.forEach((atlasPage) => {
      scene.add(atlasPage.mesh);
    });
    pageSet.images.length = 0;
    pageSet.atlasPages = [];
    loadedThumbnailCount = pageSet.loadedImageIds.size;
    activeThumbnailPlan = pageSet.thumbnailPlan;
    activeThumbnailPlanSignature = pageSet.signature;
    updateAtlasInstances(activeThumbnailPlan);
  }

  function loadAtlasPages(plan: LatentMapThumbnailRenderPlan) {
    const signature = createThumbnailPlanSignature(plan);
    const requestId = atlasLoadRequestId + 1;

    atlasLoadRequestId = requestId;
    cancelPendingAtlasPageSet();

    const { loadPromises, pageSet } = createPreparedAtlasPageSet({
      plan,
      signature,
    });

    pendingAtlasPageSet = pageSet;
    void Promise.all(loadPromises).then(() => {
      if (
        isDisposed ||
        pageSet.isCanceled ||
        requestId !== atlasLoadRequestId ||
        pendingAtlasPageSet !== pageSet
      ) {
        disposePreparedAtlasPageSet(pageSet);
        return;
      }

      pendingAtlasPageSet = null;
      installPreparedAtlasPageSet(pageSet);
      scheduleRender();
      reportDiagnostics({ force: true });
    });
  }

  function updateAtlasInstances(
    plan: LatentMapThumbnailRenderPlan,
    dirtyRange: LatentMapTweenDirtyRange | null = null,
  ) {
    const viewportHeight = getViewportHeight();

    getLatentMapRenderableAtlasPages(plan).forEach((page, index) => {
      const atlasPage = atlasPages[index];

      if (!atlasPage) {
        return;
      }

      writeLatentMapAtlasInstanceAttributesFromTween({
        dirtyRange,
        geometry: atlasPage.geometry,
        page,
        thumbnailSize: plan.thumbnailSize,
        tweenController: pointTweenController,
        view: currentView,
        viewportHeight,
      });
      atlasPage.page = page;
    });
  }

  function setRenderState(nextState: LatentMapRuntimeState) {
    currentRenderMode = nextState.renderMode;
    currentVisualTheme = nextState.visualTheme;
    neighborhoodPreviewTextureCache.reconcile(
      nextState.neighborhoodPreviewPlan,
    );
    renderer.setClearColor(
      LATENT_MAP_RUNTIME_PALETTES[currentVisualTheme].backgroundColor,
      1,
    );
    const now = nowMilliseconds();
    const nextPointTweenItems = createLatentMapPointTweenItems({
      pointSize: nextState.pointLayer.pointSize,
      points: nextState.pointLayer.points,
      visualTheme: currentVisualTheme,
    });

    if (!haveSameTweenItemOrder(pointTweenController, nextPointTweenItems)) {
      applyTweenStepResult(
        pointTweenController.setItems(nextPointTweenItems, { now }),
      );
    }

    applyTweenStepResult(
      pointTweenController.retarget(createPointTweenTargets(nextPointTweenItems), {
        durationMs: LATENT_MAP_POINT_TWEEN_DURATION_MS,
        now,
      }),
    );
    pointMaterial.size = nextState.pointLayer.pointSize;

    const nextSignature = createThumbnailPlanSignature(
      nextState.thumbnailPlan,
    );

    if (nextState.renderMode !== "thumbnails") {
      if (atlasPages.length > 0 || pendingAtlasPageSet) {
        unloadAtlasPages();
      }
    } else if (nextSignature !== activeThumbnailPlanSignature) {
      if (pendingAtlasPageSet?.signature !== nextSignature) {
        loadAtlasPages(nextState.thumbnailPlan);
      }
    } else {
      activeThumbnailPlan = nextState.thumbnailPlan;
      updateAtlasInstances(nextState.thumbnailPlan);
    }

    pointCloud.visible = nextState.pointLayer.visible;
    scheduleRender();
    reportDiagnostics({ force: true });
  }

  function setView(nextView: LatentMapViewState) {
    currentView = nextView;
    if (currentRenderMode === "thumbnails" && atlasPages.length > 0) {
      updateAtlasInstances(activeThumbnailPlan);
    }
    scheduleRender();
  }

  function getWorldPoint(clientX: number, clientY: number) {
    const rect = wrapper.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const vector = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);

    return { x: vector.x, y: vector.y };
  }

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          if (currentRenderMode === "thumbnails" && atlasPages.length > 0) {
            updateAtlasInstances(activeThumbnailPlan);
          }
          scheduleRender();
        });
  const resize = () => {
    if (currentRenderMode === "thumbnails" && atlasPages.length > 0) {
      updateAtlasInstances(activeThumbnailPlan);
    }
    scheduleRender();
  };

  if (resizeObserver) {
    resizeObserver.observe(wrapper);
  } else {
    window.addEventListener("resize", resize);
  }

  setRenderState({
    neighborhoodPreviewPlan,
    pointLayer,
    points,
    renderMode,
    thumbnailPlan,
    visualTheme,
  });
  render({ forceDiagnostics: true });

  return {
    dispose: () => {
      isDisposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", resize);
      }
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      unloadAtlasPages();
      pointGeometry.dispose();
      pointMaterial.dispose();
      neighborhoodPreviewTextureCache.dispose();
      pointTweenController.dispose();
      renderer.dispose();
    },
    getDiagnostics,
    getWorldPoint,
    render,
    setRenderState,
    setView,
  };
}
