import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/latent-map/neighbors/route";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("latent map live neighbor API", () => {
  beforeEach(() => {
    execFileMock.mockReset();
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
});
