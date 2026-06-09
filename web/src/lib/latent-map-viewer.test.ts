import { describe, expect, it } from "vitest";

import { latentMapFixture } from "@/lib/latent-map-fixture";
import {
  createLatentMapNeighborSet,
  createLatentMapRenderState,
  createLatentMapStats,
  findNearestLatentMapPoint,
  fitLatentMapPoints,
} from "@/lib/latent-map-viewer";

describe("latent map viewer model", () => {
  it("reports point and cluster counts for exported viewer data", () => {
    expect(createLatentMapStats(latentMapFixture)).toEqual({
      clusterCount: 3,
      pointCount: 8,
    });
  });

  it("selects FAISS neighbors from the selected exported point", () => {
    expect(
      [...createLatentMapNeighborSet(latentMapFixture, "img_saffron")],
    ).toEqual(["img_amber", "img_vermilion", "img_cobalt"]);
  });

  it("marks selected and neighbor points before cluster colors", () => {
    const states = createLatentMapRenderState({
      clusterColorsEnabled: true,
      data: latentMapFixture,
      selectedImageId: "img_saffron",
    });

    const stateById = Object.fromEntries(
      states.map((point) => [point.image_id, point.point_state]),
    );

    expect(stateById.img_saffron).toBe("selected");
    expect(stateById.img_amber).toBe("neighbor");
    expect(stateById.img_vermilion).toBe("neighbor");
    expect(stateById.img_cobalt).toBe("neighbor");
    expect(stateById.img_teal).toBe("cluster");
  });

  it("fits arbitrary UMAP coordinates into stable WebGL world space", () => {
    const fitted = fitLatentMapPoints(latentMapFixture.points);
    const xs = fitted.map((point) => point.fitted_x);
    const ys = fitted.map((point) => point.fitted_y);

    expect(Math.max(...xs)).toBeLessThanOrEqual(0.86);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.86);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.86);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.86);
  });

  it("finds the nearest fitted point for hover and click hit testing", () => {
    const fitted = fitLatentMapPoints(latentMapFixture.points);
    const saffron = fitted.find((point) => point.image_id === "img_saffron");

    expect(saffron).toBeDefined();
    expect(
      findNearestLatentMapPoint({
        maxDistance: 0.01,
        points: fitted,
        x: saffron?.fitted_x ?? 0,
        y: saffron?.fitted_y ?? 0,
      })?.image_id,
    ).toBe("img_saffron");
  });
});
