import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/latent-map/neighbors/route";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("latent map live neighbor API", () => {
  const previousRunsRoot = process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;

  beforeEach(() => {
    delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
    execFileMock.mockReset();
  });

  afterEach(() => {
    if (previousRunsRoot === undefined) {
      delete process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT;
    } else {
      process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = previousRunsRoot;
    }
  });

  it("returns requested relation rows from the live FAISS helper", async () => {
    execFileMock.mockImplementation(
      (_file, _args, _options, callback: (error: Error | null, stdout: string) => void) => {
        callback(
          null,
          JSON.stringify({
            neighbors: [
              { image_id: "img_b", score: 0.99 },
              { image_id: "img_c", score: 0.12 },
              { image_id: "img_d", score: -1 },
            ],
            opposites: [
              { image_id: "img_d", score: -1 },
              { image_id: "img_c", score: 0.12 },
              { image_id: "img_b", score: 0.99 },
            ],
          }),
        );
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/neighbors?run=route-live` +
          `&recipe=dinov3_test&image_id=img_a&top_k=3&relation=both`,
      ),
    );
    const payload = await response.json();

    expect(response.ok).toBe(true);
    expect(payload.neighbors.map((row: { image_id: string }) => row.image_id))
      .toEqual(["img_b", "img_c", "img_d"]);
    expect(payload.opposites.map((row: { image_id: string }) => row.image_id))
      .toEqual(["img_d", "img_c", "img_b"]);
    expect(payload.top_k).toBe(3);
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        "faiss-query",
        "--recipe",
        "dinov3_test",
        "--image-id",
        "img_a",
        "--top-k",
        "3",
        "--relation",
        "both",
      ]),
    );
  });

  it("queries live FAISS by Analysis Result ID and reports timing metadata", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "neighbor-result-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runDir, "indexes"), { recursive: true });
    await writeFile(path.join(runDir, "indexes", "dinov3_test_flat_ip.faiss"), "");
    await writeFile(
      path.join(runDir, "indexes", "dinov3_test_faiss_id_map.json"),
      "[]",
    );
    await writeFile(
      path.join(runDir, "analysis-result.json"),
      JSON.stringify({
        analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
        artifacts: [
          {
            key: "indexes/dinov3_test_flat_ip.faiss",
            role: "faiss-index",
          },
          {
            key: "indexes/dinov3_test_faiss_id_map.json",
            role: "faiss-id-map",
          },
        ],
        recipes: [
          {
            artifact_keys: {
              faiss_id_map: "indexes/dinov3_test_faiss_id_map.json",
              faiss_index: "indexes/dinov3_test_flat_ip.faiss",
            },
            recipe_name: "dinov3_test",
          },
        ],
      }),
      "utf-8",
    );
    execFileMock.mockImplementation(
      (_file, _args, _options, callback: (error: Error | null, stdout: string) => void) => {
        callback(
          null,
          JSON.stringify({
            neighbors: [{ image_id: "img_b", score: 0.99 }],
          }),
        );
      },
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/neighbors` +
          `?analysisResultId=latent-map-20260609T123000Z-j-shoot` +
          `&recipe=dinov3_test&image_id=img_a&top_k=1&relation=closest`,
      ),
    );
    const payload = await response.json();

    expect(response.ok).toBe(true);
    expect(payload.analysis_result_id).toBe(
      "latent-map-20260609T123000Z-j-shoot",
    );
    expect(payload.timings.faiss_query_ms).toEqual(expect.any(Number));
    expect(execFileMock.mock.calls[0][1]).toEqual(
      expect.arrayContaining(["--run-dir", runDir]),
    );
  });

  it("does not query FAISS for an Analysis Result without declared FAISS artifacts", async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), "neighbor-result-"));
    const runDir = path.join(runsRoot, "20260609T123000Z-j-shoot");

    process.env.ANACRONIA_LATENT_MAP_RUNS_ROOT = runsRoot;
    await mkdir(path.join(runDir, "indexes"), { recursive: true });
    await writeFile(path.join(runDir, "indexes", "dinov3_test_flat_ip.faiss"), "");
    await writeFile(
      path.join(runDir, "indexes", "dinov3_test_faiss_id_map.json"),
      "[]",
    );
    await writeFile(
      path.join(runDir, "analysis-result.json"),
      JSON.stringify({
        analysis_result_id: "latent-map-20260609T123000Z-j-shoot",
        artifacts: [],
        recipes: [
          {
            artifact_keys: {
              faiss_id_map: "indexes/dinov3_test_faiss_id_map.json",
              faiss_index: "indexes/dinov3_test_flat_ip.faiss",
            },
            recipe_name: "dinov3_test",
          },
        ],
      }),
      "utf-8",
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/latent-map/neighbors` +
          `?analysisResultId=latent-map-20260609T123000Z-j-shoot` +
          `&recipe=dinov3_test&image_id=img_a&top_k=1&relation=closest`,
      ),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("FAISS neighbor index not found.");
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
