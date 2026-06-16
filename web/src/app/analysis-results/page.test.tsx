import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import AnalysisResultsPage from "@/app/analysis-results/page";

const DEFAULT_RESULTS = [
  {
    analysis_job_id: "analysis-job-20260614T130000Z",
    analysis_result_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
    explorer_href:
      "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    explorer_readiness: { ready: true },
    item_count: 3184,
    recipe_ids: ["dinov3_vits_384"],
    recipe_names: ["dinov3_vits_384"],
    result_state: { state: "ready" },
    scope_label: "J Shoot",
    status: "ready",
    staleness: { state: "current" },
    storage_by_role: {
      "faiss-index": 1048576,
      "thumbnail-atlas": 1572864,
    },
    storage_totals: { total: 2621440 },
  },
];

const DEFAULT_JOBS = [
  {
    analysis_job_id: "analysis-job-20260614T130010Z",
    analysis_result_ids: [],
    created_at: "2026-06-14T13:00:10Z",
    recipe_ids: ["dinov3_vits_512"],
    scope_snapshot: {
      counts: { collections: 1, images: 64 },
      item_count: 64,
      snapshot_id: "analysis-scope-snapshot-running",
    },
    stages: [
      {
        stage_name: "scope_snapshot",
        status: "ready",
      },
      {
        stage_name: "embedding_planning",
        output_counts: {
          missing_embeddings: 64,
          reusable_embeddings: 0,
        },
        status: "ready",
      },
      {
        recipe_id: "dinov3_vits_512",
        stage_name: "embedding_computation",
        status: "running",
      },
    ],
    status: "running",
    viewer_hrefs: [],
  },
  {
    analysis_job_id: "analysis-job-20260614T130000Z",
    analysis_result_ids: ["analysis-result-20260614T130000Z-dinov3_vits_384"],
    created_at: "2026-06-14T13:00:00Z",
    recipe_ids: ["dinov3_vits_384"],
    scope_snapshot: {
      counts: { collections: 1, images: 3184 },
      item_count: 3184,
      snapshot_id: "analysis-scope-snapshot-j-shoot",
    },
    stages: [
      {
        stage_name: "scope_snapshot",
        status: "ready",
      },
      {
        stage_name: "embedding_planning",
        output_counts: {
          missing_embeddings: 0,
          reusable_embeddings: 3184,
        },
        status: "ready",
      },
      {
        elapsed_ms: 620,
        recipe_id: "dinov3_vits_384",
        stage_name: "embedding_computation",
        status: "ready",
      },
      {
        elapsed_ms: 90,
        recipe_id: "dinov3_vits_384",
        stage_name: "faiss",
        status: "ready",
      },
      {
        elapsed_ms: 410,
        output_artifact_count: 4,
        recipe_id: "dinov3_vits_384",
        stage_name: "atlas_generation",
        status: "ready",
      },
      {
        output_artifact_count: 1,
        recipe_id: "dinov3_vits_384",
        stage_name: "result_registration",
        status: "ready",
      },
    ],
    status: "ready",
    viewer_hrefs: [
      "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    ],
  },
];

const DEFAULT_ANALYSES = [
  {
    analysis_id: "analysis-20260614T130000Z",
    analysis_job_ids: ["analysis-job-20260614T130000Z"],
    source_collections: [{ label: "J Shoot", slug: "j-shoot" }],
    status: "ready",
    title: "J Shoot visual study",
    variants: [
      {
        analysis_result_id: "analysis-result-20260614T130000Z-dinov3_vits_384",
        explorer_href:
          "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
        status: "ready",
      },
    ],
  },
];

function stubAnalysisStudioFetch({
  analyses = DEFAULT_ANALYSES,
  analysesOk = true,
  jobs = DEFAULT_JOBS,
  jobsOk = true,
  results = DEFAULT_RESULTS,
  resultsOk = true,
}: {
  analyses?: unknown[];
  analysesOk?: boolean;
  jobs?: unknown[];
  jobsOk?: boolean;
  results?: unknown[];
  resultsOk?: boolean;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return Response.json({
          service: "api",
          status: "ok",
          worker: { service: "worker", status: "idle" },
        });
      }
      if (url.endsWith("/analyses")) {
        if (!analysesOk) {
          return new Response(null, { status: 500 });
        }
        return Response.json({ analyses });
      }
      if (url.endsWith("/analysis-results")) {
        if (!resultsOk) {
          return new Response(null, { status: 500 });
        }
        return Response.json({ results });
      }
      if (url.endsWith("/search-sets")) {
        return Response.json([
          {
            display_name: "J Shoot",
            slug: "j-shoot",
            terms: [],
          },
          {
            display_name: "Mood Board",
            slug: "mood-board",
            terms: [],
          },
        ]);
      }
      if (url.endsWith("/analysis-recipes")) {
        return Response.json({
          default_recipe_id: "dinov3_vits_384",
          recipes: [
            {
              input_size: 384,
              is_default: true,
              label: "DINOv3 ViT-S 384px",
              recipe_id: "dinov3_vits_384",
            },
            {
              input_size: 512,
              is_default: false,
              label: "DINOv3 ViT-S 512px",
              recipe_id: "dinov3_vits_512",
            },
          ],
          schema_version: 1,
        });
      }
      if (url.endsWith("/analysis-jobs")) {
        if (!jobsOk) {
          return new Response(null, { status: 500 });
        }
        return Response.json({ jobs });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function normalizeServerHtml(html: string): string {
  return html.replaceAll("<!-- -->", "");
}

describe("AnalysisResultsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Analysis Studio shell with Analyses sidebar and selected Analysis overview", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T130000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("data-app-space-shell=\"true\"");
    expect(html).toContain("data-active-space=\"analysis\"");
    expect(html).toContain("aria-label=\"App spaces\"");
    expect(html).toContain("aria-label=\"Workspace\"");
    expect(html).toContain("id=\"app-shell-top-bar-controls\"");
    expect(html).toContain(">New Analysis<");
    expect(html).toContain(">Analyses<");
    expect(html).toContain("Filter Analyses");
    expect(html).toContain("href=\"/analysis-results?analysisId=analysis-20260614T130000Z\"");
    expect(html).toContain(">J Shoot visual study<");
    expect(html).toContain("J Shoot");
    expect(html).toContain("Source Collections");
    expect(html).toContain("Job activity");
    expect(html).toContain("Variants");
    expect(html).toContain("Variant storage");
    expect(html).toContain("Shared embeddings");
    expect(html).toContain("Variant 1");
    expect(html).toContain("DINOv3 ViT-S 384px");
    expect(html).toContain("3184 images");
    expect(html).toContain("3184 reused");
    expect(html).toContain("2.5 MB");
    expect(html).not.toContain(">Overview<");
    expect(html).not.toContain(">Analysis Results<");
    expect(html).not.toContain(">Jobs<");
    expect(html).not.toContain("Selected Analysis Result");
    expect(html).not.toContain("Selected Analysis Job");
    expect(html).not.toContain("Durable Analysis Results live here.");
    expect(html).not.toContain("Analysis Results</h1>");
    expect(html).not.toContain("Recipe variants already represented");
    expect(html).not.toContain("Submitted Jobs");
    expect(html).not.toContain("Collection slugs");
  });

  it("renders the New Analysis workspace from URL state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({ mode: "new-analysis" }),
        }),
      ),
    );

    expect(html).toContain(">New Analysis<");
    expect(html).toContain("action=\"/api/analyses\"");
    expect(html).toContain("Name the Analysis");
    expect(html).toContain("name=\"title\"");
    expect(html).toContain("required=\"\"");
    expect(html).toContain("Choose Collections");
    expect(html).toContain("name=\"collection_slugs\"");
    expect(html).toContain("value=\"j-shoot\"");
    expect(html).toContain("value=\"mood-board\"");
    expect(html).toContain("name=\"recipe_ids\"");
    expect(html).toContain("value=\"dinov3_vits_384\"");
    expect(html).toContain("Create Analysis");
    expect(html).not.toContain("Start Analysis Job");
    expect(html).not.toContain("Result and Job detail panels will deepen");
  });

  it("renders New Analysis server validation errors from failed form redirects", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisError:
              "At least one Collection is required for an Analysis Scope.",
            mode: "new-analysis",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis was not created");
    expect(html).toContain(
      "At least one Collection is required for an Analysis Scope.",
    );
    expect(html).toContain("action=\"/api/analyses\"");
  });

  it("renders overview counts from persistent Analyses, excluding unattached Results", async () => {
    stubAnalysisStudioFetch({
      results: [
        ...DEFAULT_RESULTS,
        {
          analysis_job_id: "analysis-job-orphan",
          analysis_result_id: "analysis-result-orphan-dinov3_vits_384",
          explorer_href:
            "/latent-map?analysisResultId=analysis-result-orphan-dinov3_vits_384",
          explorer_readiness: { ready: true },
          item_count: 3184,
          recipe_ids: ["dinov3_vits_384"],
          recipe_names: ["dinov3_vits_384"],
          result_state: { state: "ready" },
          scope_label: "J Shoot",
          status: "ready",
          staleness: { state: "current" },
          storage_totals: { total: 2621440 },
        },
      ],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({}),
        }),
      ),
    );

    expect(html).toContain("Analyses run");
    expect(html).toContain("<p class=\"text-2xl font-semibold\">1</p>");
    expect(html).toContain("3184 images");
    expect(html).toContain("1 ready");
    expect(html).not.toContain("6368 images");
    expect(html).not.toContain("2 ready");
  });

  it("uses plain empty copy for an empty Analysis sidebar", async () => {
    stubAnalysisStudioFetch({ analyses: [], jobs: [], results: [] });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({}),
        }),
      ),
    );

    expect(html).toContain("New analyses will appear here.");
    expect(html).not.toContain("No Analysis Results</");
    expect(html).not.toContain(">Jobs<");
  });

  it("renders explicit missing Analysis state instead of silently falling back", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-missing",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis not found");
    expect(html).toContain("analysis-missing");
    expect(html).not.toContain("J Shoot visual study</h1>");
  });

  it("renders selected running Analysis progress without a completed Variant", async () => {
    stubAnalysisStudioFetch({
      analyses: [
        {
          analysis_id: "analysis-20260614T130010Z",
          analysis_job_ids: ["analysis-job-20260614T130010Z"],
          source_collections: [{ label: "Mood Board", slug: "mood-board" }],
          status: "running",
          title: "Mood Board visual study",
          variants: [],
        },
      ],
      results: [],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T130010Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Mood Board visual study");
    expect(html).toContain("Source Collections");
    expect(html).toContain("Mood Board");
    expect(html).toContain("Job activity");
    expect(html).toContain("running");
    expect(html).toContain("Current stage: Embedding computation");
    expect(html).toContain("No Variants yet.");
    expect(html).not.toContain(">Open Explorer<");
  });

  it("renders selected failed Analysis error detail without pretending a Variant exists", async () => {
    stubAnalysisStudioFetch({
      analyses: [
        {
          analysis_id: "analysis-20260614T160000Z",
          analysis_job_ids: ["analysis-job-20260614T160000Z"],
          source_collections: [{ label: "Mood Board", slug: "mood-board" }],
          status: "failed",
          title: "Failed visual study",
          variants: [],
        },
      ],
      jobs: [
        {
          analysis_job_id: "analysis-job-20260614T160000Z",
          analysis_result_ids: [],
          created_at: "2026-06-14T16:00:00Z",
          recipe_ids: ["dinov3_vits_384"],
          scope_snapshot: {
            counts: { collections: 1, images: 25 },
            item_count: 25,
            snapshot_id: "analysis-scope-snapshot-failed",
          },
          stages: [
            {
              stage_name: "scope_snapshot",
              status: "ready",
            },
            {
              error: "embedding cache write failed",
              recipe_id: "dinov3_vits_384",
              stage_name: "embedding_computation",
              status: "failed",
            },
          ],
          status: "failed",
          viewer_hrefs: [],
        },
      ],
      results: [],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T160000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("failed");
    expect(html).toContain("Failed at Embedding computation");
    expect(html).toContain("embedding cache write failed");
    expect(html).toContain("No Variants yet.");
    expect(html).not.toContain(">Open Explorer<");
  });

  it("renders selected Analysis multi-Variant rows with chronological labels and per-Variant Explorer links", async () => {
    stubAnalysisStudioFetch({
      analyses: [
        {
          analysis_id: "analysis-20260614T170000Z",
          analysis_job_ids: ["analysis-job-20260614T170000Z"],
          source_collections: [{ label: "Bread", slug: "bread" }],
          status: "ready",
          title: "Bread comparison",
          variants: [
            {
              analysis_result_id:
                "analysis-result-20260614T170000Z-dinov3_vits_384",
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_384",
              status: "ready",
            },
            {
              analysis_result_id:
                "analysis-result-20260614T170000Z-dinov3_vits_512",
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_512",
              status: "ready",
            },
          ],
        },
      ],
      jobs: [
        {
          analysis_job_id: "analysis-job-20260614T170000Z",
          analysis_result_ids: [
            "analysis-result-20260614T170000Z-dinov3_vits_384",
            "analysis-result-20260614T170000Z-dinov3_vits_512",
          ],
          created_at: "2026-06-14T17:00:00Z",
          recipe_ids: ["dinov3_vits_384", "dinov3_vits_512"],
          scope_snapshot: {
            counts: { collections: 1, images: 40 },
            item_count: 40,
            snapshot_id: "analysis-scope-snapshot-bread",
          },
          stages: [
            {
              output_counts: {
                missing_embeddings: 40,
                reusable_embeddings: 40,
              },
              stage_name: "embedding_planning",
              status: "ready",
            },
          ],
          status: "ready",
          viewer_hrefs: [
            "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_384",
            "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_512",
          ],
        },
      ],
      results: [
        {
          analysis_job_id: "analysis-job-20260614T170000Z",
          analysis_result_id: "analysis-result-20260614T170000Z-dinov3_vits_384",
          explorer_href:
            "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_384",
          explorer_readiness: { ready: true },
          item_count: 40,
          recipe_ids: ["dinov3_vits_384"],
          recipe_names: ["dinov3_vits_384"],
          result_state: { state: "ready" },
          scope_label: "Bread",
          status: "ready",
          staleness: { state: "current" },
          storage_by_role: { embedding: 1024 },
          storage_totals: { total: 3072 },
        },
        {
          analysis_job_id: "analysis-job-20260614T170000Z",
          analysis_result_id: "analysis-result-20260614T170000Z-dinov3_vits_512",
          explorer_href:
            "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_512",
          explorer_readiness: { ready: true },
          item_count: 40,
          recipe_ids: ["dinov3_vits_512"],
          recipe_names: ["dinov3_vits_512"],
          result_state: { state: "ready" },
          scope_label: "Bread",
          status: "ready",
          staleness: { state: "current" },
          storage_by_role: { embedding: 2048 },
          storage_totals: { total: 6144 },
        },
      ],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T170000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Variant 1");
    expect(html).toContain("Variant 2");
    expect(html.indexOf("Variant 1")).toBeLessThan(html.indexOf("Variant 2"));
    expect(html).toContain("DINOv3 ViT-S 384px");
    expect(html).toContain("DINOv3 ViT-S 512px");
    expect(html).toContain("40 images");
    expect(html).toContain("40 reused · 40 new");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("4.0 KB");
    expect(html).toContain(
      "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_384",
    );
    expect(html).toContain(
      "/latent-map?analysisResultId=analysis-result-20260614T170000Z-dinov3_vits_512",
    );
  });

  it("renders selected Analysis missing Variant as unavailable without Explorer shortcut", async () => {
    stubAnalysisStudioFetch({
      analyses: [
        {
          analysis_id: "analysis-20260614T180000Z",
          analysis_job_ids: ["analysis-job-20260614T180000Z"],
          source_collections: [{ label: "Bread", slug: "bread" }],
          status: "failed",
          title: "Bread interrupted study",
          variants: [
            {
              analysis_result_id:
                "analysis-result-20260614T180000Z-dinov3_vits_384",
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T180000Z-dinov3_vits_384",
              status: "missing",
            },
          ],
        },
      ],
      jobs: [
        {
          analysis_job_id: "analysis-job-20260614T180000Z",
          analysis_result_ids: [
            "analysis-result-20260614T180000Z-dinov3_vits_384",
          ],
          created_at: "2026-06-14T18:00:00Z",
          recipe_ids: ["dinov3_vits_384"],
          scope_snapshot: {
            counts: { collections: 1, images: 40 },
            item_count: 40,
            snapshot_id: "analysis-scope-snapshot-bread",
          },
          stages: [],
          status: "failed",
          viewer_hrefs: [],
        },
      ],
      results: [],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T180000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Variant 1");
    expect(html).toContain("missing");
    expect(html).toContain("Recipe unavailable");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain(">Open Explorer<");
  });

  it("renders selected Analysis failed Variant as unavailable while preserving recipe metadata", async () => {
    stubAnalysisStudioFetch({
      analyses: [
        {
          analysis_id: "analysis-20260614T190000Z",
          analysis_job_ids: ["analysis-job-20260614T190000Z"],
          source_collections: [{ label: "Bread", slug: "bread" }],
          status: "failed",
          title: "Bread failed result study",
          variants: [
            {
              analysis_result_id:
                "analysis-result-20260614T190000Z-dinov3_vits_384",
              explorer_href:
                "/latent-map?analysisResultId=analysis-result-20260614T190000Z-dinov3_vits_384",
              status: "failed",
            },
          ],
        },
      ],
      jobs: [
        {
          analysis_job_id: "analysis-job-20260614T190000Z",
          analysis_result_ids: [
            "analysis-result-20260614T190000Z-dinov3_vits_384",
          ],
          created_at: "2026-06-14T19:00:00Z",
          recipe_ids: ["dinov3_vits_384"],
          scope_snapshot: {
            counts: { collections: 1, images: 40 },
            item_count: 40,
            snapshot_id: "analysis-scope-snapshot-bread",
          },
          stages: [
            {
              output_counts: {
                missing_embeddings: 40,
                reusable_embeddings: 0,
              },
              stage_name: "embedding_planning",
              status: "ready",
            },
          ],
          status: "failed",
          viewer_hrefs: [],
        },
      ],
      results: [
        {
          analysis_job_id: "analysis-job-20260614T190000Z",
          analysis_result_id: "analysis-result-20260614T190000Z-dinov3_vits_384",
          explorer_href:
            "/latent-map?analysisResultId=analysis-result-20260614T190000Z-dinov3_vits_384",
          explorer_readiness: { ready: false },
          item_count: 40,
          recipe_ids: ["dinov3_vits_384"],
          recipe_names: ["dinov3_vits_384"],
          result_state: { state: "failed" },
          scope_label: "Bread",
          status: "failed",
          staleness: { state: "current" },
          storage_by_role: { embedding: 1024 },
          storage_totals: { total: 4096 },
        },
      ],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisId: "analysis-20260614T190000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Variant 1");
    expect(html).toContain("failed");
    expect(html).toContain("DINOv3 ViT-S 384px");
    expect(html).toContain("40 images");
    expect(html).toContain("0 reused · 40 new");
    expect(html).toContain("3.0 KB");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain(">Open Explorer<");
  });

  it("renders the selected result workspace from URL state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisResultId:
              "analysis-result-20260614T130000Z-dinov3_vits_384",
          }),
        }),
      ),
    );

    expect(html).toContain("Selected Analysis Result");
    expect(html).toContain("J Shoot");
    expect(html).toContain("Required artifacts ready");
    expect(html).toContain("2.5 MB");
    expect(html).toContain("Open Explorer");
    expect(html).toContain(
      "/latent-map?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    );
    expect(html).toContain(
      "/api/analysis-results/analysis-result-20260614T130000Z-dinov3_vits_384",
    );
  });

  it("renders the selected running job workspace from URL state", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-20260614T130010Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Selected Analysis Job");
    expect(html).toContain("analysis-job-20260614T130010Z");
    expect(html).toContain("Current stage: Embedding computation");
    expect(html).toContain("Stage Timeline");
    expect(html).toContain("Scope snapshot");
    expect(html).toContain("Embedding planning");
    expect(html).toContain("Embedding computation");
    expect(html).toContain("No completed result yet.");
  });

  it("renders the selected ready job with scope summary and produced result links", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-20260614T130000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("Selected Analysis Job");
    expect(html).toContain("analysis-job-20260614T130000Z");
    expect(html).toContain("Analysis Scope");
    expect(html).toContain("3184 items in scope");
    expect(html).toContain("Created");
    expect(html).toContain("Recipe Results");
    expect(html).toContain("DINOv3 ViT-S 384px");
    expect(html).toContain(
      "/analysis-results?analysisResultId=analysis-result-20260614T130000Z-dinov3_vits_384",
    );
    expect(html).not.toContain(">Open Explorer<");
  });

  it("renders failed stage, failed recipe, and error detail for partial multi-recipe jobs", async () => {
    stubAnalysisStudioFetch({
      jobs: [
        {
          analysis_job_id: "analysis-job-20260614T150000Z",
          analysis_result_ids: [
            "analysis-result-20260614T150000Z-dinov3_vits_384",
          ],
          created_at: "2026-06-14T15:00:00Z",
          recipe_ids: ["dinov3_vits_384", "dinov3_vits_512"],
          scope_snapshot: {
            counts: { collections: 1, images: 40 },
            item_count: 40,
            snapshot_id: "analysis-scope-snapshot-bread",
          },
          stages: [
            {
              stage_name: "scope_snapshot",
              status: "ready",
            },
            {
              stage_name: "embedding_planning",
              output_counts: {
                missing_embeddings: 40,
                reusable_embeddings: 0,
              },
              status: "ready",
            },
            {
              recipe_id: "dinov3_vits_384",
              stage_name: "embedding_computation",
              status: "ready",
            },
            {
              output_artifact_count: 1,
              recipe_id: "dinov3_vits_384",
              stage_name: "result_registration",
              status: "ready",
            },
            {
              error: "gated model access pending",
              recipe_id: "dinov3_vits_512",
              stage_name: "embedding_computation",
              status: "failed",
            },
          ],
          status: "partial_failed",
          viewer_hrefs: [
            "/latent-map?analysisResultId=analysis-result-20260614T150000Z-dinov3_vits_384",
          ],
        },
      ],
      results: [
        {
          analysis_job_id: "analysis-job-20260614T150000Z",
          analysis_result_id: "analysis-result-20260614T150000Z-dinov3_vits_384",
          explorer_href:
            "/latent-map?analysisResultId=analysis-result-20260614T150000Z-dinov3_vits_384",
          explorer_readiness: { ready: true },
          item_count: 40,
          recipe_ids: ["dinov3_vits_384"],
          recipe_names: ["dinov3_vits_384"],
          result_state: { state: "ready" },
          scope_label: "Bread",
          status: "ready",
          staleness: { state: "current" },
          storage_totals: { total: 131072 },
        },
      ],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-20260614T150000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("partial_failed");
    expect(html).toContain("Failed at Embedding computation");
    expect(html).toContain("Failed recipe");
    expect(html).toContain("DINOv3 ViT-S 512px");
    expect(html).toContain("gated model access pending");
    expect(html).toContain("Recipe Results");
    expect(html).toContain(
      "/analysis-results?analysisResultId=analysis-result-20260614T150000Z-dinov3_vits_384",
    );
    expect(html).not.toContain(">Open Explorer<");
  });

  it("renders failed job detail without pretending a result exists", async () => {
    stubAnalysisStudioFetch({
      jobs: [
        {
          analysis_job_id: "analysis-job-20260614T160000Z",
          analysis_result_ids: [],
          created_at: "2026-06-14T16:00:00Z",
          recipe_ids: ["dinov3_vits_384"],
          scope_snapshot: {
            counts: { collections: 1, images: 25 },
            item_count: 25,
            snapshot_id: "analysis-scope-snapshot-failed",
          },
          stages: [
            {
              stage_name: "scope_snapshot",
              status: "ready",
            },
            {
              error: "embedding cache write failed",
              recipe_id: "dinov3_vits_384",
              stage_name: "embedding_computation",
              status: "failed",
            },
          ],
          status: "failed",
          viewer_hrefs: [],
        },
      ],
      results: [],
    });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-20260614T160000Z",
          }),
        }),
      ),
    );

    expect(html).toContain("failed");
    expect(html).toContain("Failed at Embedding computation");
    expect(html).toContain("embedding cache write failed");
    expect(html).toContain("No completed result yet.");
  });

  it("renders explicit missing result state instead of silently falling back", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisResultId: "analysis-result-missing",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis Result not found");
    expect(html).toContain("analysis-result-missing");
    expect(html).not.toContain("Selected Analysis Result");
  });

  it("renders explicit missing job state instead of silently falling back", async () => {
    stubAnalysisStudioFetch();

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisJobId: "analysis-job-missing",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis Job not found");
    expect(html).toContain("analysis-job-missing");
    expect(html).not.toContain("Selected Analysis Job");
  });

  it("shows unavailable state instead of not-found when results cannot be loaded", async () => {
    stubAnalysisStudioFetch({ resultsOk: false });

    const html = normalizeServerHtml(
      renderToString(
        await AnalysisResultsPage({
          searchParams: Promise.resolve({
            analysisResultId:
              "analysis-result-20260614T130000Z-dinov3_vits_384",
          }),
        }),
      ),
    );

    expect(html).toContain("Analysis Results unavailable");
    expect(html).not.toContain("Analysis Result not found");
  });
});
