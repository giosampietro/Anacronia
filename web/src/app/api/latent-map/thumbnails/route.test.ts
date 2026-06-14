import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/latent-map/thumbnails/route";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

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
  });

  it("serves a manifest-listed artifact by Analysis Result ID and artifact key", async () => {
    const runsRoot = path.join(
      tmpdir(),
      `anacronia-artifact-route-${Date.now()}`,
    );
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");
    const artifactKey = "viewer/atlases/64px/page-000.png";
    const artifactBytes = new Uint8Array([1, 2, 3, 4]);

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.dirname(path.join(runDir, artifactKey)), { recursive: true });
    await writeFile(path.join(runDir, artifactKey), artifactBytes);
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      artifacts: [
        {
          content_type: "image/png",
          key: artifactKey,
        },
      ],
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?analysisResultId=latent-map-20260609T123000Z-j-shoot` +
          `&artifactKey=${encodeURIComponent(artifactKey)}`,
      ),
    );

    expect(response.ok).toBe(true);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(artifactBytes);
  });

  it("rejects Analysis Result artifact keys that are not in the manifest", async () => {
    const runsRoot = path.join(
      tmpdir(),
      `anacronia-artifact-route-${Date.now()}`,
    );
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runDir, "viewer"), { recursive: true });
    await writeFile(path.join(runDir, "viewer", "secret.png"), "nope");
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      artifacts: [],
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?analysisResultId=latent-map-20260609T123000Z-j-shoot` +
          `&artifactKey=${encodeURIComponent("viewer/secret.png")}`,
      ),
    );

    expect(response.status).toBe(404);
  });

  it("rejects traversal-shaped Analysis Result artifact keys before filesystem access", async () => {
    const runsRoot = path.join(
      tmpdir(),
      `anacronia-artifact-route-${Date.now()}`,
    );
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(runDir, { recursive: true });
    await writeJson(path.join(runDir, "analysis-result.json"), {
      analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
      artifacts: [
        {
          content_type: "image/png",
          key: "viewer/atlases/64px/page-000.png",
        },
      ],
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/thumbnails` +
          `?analysisResultId=latent-map-20260609T123000Z-j-shoot` +
          `&artifactKey=${encodeURIComponent("../secret.png")}`,
      ),
    );

    expect(response.status).toBe(403);
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
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes);
  });
});
