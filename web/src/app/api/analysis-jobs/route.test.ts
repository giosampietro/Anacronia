import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

describe("analysis job API proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies JSON job submissions to the local API", async () => {
    const fetchMock = vi.fn(async () => (
      Response.json(
        {
          analysis_job_id: "analysis-job-20260614T130000Z",
          analysis_result_ids: ["analysis-result-20260614T130000Z-dinov3_vits_384"],
          recipe_ids: ["dinov3_vits_384"],
          status: "ready",
          viewer_hrefs: [
            "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
          ],
        },
        { status: 201 },
      )
    ));
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.stringify({
      collection_slugs: ["analysis-board"],
      recipe_ids: ["dinov3_vits_384"],
    });
    const response = await POST(
      new Request("http://localhost/api/analysis-jobs", {
        body,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/analysis-jobs",
      {
        body,
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      analysis_job_id: "analysis-job-20260614T130000Z",
      status: "ready",
    });
  });

  it("normalizes browser form submissions and redirects to Analysis Studio", async () => {
    const fetchMock = vi.fn(async () => (
      Response.json(
        {
          analysis_job_id: "analysis-job-20260614T130000Z",
          analysis_result_ids: [],
          recipe_ids: ["dinov3_vits_384"],
          status: "failed",
          viewer_hrefs: [],
        },
        { status: 201 },
      )
    ));
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("collection_slugs", "analysis-board");
    form.append("collection_slugs", "mood-board");
    form.append("collection_slugs", "analysis-board");
    form.append("recipe_ids", "dinov3_vits_384");
    form.append("recipe_ids", "dinov3_vits_512");

    const response = await POST(
      new Request("http://localhost/api/analysis-jobs", {
        body: form,
        headers: { accept: "text/html" },
        method: "POST",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/analysis-jobs",
      {
        body: JSON.stringify({
          collection_slugs: ["analysis-board", "mood-board"],
          recipe_ids: ["dinov3_vits_384", "dinov3_vits_512"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/analysis-results?analysisJobId=analysis-job-20260614T130000Z&analysisJobStatus=failed",
    );
  });

  it("proxies job lists from the local API", async () => {
    const fetchMock = vi.fn(async () => (
      Response.json({
        jobs: [
          {
            analysis_job_id: "analysis-job-20260614T130000Z",
            analysis_result_ids: [],
            recipe_ids: ["dinov3_vits_384"],
            status: "failed",
            viewer_hrefs: [],
          },
        ],
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:18670/analysis-jobs",
      { method: "GET" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jobs: [{ analysis_job_id: "analysis-job-20260614T130000Z" }],
    });
  });
});
