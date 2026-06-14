import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

export const LATENT_MAP_VIEW_TWEEN_DURATION_MS = 180;

export type LatentMapViewTween = {
  durationMs: number;
  from: LatentMapViewState;
  startedAt: number;
  to: LatentMapViewState;
};

export type LatentMapViewTweenStep = {
  isAnimating: boolean;
  progress: number;
  view: LatentMapViewState;
};

const VIEW_TWEEN_EPSILON = 0.0001;

export function createLatentMapViewTween({
  durationMs = LATENT_MAP_VIEW_TWEEN_DURATION_MS,
  from,
  now,
  to,
}: {
  durationMs?: number;
  from: LatentMapViewState;
  now: number;
  to: LatentMapViewState;
}): LatentMapViewTween {
  return {
    durationMs: Math.max(0, durationMs),
    from,
    startedAt: now,
    to,
  };
}

export function stepLatentMapViewTween(
  tween: LatentMapViewTween,
  now: number,
): LatentMapViewTweenStep {
  const progress =
    tween.durationMs <= 0
      ? 1
      : clamp01((now - tween.startedAt) / tween.durationMs);
  const easedProgress = easeOutCubic(progress);
  const view =
    progress >= 1
      ? tween.to
      : {
          offsetX: lerp(tween.from.offsetX, tween.to.offsetX, easedProgress),
          offsetY: lerp(tween.from.offsetY, tween.to.offsetY, easedProgress),
          zoom: lerp(tween.from.zoom, tween.to.zoom, easedProgress),
        };

  return {
    isAnimating: progress < 1,
    progress,
    view,
  };
}

export function shouldAnimateLatentMapView({
  from,
  to,
}: {
  from: LatentMapViewState;
  to: LatentMapViewState;
}) {
  return (
    Math.abs(from.offsetX - to.offsetX) > VIEW_TWEEN_EPSILON ||
    Math.abs(from.offsetY - to.offsetY) > VIEW_TWEEN_EPSILON ||
    Math.abs(from.zoom - to.zoom) > VIEW_TWEEN_EPSILON
  );
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}
