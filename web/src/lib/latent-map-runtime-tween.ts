export const LATENT_MAP_TWEEN_STRIDE = 9;

export type LatentMapTweenValueKey =
  | "x"
  | "y"
  | "z"
  | "r"
  | "g"
  | "b"
  | "size"
  | "alpha"
  | "state";

export type LatentMapTweenValues = Record<LatentMapTweenValueKey, number>;

export type LatentMapTweenItem = {
  imageId: string;
  values: LatentMapTweenValues;
};

export type LatentMapTweenTarget = {
  imageId: string;
  values: Partial<LatentMapTweenValues>;
};

export type LatentMapTweenDirtyRange = {
  end: number;
  start: number;
};

export type LatentMapTweenStepResult = {
  dirtyRange: LatentMapTweenDirtyRange | null;
  isAnimating: boolean;
};

export type LatentMapTweenRetargetResult = LatentMapTweenStepResult & {
  missingImageIds: string[];
};

export type LatentMapRuntimeTweenController = {
  dispose: () => void;
  getCurrentBuffer: () => Float32Array;
  getImageIds: () => string[];
  getIndex: (imageId: string) => number | null;
  getTargetBuffer: () => Float32Array;
  isAnimating: () => boolean;
  isDisposed: () => boolean;
  readCurrentValues: (imageId: string) => LatentMapTweenValues | null;
  retarget: (
    targets: LatentMapTweenTarget[],
    options?: LatentMapTweenTimingOptions,
  ) => LatentMapTweenRetargetResult;
  setItems: (
    items: LatentMapTweenItem[],
    options?: { now?: number },
  ) => LatentMapTweenStepResult;
  step: (now: number) => LatentMapTweenStepResult;
};

export type LatentMapTweenTimingOptions = {
  durationMs?: number;
  now?: number;
};

const VALUE_KEYS = [
  "x",
  "y",
  "z",
  "r",
  "g",
  "b",
  "size",
  "alpha",
  "state",
] as const satisfies readonly LatentMapTweenValueKey[];

const VALUE_OFFSETS: Record<LatentMapTweenValueKey, number> = {
  alpha: 7,
  b: 5,
  g: 4,
  r: 3,
  size: 6,
  state: 8,
  x: 0,
  y: 1,
  z: 2,
};

const DEFAULT_TWEEN_DURATION_MS = 180;

export function createLatentMapRuntimeTweenController(
  items: LatentMapTweenItem[],
): LatentMapRuntimeTweenController {
  let activeEnd = 0;
  let activeStart = 0;
  let current = new Float32Array(0);
  let disposed = false;
  let durationMs = DEFAULT_TWEEN_DURATION_MS;
  let imageIds: string[] = [];
  let indexByImageId = new Map<string, number>();
  let isTweening = false;
  let startedAt = 0;
  let start = new Float32Array(0);
  let target = new Float32Array(0);

  function getCurrentBuffer() {
    return current;
  }

  function getTargetBuffer() {
    return target;
  }

  function getImageIds() {
    return [...imageIds];
  }

  function getIndex(imageId: string) {
    return indexByImageId.get(imageId) ?? null;
  }

  function isAnimating() {
    return isTweening;
  }

  function isDisposed() {
    return disposed;
  }

  function setItems(
    nextItems: LatentMapTweenItem[],
    options: { now?: number } = {},
  ): LatentMapTweenStepResult {
    if (disposed) {
      return createCleanStepResult();
    }

    if (isTweening && typeof options.now === "number") {
      step(options.now);
    }

    const previousCurrent = current;
    const previousIndexByImageId = indexByImageId;
    const nextLength = nextItems.length * LATENT_MAP_TWEEN_STRIDE;
    const nextCurrent = new Float32Array(nextLength);
    const nextTarget = new Float32Array(nextLength);
    const nextStart = new Float32Array(nextLength);
    const nextImageIds: string[] = [];
    const nextIndexByImageId = new Map<string, number>();

    nextItems.forEach((item, index) => {
      nextImageIds.push(item.imageId);
      nextIndexByImageId.set(item.imageId, index);

      const previousIndex = previousIndexByImageId.get(item.imageId);

      if (typeof previousIndex === "number") {
        copyBufferItem({
          from: previousCurrent,
          fromIndex: previousIndex,
          to: nextCurrent,
          toIndex: index,
        });
      } else {
        writeValues(nextCurrent, index, item.values);
      }

      writeValues(nextTarget, index, item.values);
      copyBufferItem({
        from: nextCurrent,
        fromIndex: index,
        to: nextStart,
        toIndex: index,
      });
    });

    current = nextCurrent;
    target = nextTarget;
    start = nextStart;
    imageIds = nextImageIds;
    indexByImageId = nextIndexByImageId;
    activeStart = 0;
    activeEnd = nextItems.length;
    isTweening = false;

    return {
      dirtyRange:
        nextItems.length > 0 ? { end: nextItems.length, start: 0 } : null,
      isAnimating: false,
    };
  }

  function retarget(
    targets: LatentMapTweenTarget[],
    options: LatentMapTweenTimingOptions = {},
  ): LatentMapTweenRetargetResult {
    if (disposed) {
      return {
        ...createCleanStepResult(),
        missingImageIds: targets.map((nextTarget) => nextTarget.imageId),
      };
    }

    const now = options.now ?? 0;

    if (isTweening) {
      step(now);
    }

    start.set(current);
    target.set(current);

    let dirtyStart = Number.POSITIVE_INFINITY;
    let dirtyEnd = 0;
    const missingImageIds: string[] = [];

    targets.forEach((nextTarget) => {
      const index = indexByImageId.get(nextTarget.imageId);

      if (typeof index !== "number") {
        missingImageIds.push(nextTarget.imageId);
        return;
      }

      writePartialValues(target, index, nextTarget.values);
      dirtyStart = Math.min(dirtyStart, index);
      dirtyEnd = Math.max(dirtyEnd, index + 1);
    });

    if (!Number.isFinite(dirtyStart)) {
      isTweening = false;
      return {
        dirtyRange: null,
        isAnimating: false,
        missingImageIds,
      };
    }

    activeStart = dirtyStart;
    activeEnd = dirtyEnd;
    startedAt = now;
    durationMs = Math.max(0, options.durationMs ?? DEFAULT_TWEEN_DURATION_MS);

    if (durationMs === 0) {
      copyRange({
        from: target,
        itemEnd: activeEnd,
        itemStart: activeStart,
        to: current,
      });
      isTweening = false;
      return {
        dirtyRange: { end: activeEnd, start: activeStart },
        isAnimating: false,
        missingImageIds,
      };
    }

    isTweening = true;

    return {
      dirtyRange: { end: activeEnd, start: activeStart },
      isAnimating: true,
      missingImageIds,
    };
  }

  function step(now: number): LatentMapTweenStepResult {
    if (disposed || !isTweening) {
      return createCleanStepResult();
    }

    const progress = clamp01((now - startedAt) / durationMs);
    const easedProgress = easeOutCubic(progress);
    const floatStart = activeStart * LATENT_MAP_TWEEN_STRIDE;
    const floatEnd = activeEnd * LATENT_MAP_TWEEN_STRIDE;

    for (let index = floatStart; index < floatEnd; index += 1) {
      current[index] =
        start[index] + (target[index] - start[index]) * easedProgress;
    }

    if (progress >= 1) {
      copyRange({
        from: target,
        itemEnd: activeEnd,
        itemStart: activeStart,
        to: current,
      });
      isTweening = false;
    }

    return {
      dirtyRange: { end: activeEnd, start: activeStart },
      isAnimating: isTweening,
    };
  }

  function readCurrentValues(imageId: string): LatentMapTweenValues | null {
    const index = indexByImageId.get(imageId);

    if (typeof index !== "number") {
      return null;
    }

    return readValues(current, index);
  }

  function dispose() {
    disposed = true;
    isTweening = false;
    activeStart = 0;
    activeEnd = 0;
    current = new Float32Array(0);
    target = new Float32Array(0);
    start = new Float32Array(0);
    imageIds = [];
    indexByImageId = new Map();
  }

  setItems(items);

  return {
    dispose,
    getCurrentBuffer,
    getImageIds,
    getIndex,
    getTargetBuffer,
    isAnimating,
    isDisposed,
    readCurrentValues,
    retarget,
    setItems,
    step,
  };
}

export function createLatentMapTweenValues(
  values: Partial<LatentMapTweenValues> = {},
): LatentMapTweenValues {
  return {
    alpha: values.alpha ?? 1,
    b: values.b ?? 1,
    g: values.g ?? 1,
    r: values.r ?? 1,
    size: values.size ?? 1,
    state: values.state ?? 0,
    x: values.x ?? 0,
    y: values.y ?? 0,
    z: values.z ?? 0,
  };
}

function createCleanStepResult(): LatentMapTweenStepResult {
  return {
    dirtyRange: null,
    isAnimating: false,
  };
}

function copyBufferItem({
  from,
  fromIndex,
  to,
  toIndex,
}: {
  from: Float32Array;
  fromIndex: number;
  to: Float32Array;
  toIndex: number;
}) {
  const fromOffset = fromIndex * LATENT_MAP_TWEEN_STRIDE;
  const toOffset = toIndex * LATENT_MAP_TWEEN_STRIDE;

  for (let offset = 0; offset < LATENT_MAP_TWEEN_STRIDE; offset += 1) {
    to[toOffset + offset] = from[fromOffset + offset];
  }
}

function copyRange({
  from,
  itemEnd,
  itemStart,
  to,
}: {
  from: Float32Array;
  itemEnd: number;
  itemStart: number;
  to: Float32Array;
}) {
  const floatStart = itemStart * LATENT_MAP_TWEEN_STRIDE;
  const floatEnd = itemEnd * LATENT_MAP_TWEEN_STRIDE;

  for (let index = floatStart; index < floatEnd; index += 1) {
    to[index] = from[index];
  }
}

function writeValues(
  buffer: Float32Array,
  index: number,
  values: LatentMapTweenValues,
) {
  VALUE_KEYS.forEach((key) => {
    buffer[index * LATENT_MAP_TWEEN_STRIDE + VALUE_OFFSETS[key]] =
      values[key];
  });
}

function writePartialValues(
  buffer: Float32Array,
  index: number,
  values: Partial<LatentMapTweenValues>,
) {
  VALUE_KEYS.forEach((key) => {
    const value = values[key];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }

    buffer[index * LATENT_MAP_TWEEN_STRIDE + VALUE_OFFSETS[key]] = value;
  });
}

function readValues(
  buffer: Float32Array,
  index: number,
): LatentMapTweenValues {
  const offset = index * LATENT_MAP_TWEEN_STRIDE;

  return {
    alpha: buffer[offset + VALUE_OFFSETS.alpha],
    b: buffer[offset + VALUE_OFFSETS.b],
    g: buffer[offset + VALUE_OFFSETS.g],
    r: buffer[offset + VALUE_OFFSETS.r],
    size: buffer[offset + VALUE_OFFSETS.size],
    state: buffer[offset + VALUE_OFFSETS.state],
    x: buffer[offset + VALUE_OFFSETS.x],
    y: buffer[offset + VALUE_OFFSETS.y],
    z: buffer[offset + VALUE_OFFSETS.z],
  };
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
