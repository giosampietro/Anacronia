import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

describe("analysis API proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies JSON Analysis creation to the local API", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          analysis: {
            analysis_id: "analysis-20260614T130000Z",
            title: "Bread visual study",
          },
          job: {
            analysis_job_id: "analysis-job-20260614T130000Z",
            status: "running",
          },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.stringify({
      collection_slugs: ["bread"],
      recipe_ids: ["dinov3_vits_384"],
      title: "Bread visual study",
    });
    const response = await POST(
      new Request("http://localhost/api/analyses", {
        body,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:18670/analyses", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      analysis: { analysis_id: "analysis-20260614T130000Z" },
    });
  });

  it("normalizes browser form submissions and redirects to selected Analysis", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          analysis: {
            analysis_id: "analysis-20260614T130000Z",
            title: "Bread visual study",
          },
          job: {
            analysis_job_id: "analysis-job-20260614T130000Z",
            status: "running",
          },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("title", " Bread visual study ");
    form.append("collection_slugs", "bread");
    form.append("collection_slugs", "mood-board");
    form.append("collection_slugs", "bread");
    form.append("recipe_ids", "dinov3_vits_384");
    form.append("recipe_ids", "dinov3_vits_512");

    const response = await POST(
      new Request("http://localhost/api/analyses", {
        body: form,
        headers: { accept: "text/html" },
        method: "POST",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:18670/analyses", {
      body: JSON.stringify({
        collection_slugs: ["bread", "mood-board"],
        recipe_ids: ["dinov3_vits_384", "dinov3_vits_512"],
        title: "Bread visual study",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/analysis-results?analysisId=analysis-20260614T130000Z",
    );
  });

  it("redirects failed browser form submissions back to New Analysis with the API error", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          detail: "At least one Collection is required for an Analysis Scope.",
        },
        { status: 422 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("title", "No source scope");

    const response = await POST(
      new Request("http://localhost/api/analyses", {
        body: form,
        headers: { accept: "text/html" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/analysis-results?mode=new-analysis&analysisError=At+least+one+Collection+is+required+for+an+Analysis+Scope.",
    );
  });

  it("proxies Analysis lists from the local API", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        analyses: [
          {
            analysis_id: "analysis-20260614T130000Z",
            title: "Bread visual study",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:18670/analyses", {
      method: "GET",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      analyses: [{ analysis_id: "analysis-20260614T130000Z" }],
    });
  });
});
