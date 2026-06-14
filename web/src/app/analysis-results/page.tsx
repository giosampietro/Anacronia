import Link from "next/link";

import { AnalysisJobForm } from "@/app/analysis-results/analysis-job-form";
import { AppSpaceShell } from "@/components/app-space-shell";
import { listAnalysisResults } from "@/lib/analysis-results-browser";
import type { AnalysisResultStatusState } from "@/lib/analysis-result-status";
import {
  getAdditionalAnalysisResultRoots,
  getLatentMapRunsRoot,
} from "@/lib/analysis-result-roots";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis Results | Anacronia",
};

function getApiPort(): number {
  const value = Number.parseInt(process.env.ANACRONIA_API_PORT ?? "", 10);
  return Number.isFinite(value) ? value : 18670;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

type AnalysisJobListItem = {
  analysis_job_id: string;
  analysis_result_ids: string[];
  recipe_ids: string[];
  stages?: AnalysisJobStage[];
  status: string;
  viewer_hrefs: string[];
};

type AnalysisJobStage = {
  error?: string;
  stage_name?: string;
  status?: string;
};

type CollectionListItem = {
  display_name?: string;
  slug: string;
};

type AnalysisResultsPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

async function listAnalysisJobs(): Promise<{
  jobs: AnalysisJobListItem[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${getApiPort()}/analysis-jobs`,
      {
        cache: "no-store",
        method: "GET",
      },
    );
    if (!response.ok) {
      return { jobs: [], unavailable: true };
    }
    const payload = (await response.json()) as { jobs?: AnalysisJobListItem[] };
    return {
      jobs: Array.isArray(payload.jobs) ? payload.jobs : [],
      unavailable: false,
    };
  } catch {
    return { jobs: [], unavailable: true };
  }
}

async function listCollections(): Promise<{
  collections: CollectionListItem[];
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${getApiPort()}/search-sets`, {
      cache: "no-store",
      method: "GET",
    });
    if (!response.ok) {
      return { collections: [], unavailable: true };
    }
    const payload = (await response.json()) as unknown;
    return {
      collections: normalizeCollections(payload),
      unavailable: false,
    };
  } catch {
    return { collections: [], unavailable: true };
  }
}

function normalizeCollections(payload: unknown): CollectionListItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item): CollectionListItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Partial<CollectionListItem>;
      if (typeof candidate.slug !== "string" || candidate.slug.length === 0) {
        return null;
      }
      return {
        display_name:
          typeof candidate.display_name === "string"
            ? candidate.display_name
            : undefined,
        slug: candidate.slug,
      };
    })
    .filter((item): item is CollectionListItem => item !== null)
    .sort((left, right) =>
      (left.display_name ?? left.slug).localeCompare(
        right.display_name ?? right.slug,
      ),
    );
}

function summarizeRecipes(results: Awaited<ReturnType<typeof listAnalysisResults>>) {
  const recipeNames = new Set<string>();

  results.forEach((result) => {
    result.recipeNames.forEach((recipeName) => recipeNames.add(recipeName));
  });

  return [...recipeNames].sort((left, right) => left.localeCompare(right));
}

function summarizeStates(
  results: Awaited<ReturnType<typeof listAnalysisResults>>,
) {
  const counts = new Map<AnalysisResultStatusState, number>();

  results.forEach((result) => {
    counts.set(result.state, (counts.get(result.state) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(([leftState], [rightState]) => leftState.localeCompare(rightState))
    .map(([state, count]) => `${formatCount(count, state)}`)
    .join(", ");
}

export default async function AnalysisResultsPage({
  searchParams,
}: AnalysisResultsPageProps = {}) {
  const [results, jobList, collectionList] = await Promise.all([
    listAnalysisResults({
      additionalRunsRoots: getAdditionalAnalysisResultRoots(),
      runsRoot: getLatentMapRunsRoot(),
    }),
    listAnalysisJobs(),
    listCollections(),
  ]);
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const jobs = jobList.jobs;
  const collections = collectionList.collections;
  const submissionNotice = getSubmissionNotice({
    jobs,
    searchParams: resolvedSearchParams,
  });
  const recipeNames = summarizeRecipes(results);
  const totalIndexedImages = results.reduce(
    (total, result) => total + result.itemCount,
    0,
  );
  const stateSummary =
    jobs.length > 0
      ? summarizeJobStates(jobs)
      : jobList.unavailable
        ? "Job API unavailable"
        : summarizeStates(results);

  return (
    <AppSpaceShell
      activeSpace="analysis"
      className="bg-neutral-950 text-neutral-100"
    >
      <main className="min-h-screen px-6 py-8">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="flex flex-col gap-2">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-neutral-500">
              Analysis Studio
            </p>
            <h1 className="text-3xl font-semibold tracking-normal">
              Analysis Results
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-neutral-400">
              Durable latent-map runs available to open in the Latent Space
              Explorer.
            </p>
          </header>

          {submissionNotice ? (
            <section
              aria-label="Analysis job feedback"
              className={`rounded-md border p-4 ${
                submissionNotice.tone === "error"
                  ? "border-red-900 bg-red-950/25 text-red-100"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-100"
              }`}
            >
              <h2 className="text-sm font-medium">{submissionNotice.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                {submissionNotice.body}
              </p>
            </section>
          ) : null}

          <section
            aria-label="Start Analysis Job"
            className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4"
          >
            <h2 className="text-base font-medium text-neutral-100">
              Start Analysis Job
            </h2>
            <AnalysisJobForm
              collectionApiUnavailable={collectionList.unavailable}
              collections={collections}
            />
          </section>

          <section
            aria-label="Analysis Studio status"
            className="grid gap-3 md:grid-cols-3"
          >
            <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-200">
                Analysis Scope
              </h2>
              <p className="mt-2 text-2xl font-semibold">
                {formatCount(results.length, "result")}
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {formatCount(totalIndexedImages, "image")} indexed
              </p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-200">
                Recipe Choices
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                {recipeNames.length > 0 ? recipeNames.join(", ") : "No recipes"}
              </p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4">
              <h2 className="text-sm font-medium text-neutral-200">
                Job Status
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                {stateSummary || "No jobs found"}
              </p>
            </div>
          </section>

          {jobs.length > 0 ? (
            <section
              aria-label="Submitted Jobs"
              className="overflow-hidden rounded-md border border-neutral-800"
            >
              <header className="border-b border-neutral-800 bg-neutral-900 px-4 py-3">
                <h2 className="text-sm font-medium text-neutral-100">
                  Submitted Jobs
                </h2>
              </header>
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-900 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Recipes</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Results</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                  {jobs.map((job) => (
                    <tr key={job.analysis_job_id}>
                      <td className="px-4 py-4 font-mono text-xs text-neutral-400">
                        {job.analysis_job_id}
                      </td>
                      <td className="px-4 py-4 text-neutral-300">
                        {job.recipe_ids.join(", ") || "No recipes"}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {job.viewer_hrefs.length > 0 ? (
                          <Link
                            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                            href={job.viewer_hrefs[0]}
                          >
                            Open Explorer
                          </Link>
                        ) : job.status === "failed" ? (
                          <FailedJobSummary job={job} />
                        ) : (
                          <span className="text-sm text-neutral-500">
                            No completed result
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {results.length === 0 ? (
            <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-6 text-sm text-neutral-400">
              No Analysis Results found yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-neutral-800">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-900 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Recipe</th>
                    <th className="px-4 py-3 font-medium">Images</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Run</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                  {results.map((result) => (
                    <tr key={result.analysisResultId}>
                      <td className="px-4 py-4 font-medium text-neutral-100">
                        {result.sourceFolderName || result.runId}
                      </td>
                      <td className="px-4 py-4 text-neutral-300">
                        <div className="grid gap-1">
                          <span>
                            {result.recipeNames.length > 0
                              ? result.recipeNames.join(", ")
                              : "No recipes"}
                          </span>
                          {result.atlasTileSizes.length > 0 ? (
                            <span className="text-xs text-neutral-500">
                              Atlas: {formatAtlasTileSizes(result.atlasTileSizes)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-neutral-300">
                        {`${result.itemCount} images`}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                          {result.state}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-neutral-500">
                        {result.runId}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {result.canOpenExplorer ? (
                            <Link
                              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                              href={result.explorerHref}
                            >
                              Open Explorer
                            </Link>
                          ) : (
                            <span className="text-sm text-neutral-500">
                              Unavailable
                            </span>
                          )}
                          <form
                            action={`/api/analysis-results/${encodeURIComponent(
                              result.analysisResultId,
                            )}`}
                            method="post"
                          >
                            <button
                              className="rounded-md border border-red-950 px-3 py-2 text-sm font-medium text-red-300 transition hover:border-red-800 hover:bg-red-950/30"
                              type="submit"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppSpaceShell>
  );
}

function summarizeJobStates(jobs: AnalysisJobListItem[]) {
  const counts = new Map<string, number>();
  jobs.forEach((job) => {
    counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort(([leftState], [rightState]) => leftState.localeCompare(rightState))
    .map(([state, count]) => formatStatusCount(count, state))
    .join(", ");
}

function formatAtlasTileSizes(tileSizes: number[]) {
  return `${tileSizes.join(", ")}px`;
}

function FailedJobSummary({ job }: { job: AnalysisJobListItem }) {
  const failure = getJobFailure(job);

  return (
    <div className="grid max-w-xl gap-1 text-sm">
      <span className="font-medium text-red-200">
        Failed{failure?.stageName ? ` at ${failure.stageName}` : ""}
      </span>
      {failure?.errorSummary ? (
        <span className="text-neutral-400">{failure.errorSummary}</span>
      ) : (
        <span className="text-neutral-500">No completed result</span>
      )}
    </div>
  );
}

function getSubmissionNotice({
  jobs,
  searchParams,
}: {
  jobs: AnalysisJobListItem[];
  searchParams: Record<string, string | string[] | undefined>;
}): { body: string; title: string; tone: "error" | "neutral" } | null {
  const jobId = searchParamValue(searchParams.analysisJobId);
  const status = searchParamValue(searchParams.analysisJobStatus);
  const job = jobId ? jobs.find((candidate) => candidate.analysis_job_id === jobId) : null;

  if (!jobId && !status) {
    return null;
  }

  if (status === "failed" || job?.status === "failed") {
    const failure = job ? getJobFailure(job) : null;
    return {
      body: [
        jobId,
        failure?.stageName ? `failed at ${failure.stageName}` : "failed",
        failure?.errorSummary ?? "",
      ]
        .filter(Boolean)
        .join(": "),
      title: "Analysis job failed",
      tone: "error",
    };
  }

  if (status === "ready" || job?.status === "ready") {
    return {
      body: jobId ? `${jobId} completed and is ready to open.` : "Analysis completed.",
      title: "Analysis job ready",
      tone: "neutral",
    };
  }

  return {
    body: jobId ? `${jobId} status: ${status ?? "submitted"}.` : "Analysis job submitted.",
    title: "Analysis job submitted",
    tone: "neutral",
  };
}

function getJobFailure(
  job: AnalysisJobListItem,
): { errorSummary?: string; stageName?: string } | null {
  const failedStage = job.stages?.find(
    (stage) => stage.status === "failed" || Boolean(stage.error),
  );

  if (!failedStage) {
    return null;
  }

  return {
    errorSummary: summarizeJobError(failedStage.error),
    stageName: failedStage.stage_name,
  };
}

function searchParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function summarizeJobError(error: string | undefined): string | undefined {
  if (!error) {
    return undefined;
  }

  const normalized = error.replace(/\s+/g, " ").trim();
  if (
    normalized.includes("gated repo") ||
    normalized.includes("Cannot access gated repo") ||
    normalized.includes("Access to model facebook/dinov3")
  ) {
    return (
      "Hugging Face access failed: DINOv3 is gated for this process. " +
      "Log in to Hugging Face or restart Anacronia after logging in."
    );
  }

  if (normalized.length <= 260) {
    return normalized;
  }

  return `${normalized.slice(0, 257)}...`;
}

function formatStatusCount(count: number, status: string) {
  return `${count} ${status}`;
}
