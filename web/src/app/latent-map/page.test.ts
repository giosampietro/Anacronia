import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import LatentMapPage, {
  loadLatentMapViewerData,
  loadLatentMapViewerDataWithStartupMeasurement,
} from "@/app/latent-map/page";

const ANALYSIS_RESULT_ID = "analysis-result-20260614T130000Z-dinov3_vits_384";

describe("loadLatentMapViewerData", () => {
  const previousViewerData = process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;

  afterEach(() => {
    if (previousViewerData === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;
    } else {
      process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = previousViewerData;
    }
    vi.unstubAllGlobals();
  });

  it("loads an Analysis Result by ID without reading stale legacy viewer data env", async () => {
    process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = "/tmp/missing-viewer-data.json";
    vi.stubGlobal("fetch", vi.fn(fetchAnalysisResultFixture));

    const data = await loadLatentMapViewerData({
      analysisResultId: ANALYSIS_RESULT_ID,
      clusterResult: "hdbscan_detail",
      layout: "umap_a",
      recipe: "dinov3_vits_384",
    });

    expect(data.run_id).toBe(ANALYSIS_RESULT_ID);
    expect(data.analysis_result_id).toBe(ANALYSIS_RESULT_ID);
    expect(data.points).toHaveLength(1);
    expect(data.source_folder).toBe("J Shoot");
    expect(data.neighbor_lookup_path).toBe(
      `/api/latent-map/neighbors?analysisResultId=${ANALYSIS_RESULT_ID}&recipe=dinov3_vits_384`,
    );
    expect(data.points[0].thumbnail_path).toBe(
      `/api/latent-map/thumbnails?analysisResultId=${ANALYSIS_RESULT_ID}&artifactKey=thumbnails%2Fimage-asset-1.jpg`,
    );
    expect(data.thumbnail_atlases).toBeUndefined();
    expect(data.thumbnail_atlas_manifest_urls?.["64"]).toBe(
      `/api/latent-map/atlas-manifests?analysisResultId=${ANALYSIS_RESULT_ID}&artifactKey=viewer%2Fatlases%2F64px%2Fatlas-manifest.json`,
    );
  });

  it("hydrates Analysis Result atlas manifests when the URL opens in thumbnail mode", async () => {
    process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = "/tmp/missing-viewer-data.json";
    vi.stubGlobal("fetch", vi.fn(fetchAnalysisResultFixture));

    const data = await loadLatentMapViewerData({
      analysisResultId: ANALYSIS_RESULT_ID,
      clusterResult: "hdbscan_detail",
      layout: "umap_a",
      mode: "thumbnails",
      recipe: "dinov3_vits_384",
    });

    expect(data.thumbnail_atlases?.map((atlas) => atlas.tile_size)).toEqual([
      64,
    ]);
    expect(data.thumbnail_atlases?.[0]?.pages[0]?.path).toBe(
      `/api/latent-map/thumbnails?analysisResultId=${ANALYSIS_RESULT_ID}&artifactKey=viewer%2Fatlases%2F64px%2Fpage-000.png`,
    );
  });

  it("does not fall back to legacy viewer data when an Analysis Result ID is missing", async () => {
    process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA = "/tmp/fallback-viewer-data.json";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );

    await expect(
      loadLatentMapViewerData({
        analysisResultId: "analysis-result-does-not-exist",
      }),
    ).rejects.toThrow("Analysis Result not found: analysis-result-does-not-exist");
  });

  it("opens a durable Analysis Result when an optional atlas manifest is missing", async () => {
    const analysisResultId = "analysis-result-ready-without-atlas";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/analysis-results/${analysisResultId}`)) {
          return Response.json({
            result: analysisResultDetailFixture({
              analysisResultId,
              includeAtlasArtifact: true,
              scopeLabel: "No Atlas",
            }),
          });
        }
        if (url.endsWith("/viewer/atlases/64px/atlas-manifest.json")) {
          return new Response("missing", { status: 404 });
        }
        return fetchAnalysisResultFixture(input, { analysisResultId });
      }),
    );

    const data = await loadLatentMapViewerData({ analysisResultId });

    expect(data.analysis_result_id).toBe(analysisResultId);
    expect(data.points).toHaveLength(1);
    expect(data.thumbnail_atlases).toBeUndefined();
  });

  it("returns and renders startup measurement data when requested", async () => {
    vi.stubGlobal("fetch", vi.fn(fetchAnalysisResultFixture));

    const loaded = await loadLatentMapViewerDataWithStartupMeasurement(
      { analysisResultId: ANALYSIS_RESULT_ID },
      { measureStartup: true },
    );

    expect(loaded.viewerData.analysis_result_id).toBe(ANALYSIS_RESULT_ID);
    expect(loaded.viewerData.thumbnail_atlases).toBeUndefined();
    expect(loaded.startupMeasurement).toMatchObject({
      schema_version: 1,
      summary: {
        artifactBytes: expect.any(Number),
        serializationBytes: expect.any(Number),
      },
    });
    expect(
      loaded.startupMeasurement?.entries.some(
        (entry) =>
          entry.name === "analysis-result-artifact-fetch" &&
          entry.metadata.artifactRole === "thumbnail-atlas",
      ),
    ).toBe(false);

    const html = renderToString(
      await LatentMapPage({
        searchParams: Promise.resolve({
          analysisResultId: ANALYSIS_RESULT_ID,
          measureStartup: "1",
        }),
      }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain('data-testid="latent-map-startup-measurement"');
    expect(html).toContain('data-startup-measured="true"');
    expect(html).toContain("analysis-result-artifact-fetch");
  });

  it("keeps startup measurement disabled by default", async () => {
    vi.stubGlobal("fetch", vi.fn(fetchAnalysisResultFixture));

    const loaded = await loadLatentMapViewerDataWithStartupMeasurement({
      analysisResultId: ANALYSIS_RESULT_ID,
    });

    expect(loaded.viewerData.analysis_result_id).toBe(ANALYSIS_RESULT_ID);
    expect(loaded.startupMeasurement).toBeUndefined();
  });

  it("renders an intentional empty Explorer rail entry without a selected result", async () => {
    delete process.env.ANACRONIA_LATENT_MAP_VIEWER_DATA;

    const html = renderToString(
      await LatentMapPage({ searchParams: Promise.resolve({}) }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"explorer\"");
    expect(html).toContain("data-focus-mode-available=\"true\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("Latent Space Explorer");
    expect(html).toContain("data-testid=\"latent-map-empty-state\"");
    expect(html).toContain("Open Analysis Studio");
    expect(html).not.toContain("data-testid=\"latent-map-canvas\"");
    expect(html).toContain("data-ui-overlay-hidden=\"false\"");
  });
});

async function fetchAnalysisResultFixture(
  input: RequestInfo | URL,
  options: { analysisResultId?: string } = {},
) {
  const analysisResultId = options.analysisResultId ?? ANALYSIS_RESULT_ID;
  const url = String(input);
  if (url.endsWith(`/analysis-results/${analysisResultId}`)) {
    return Response.json({
      result: analysisResultDetailFixture({ analysisResultId }),
    });
  }
  if (url.endsWith("/manifest.jsonl")) {
    return new Response(
      `${JSON.stringify({
        height: 600,
        image_id: "image-asset-1",
        preview_path: "previews/image-asset-1.jpg",
        relative_path: "set/image-asset-1.jpg",
        thumbnail_path: "thumbnails/image-asset-1.jpg",
        width: 800,
      })}\n`,
    );
  }
  if (url.endsWith("/layouts/dinov3_vits_384_umap.json")) {
    return textResponse({
      layout_id: "umap_a",
      method: "umap",
      params: { n_neighbors: 15 },
      points: [{ image_id: "image-asset-1", x: 3, y: 4 }],
      recipe_name: "dinov3_vits_384",
    });
  }
  if (url.endsWith("/clusters/dinov3_vits_384_hdbscan.json")) {
    return textResponse({
      cluster_count: 1,
      cluster_id: "hdbscan_detail",
      method: "hdbscan",
      points: [{ cluster_id: 7, image_id: "image-asset-1" }],
      recipe_name: "dinov3_vits_384",
    });
  }
  if (url.endsWith("/viewer/atlases/64px/atlas-manifest.json")) {
    return textResponse({
      asset_kind: "latent-map-thumbnail-atlas",
      atlas_size: 512,
      image_count: 1,
      items: [],
      page_count: 1,
      pages: [
        {
          height: 512,
          index: 0,
          path: "viewer/atlases/64px/page-000.png",
          width: 512,
        },
      ],
      run_id: analysisResultId,
      schema_version: 1,
      tile_size: 64,
    });
  }
  return new Response("unexpected", { status: 500 });
}

function analysisResultDetailFixture({
  analysisResultId = ANALYSIS_RESULT_ID,
  includeAtlasArtifact = true,
  scopeLabel = "J Shoot",
}: {
  analysisResultId?: string;
  includeAtlasArtifact?: boolean;
  scopeLabel?: string;
} = {}) {
  return {
    analysis_result_id: analysisResultId,
    artifact_health: {
      missing_optional_render_cache_artifact_keys: [],
      missing_required_artifact_keys: [],
    },
    artifacts: [
      { key: "manifest.jsonl", role: "image-manifest" },
      { key: "layouts/dinov3_vits_384_umap.json", role: "layout" },
      { key: "clusters/dinov3_vits_384_hdbscan.json", role: "cluster-result" },
      ...(includeAtlasArtifact
        ? [
            {
              key: "viewer/atlases/64px/atlas-manifest.json",
              role: "thumbnail-atlas",
            },
          ]
        : []),
    ],
    explorer_readiness: { ready: true },
    recipes: [
      {
        artifact_keys: {
          clusters: [
            {
              cluster_id: "hdbscan_detail",
              key: "clusters/dinov3_vits_384_hdbscan.json",
            },
          ],
          image_manifest: "manifest.jsonl",
          layouts: [
            {
              key: "layouts/dinov3_vits_384_umap.json",
              layout_id: "umap_a",
            },
          ],
          thumbnail_atlas_manifests: includeAtlasArtifact
            ? { "64": "viewer/atlases/64px/atlas-manifest.json" }
            : {},
        },
        recipe: {
          input_size: 384,
          model_family: "dinov3",
          model_id: "facebook/dinov3-vits16-pretrain-lvd1689m",
        },
        recipe_name: "dinov3_vits_384",
      },
    ],
    result_state: { state: "ready" },
    scope_label: scopeLabel,
    status: "ready",
    staleness: {
      added_image_count: 0,
      removed_image_count: 0,
      state: "current",
    },
  };
}

function textResponse(value: unknown) {
  return new Response(`${JSON.stringify(value)}\n`, {
    headers: { "content-type": "application/json" },
  });
}
