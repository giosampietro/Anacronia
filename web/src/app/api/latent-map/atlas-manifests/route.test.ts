import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/latent-map/atlas-manifests/route";

describe("latent map atlas manifest API", () => {
  const previousRunsRoot = process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;

  beforeEach(() => {
    delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
  });

  afterEach(() => {
    if (previousRunsRoot === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
    } else {
      process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = previousRunsRoot;
    }
    vi.unstubAllGlobals();
  });

  it("proxies Analysis Result atlas manifests and normalizes page URLs", async () => {
    const artifactKey = "viewer/atlases/64px/atlas-manifest.json";
    const analysisResultId = "analysis-result-20260614T130000Z-dinov3_vits_384";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "http://127.0.0.1:18670/analysis-results/" +
          `${analysisResultId}/artifacts/viewer/atlases/64px/atlas-manifest.json`,
      );
      return Response.json(atlasManifestFixture());
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/atlas-manifests` +
          `?analysisResultId=${analysisResultId}` +
          `&artifactKey=${encodeURIComponent(artifactKey)}`,
      ),
    );
    const atlas = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.ok).toBe(true);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(atlas.tile_size).toBe(64);
    expect(atlas.pages[0].path).toBe(
      `/api/latent-map/thumbnails?analysisResultId=${analysisResultId}&artifactKey=viewer%2Fatlases%2F64px%2Fpage-000.png`,
    );
  });

  it("rejects non-atlas Analysis Result artifacts", async () => {
    const fetchMock = vi.fn(async () => Response.json({ layout: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/atlas-manifests` +
          `?analysisResultId=analysis-result-1` +
          `&artifactKey=${encodeURIComponent("layouts/dinov3_vits_384_umap.json")}`,
      ),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });

  it("rejects malformed atlas manifest JSON", async () => {
    const artifactKey = "viewer/atlases/64px/atlas-manifest.json";
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/atlas-manifests` +
          `?analysisResultId=analysis-result-1` +
          `&artifactKey=${encodeURIComponent(artifactKey)}`,
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
  });

  it("rejects atlas manifests whose tile size does not match the artifact key", async () => {
    const artifactKey = "viewer/atlases/64px/atlas-manifest.json";
    const fetchMock = vi.fn(async () =>
      Response.json({
        ...atlasManifestFixture(),
        tile_size: 32,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/atlas-manifests` +
          `?analysisResultId=analysis-result-1` +
          `&artifactKey=${encodeURIComponent(artifactKey)}`,
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
  });

  it("normalizes legacy run atlas manifests during migration", async () => {
    const runsRoot = path.join(tmpdir(), `anacronia-atlas-route-${Date.now()}`);
    const runName = "legacy-run";
    const relativePath = "viewer/atlases/64px/atlas-manifest.json";

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.dirname(path.join(runsRoot, runName, relativePath)), {
      recursive: true,
    });
    await writeFile(
      path.join(runsRoot, runName, relativePath),
      JSON.stringify(atlasManifestFixture()),
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/atlas-manifests` +
          `?run=${runName}&path=${encodeURIComponent(relativePath)}`,
      ),
    );
    const atlas = await response.json();

    expect(response.ok).toBe(true);
    expect(atlas.pages[0].path).toBe(
      `/api/latent-map/thumbnails?run=${runName}&path=viewer%2Fatlases%2F64px%2Fpage-000.png`,
    );
  });
});

function atlasManifestFixture() {
  return {
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
    run_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
    schema_version: 1,
    tile_size: 64,
  };
}
