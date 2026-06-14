import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

export type LatentMapNeighborhoodModeAction =
  | {
      kind: "enter";
    }
  | {
      kind: "exit";
    }
  | {
      kind: "recenter-map";
      view: LatentMapViewState;
    }
  | {
      kind: "recenter-neighborhood";
      view: LatentMapViewState;
    };

export type LatentMapNeighborhoodModeState = {
  isActive: boolean;
  recenterView: LatentMapViewState | null;
  selectedImageId: string | null;
};

export function canEnterLatentMapNeighborhoodMode({
  selectedImageId,
}: Pick<LatentMapNeighborhoodModeState, "selectedImageId">) {
  return Boolean(selectedImageId);
}

export function canRecenterLatentMapNeighborhoodMode({
  isActive,
  recenterView,
}: Pick<LatentMapNeighborhoodModeState, "isActive" | "recenterView">) {
  return isActive && Boolean(recenterView);
}

export function getLatentMapNeighborhoodKeyboardAction({
  key,
  mapRecenterView,
  mode,
}: {
  key: string;
  mapRecenterView: LatentMapViewState;
  mode: LatentMapNeighborhoodModeState;
}): LatentMapNeighborhoodModeAction | null {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "n") {
    if (mode.isActive) {
      return { kind: "exit" };
    }

    return canEnterLatentMapNeighborhoodMode(mode)
      ? { kind: "enter" }
      : null;
  }

  if (key === "Escape") {
    return mode.isActive ? { kind: "exit" } : null;
  }

  if (normalizedKey === "h") {
    if (canRecenterLatentMapNeighborhoodMode(mode) && mode.recenterView) {
      return {
        kind: "recenter-neighborhood",
        view: mode.recenterView,
      };
    }

    return {
      kind: "recenter-map",
      view: mapRecenterView,
    };
  }

  return null;
}
