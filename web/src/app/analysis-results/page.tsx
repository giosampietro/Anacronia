import Link from "next/link";

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
  status: string;
  viewer_hrefs: string[];
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

export default async function AnalysisResultsPage() {
  const [results, jobList] = await Promise.all([
    listAnalysisResults({
      additionalRunsRoots: getAdditionalAnalysisResultRoots(),
      runsRoot: getLatentMapRunsRoot(),
    }),
    listAnalysisJobs(),
  ]);
  const jobs = jobList.jobs;
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

          <section
            aria-label="Start Analysis Job"
            className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4"
          >
            <h2 className="text-base font-medium text-neutral-100">
              Start Analysis Job
            </h2>
            <form
              action="/api/analysis-jobs"
              className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
              method="post"
            >
              <label className="grid gap-2 text-sm text-neutral-300">
                Collection slugs
                <input
                  className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none transition focus:border-neutral-500"
                  name="collection_slugs"
                  placeholder="j-shoot, mood-board"
                  type="text"
                />
              </label>
              <fieldset className="flex flex-wrap items-end gap-3">
                <legend className="sr-only">Recipe IDs</legend>
                {[
                  ["dinov3_vits_256", "256"],
                  ["dinov3_vits_384", "384"],
                  ["dinov3_vits_512", "512"],
                ].map(([recipeId, label]) => (
                  <label
                    className="flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200"
                    key={recipeId}
                  >
                    <input
                      defaultChecked={recipeId === "dinov3_vits_384"}
                      name="recipe_ids"
                      type="checkbox"
                      value={recipeId}
                    />
                    {label}
                  </label>
                ))}
                <button
                  className="h-10 rounded-md border border-neutral-600 px-4 text-sm font-medium text-neutral-100 transition hover:border-neutral-400 hover:bg-neutral-800"
                  type="submit"
                >
                  Run Analysis
                </button>
              </fieldset>
            </form>
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
                        {result.recipeNames.length > 0
                          ? result.recipeNames.join(", ")
                          : "No recipes"}
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
    .map(([state, count]) => formatCount(count, state))
    .join(", ");
}
