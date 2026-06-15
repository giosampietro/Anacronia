import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/latent-map/thumbnails/route";

describe("latent map thumbnail API", () => {
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

  it("proxies Analysis Result artifacts through the backend Registry artifact API", async () => {
    const artifactKey = "viewer/atlases/64px/page-000.png";
    const artifactBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "http://127.0.0.1:18670/analysis-results/" +
          "analysis-result-20260614T130000Z-dinov3_vits_384/artifacts/" +
          "viewer/atlases/64px/page-000.png",
      );
      return new Response(artifactBytes, {
        headers: { "content-type": "image/png" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384` +
          `&artifactKey=${encodeURIComponent(artifactKey)}`,
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.ok).toBe(true);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(artifactBytes);
  });

  it("does not fall through to legacy path access when Analysis Result ID is present", async () => {
    const runsRoot = path.join(
      tmpdir(),
      `anacronia-artifact-route-${Date.now()}`,
    );
    const runName = "legacy-run";
    const relativePath = "thumbnails/img-a.jpg";

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    await mkdir(path.dirname(path.join(runsRoot, runName, relativePath)), {
      recursive: true,
    });
    await writeFile(path.join(runsRoot, runName, relativePath), new Uint8Array([5]));

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?analysisResultId=analysis-result-missing` +
          `&run=${runName}&path=${encodeURIComponent(relativePath)}`,
      ),
    );

    expect(response.status).toBe(404);
  });

  it("rejects non-image Analysis Result artifacts even when the backend can serve them", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('{"layout":true}', {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384` +
          `&artifactKey=${encodeURIComponent("layouts/dinov3_vits_384_umap.json")}`,
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Thumbnail not found.");
  });

  it("keeps legacy run and path access during migration", async () => {
    const runsRoot = path.join(
      tmpdir(),
      `anacronia-artifact-route-${Date.now()}`,
    );
    const runName = "legacy-run";
    const relativePath = "thumbnails/img-a.jpg";
    const imageBytes = new Uint8Array([5, 6, 7, 8]);

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.dirname(path.join(runsRoot, runName, relativePath)), {
      recursive: true,
    });
    await writeFile(path.join(runsRoot, runName, relativePath), imageBytes);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?run=${runName}&path=${encodeURIComponent(relativePath)}`,
      ),
    );

    expect(response.ok).toBe(true);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes);
  });

  it("rejects non-browser-safe legacy run paths during migration", async () => {
    const runsRoot = path.join(
      tmpdir(),
      `anacronia-artifact-route-${Date.now()}`,
    );
    const runName = "legacy-run";

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runsRoot, runName, "viewer"), { recursive: true });
    await writeFile(path.join(runsRoot, runName, "report.md"), "# report\n/private\n");
    await writeFile(path.join(runsRoot, runName, "viewer", "unsafe.png"), "png");

    for (const relativePath of ["report.md", "viewer/unsafe.png"]) {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/latent-map/thumbnails` +
            `?run=${runName}&path=${encodeURIComponent(relativePath)}`,
        ),
      );

      expect(response.status).toBe(404);
    }
  });
});
