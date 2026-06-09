import * as THREE from "three";

import type {
  LatentMapRenderablePoint,
  LatentMapRenderMode,
  LatentMapPointLayerPlan,
  LatentMapRuntimeRendererInfo,
  LatentMapThumbnailAtlasPage,
  LatentMapThumbnailRenderPlan,
  LatentMapThumbnailSize,
} from "@/lib/latent-map-viewer";

export type LatentMapViewState = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type LatentMapRuntimeDiagnostics = {
  loadedThumbnailCount: number;
  rendererInfo: LatentMapRuntimeRendererInfo;
};

export type LatentMapRuntimeState = {
  pointLayer: LatentMapPointLayerPlan;
  points: LatentMapRenderablePoint[];
  renderMode: LatentMapRenderMode;
  thumbnailPlan: LatentMapThumbnailRenderPlan;
};

export type LatentMapWebglRuntime = {
  dispose: () => void;
  getDiagnostics: () => LatentMapRuntimeDiagnostics;
  getWorldPoint: (clientX: number, clientY: number) => { x: number; y: number };
  render: () => void;
  setRenderState: (state: LatentMapRuntimeState) => void;
  setView: (view: LatentMapViewState) => void;
};

const THUMBNAIL_WORLD_SIZE_PER_PIXEL = 0.13 / 64;

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

function writePointGeometryAttributes(
  geometry: THREE.BufferGeometry,
  points: LatentMapRenderablePoint[],
) {
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

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createPointGeometry(points: LatentMapRenderablePoint[]) {
  const geometry = new THREE.BufferGeometry();

  writePointGeometryAttributes(geometry, points);

  return geometry;
}

function updatePointGeometry(
  geometry: THREE.BufferGeometry,
  points: LatentMapRenderablePoint[],
) {
  const position = geometry.getAttribute("position");

  if (!position || position.count !== points.length) {
    writePointGeometryAttributes(geometry, points);
    return;
  }

  const positions = position.array as Float32Array;
  const colors = geometry.getAttribute("color").array as Float32Array;

  points.forEach((point, index) => {
    positions[index * 3] = point.fitted_x;
    positions[index * 3 + 1] = point.fitted_y;
    positions[index * 3 + 2] = point.point_state === "selected" ? 0.08 : 0;

    const color = rgbToThreeColor(point.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  });

  position.needsUpdate = true;
  geometry.getAttribute("color").needsUpdate = true;
}

function getThumbnailScale(
  point: LatentMapRenderablePoint,
  thumbnailSize: LatentMapThumbnailSize,
): [number, number] {
  const aspect = Math.max(point.width, 1) / Math.max(point.height, 1);
  const scaleMultiplier =
    point.point_state === "selected"
      ? 1.36
      : point.point_state === "neighbor"
        ? 1.16
        : 1;
  const baseSize =
    thumbnailSize * THUMBNAIL_WORLD_SIZE_PER_PIXEL * scaleMultiplier;
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

function writeAtlasInstanceAttributes({
  geometry,
  page,
  thumbnailSize,
}: {
  geometry: THREE.InstancedBufferGeometry;
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
}) {
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
}

function updateAtlasInstanceAttributes({
  geometry,
  page,
  thumbnailSize,
}: {
  geometry: THREE.InstancedBufferGeometry;
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
}) {
  const instancePosition = geometry.getAttribute("instancePosition");

  if (!instancePosition || instancePosition.count !== page.items.length) {
    writeAtlasInstanceAttributes({ geometry, page, thumbnailSize });
    return;
  }

  const instancePositions = instancePosition.array as Float32Array;
  const instanceScales = geometry.getAttribute("instanceScale")
    .array as Float32Array;
  const instanceStates = geometry.getAttribute("instanceState")
    .array as Float32Array;

  page.items.forEach((item, index) => {
    const [width, height] = getThumbnailScale(item.point, thumbnailSize);

    instancePositions[index * 3] = item.point.fitted_x;
    instancePositions[index * 3 + 1] = item.point.fitted_y;
    instancePositions[index * 3 + 2] = getThumbnailLayer(item.point);
    instanceScales[index * 2] = width;
    instanceScales[index * 2 + 1] = height;
    instanceStates[index] = getThumbnailStateValue(item.point);
  });

  instancePosition.needsUpdate = true;
  geometry.getAttribute("instanceScale").needsUpdate = true;
  geometry.getAttribute("instanceState").needsUpdate = true;
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

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  writeAtlasInstanceAttributes({ geometry, page, thumbnailSize });

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
        float focusRing = (1.0 - step(0.045, edgeDistance)) * selected;
        vec3 color = mix(texel.rgb, vec3(1.0), focusRing);

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

type AtlasPageMesh = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  page: LatentMapThumbnailAtlasPage;
  texture: THREE.CanvasTexture;
};

function createAtlasPageMesh({
  page,
  thumbnailSize,
}: {
  page: LatentMapThumbnailAtlasPage;
  thumbnailSize: LatentMapThumbnailSize;
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

function createThumbnailPlanSignature(plan: LatentMapThumbnailRenderPlan) {
  const sources = plan.textureSources.join("\n");

  return [
    plan.strategy,
    plan.thumbnailSize,
    plan.atlasPages.length,
    plan.thumbnailPoints.length,
    sources,
  ].join("|");
}

function disposeAtlasPage(scene: THREE.Scene, atlasPage: AtlasPageMesh) {
  scene.remove(atlasPage.mesh);
  atlasPage.geometry.dispose();
  atlasPage.material.dispose();
  atlasPage.texture.dispose();
}

export function createLatentMapWebglRuntime({
  canvas,
  onDiagnosticsChange,
  pointLayer,
  points,
  renderMode,
  thumbnailPlan,
  view,
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
  const pointGeometry = createPointGeometry(pointLayer.points);
  const pointMaterial = new THREE.PointsMaterial({
    alphaTest: 0.2,
    size: pointLayer.pointSize,
    sizeAttenuation: false,
    vertexColors: true,
  });
  const pointCloud = new THREE.Points(pointGeometry, pointMaterial);
  const atlasPages: AtlasPageMesh[] = [];
  const atlasImages: HTMLImageElement[] = [];
  let animationFrameId: number | null = null;
  let currentThumbnailPlanSignature = "";
  let currentView = view;
  let isDisposed = false;
  let loadedThumbnailCount = 0;

  renderer.setClearColor(0x101113, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera.position.z = 4;
  scene.add(pointCloud);

  function getDiagnostics(): LatentMapRuntimeDiagnostics {
    return {
      loadedThumbnailCount,
      rendererInfo: getRendererInfo(renderer),
    };
  }

  function reportDiagnostics() {
    onDiagnosticsChange?.(getDiagnostics());
  }

  function render() {
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
    renderer.render(scene, camera);
    reportDiagnostics();
  }

  function scheduleRender() {
    if (animationFrameId !== null || isDisposed) {
      return;
    }

    animationFrameId = window.requestAnimationFrame(() => {
      animationFrameId = null;
      render();
    });
  }

  function unloadAtlasPages() {
    atlasImages.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
    atlasImages.length = 0;
    atlasPages.splice(0).forEach((atlasPage) => {
      disposeAtlasPage(scene, atlasPage);
    });
    loadedThumbnailCount = 0;
    currentThumbnailPlanSignature = "";
  }

  function loadAtlasPages(plan: LatentMapThumbnailRenderPlan) {
    unloadAtlasPages();

    plan.atlasPages.forEach((page) => {
      const atlasPage = createAtlasPageMesh({
        page,
        thumbnailSize: plan.thumbnailSize,
      });

      atlasPages.push(atlasPage);
      scene.add(atlasPage.mesh);

      if (page.texturePath) {
        const image = new Image();

        atlasImages.push(image);
        image.decoding = "async";
        image.onload = () => {
          if (isDisposed) {
            return;
          }

          atlasPage.context.drawImage(
            image,
            0,
            0,
            page.atlasSize,
            page.atlasSize,
          );
          loadedThumbnailCount += page.items.length;
          atlasPage.texture.needsUpdate = true;
          scheduleRender();
          reportDiagnostics();
        };
        image.onerror = () => {
          if (isDisposed) {
            return;
          }

          page.items.forEach((item) => {
            fillMissingAtlasTile({
              context: atlasPage.context,
              item,
              tileSize: page.tileSize,
            });
          });
          loadedThumbnailCount += page.items.length;
          atlasPage.texture.needsUpdate = true;
          scheduleRender();
          reportDiagnostics();
        };
        image.src = page.texturePath;
        return;
      }

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
          loadedThumbnailCount += 1;
          atlasPage.texture.needsUpdate = true;
          scheduleRender();
          reportDiagnostics();
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
          loadedThumbnailCount += 1;
          atlasPage.texture.needsUpdate = true;
          scheduleRender();
          reportDiagnostics();
        };
        image.src = item.point.thumbnail_path;
      });
    });

    currentThumbnailPlanSignature = createThumbnailPlanSignature(plan);
  }

  function updateAtlasInstances(plan: LatentMapThumbnailRenderPlan) {
    plan.atlasPages.forEach((page, index) => {
      const atlasPage = atlasPages[index];

      if (!atlasPage) {
        return;
      }

      updateAtlasInstanceAttributes({
        geometry: atlasPage.geometry,
        page,
        thumbnailSize: plan.thumbnailSize,
      });
      atlasPage.page = page;
    });
  }

  function setRenderState(nextState: LatentMapRuntimeState) {
    updatePointGeometry(pointGeometry, nextState.pointLayer.points);
    pointMaterial.size = nextState.pointLayer.pointSize;

    const nextSignature = createThumbnailPlanSignature(
      nextState.thumbnailPlan,
    );

    if (nextState.renderMode !== "thumbnails") {
      if (atlasPages.length > 0) {
        unloadAtlasPages();
      }
    } else if (nextSignature !== currentThumbnailPlanSignature) {
      loadAtlasPages(nextState.thumbnailPlan);
    } else {
      updateAtlasInstances(nextState.thumbnailPlan);
    }

    pointCloud.visible = nextState.pointLayer.visible;
    scheduleRender();
    reportDiagnostics();
  }

  function setView(nextView: LatentMapViewState) {
    currentView = nextView;
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
          scheduleRender();
        });
  const resize = () => {
    scheduleRender();
  };

  if (resizeObserver) {
    resizeObserver.observe(wrapper);
  } else {
    window.addEventListener("resize", resize);
  }

  setRenderState({ pointLayer, points, renderMode, thumbnailPlan });
  render();

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
      renderer.dispose();
    },
    getDiagnostics,
    getWorldPoint,
    render,
    setRenderState,
    setView,
  };
}
