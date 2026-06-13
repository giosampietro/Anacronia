import { describe, expect, it } from "vitest";

import {
  canEnterLatentMapNeighborhoodMode,
  canRecenterLatentMapNeighborhoodMode,
  getLatentMapNeighborhoodKeyboardAction,
  type LatentMapNeighborhoodModeState,
} from "@/lib/latent-map-neighborhood-mode";
import type { LatentMapViewState } from "@/lib/latent-map-webgl-runtime";

const MAP_VIEW: LatentMapViewState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 0.75,
};
const NEIGHBORHOOD_VIEW: LatentMapViewState = {
  offsetX: 0.2,
  offsetY: -0.1,
  zoom: 1.4,
};

function createModeState(
  overrides: Partial<LatentMapNeighborhoodModeState> = {},
): LatentMapNeighborhoodModeState {
  return {
    isActive: false,
    recenterView: null,
    selectedImageId: null,
    ...overrides,
  };
}

describe("latent map neighborhood mode state", () => {
  it("allows entry only when an image is selected", () => {
    expect(
      canEnterLatentMapNeighborhoodMode({ selectedImageId: null }),
    ).toBe(false);
    expect(
      canEnterLatentMapNeighborhoodMode({ selectedImageId: "img_a" }),
    ).toBe(true);
  });

  it("maps n to enter, exit, or no-op based on mode state", () => {
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "n",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({ selectedImageId: null }),
      }),
    ).toBeNull();
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "n",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({ selectedImageId: "img_a" }),
      }),
    ).toEqual({ kind: "enter" });
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "n",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({
          isActive: true,
          selectedImageId: "img_a",
        }),
      }),
    ).toEqual({ kind: "exit" });
  });

  it("maps Escape to exit only while active", () => {
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "Escape",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({ selectedImageId: "img_a" }),
      }),
    ).toBeNull();
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "Escape",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({
          isActive: true,
          selectedImageId: "img_a",
        }),
      }),
    ).toEqual({ kind: "exit" });
  });

  it("maps h to neighborhood recenter while active and ready", () => {
    expect(
      canRecenterLatentMapNeighborhoodMode({
        isActive: true,
        recenterView: NEIGHBORHOOD_VIEW,
      }),
    ).toBe(true);
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "h",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({
          isActive: true,
          recenterView: NEIGHBORHOOD_VIEW,
          selectedImageId: "img_a",
        }),
      }),
    ).toEqual({
      kind: "recenter-neighborhood",
      view: NEIGHBORHOOD_VIEW,
    });
  });

  it("maps h to normal map recenter outside neighborhood mode", () => {
    expect(
      getLatentMapNeighborhoodKeyboardAction({
        key: "h",
        mapRecenterView: MAP_VIEW,
        mode: createModeState({
          recenterView: NEIGHBORHOOD_VIEW,
          selectedImageId: "img_a",
        }),
      }),
    ).toEqual({
      kind: "recenter-map",
      view: MAP_VIEW,
    });
  });
});
