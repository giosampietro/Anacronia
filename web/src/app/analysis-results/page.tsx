import Link from "next/link";

import { AnalysisJobAutoRefresh } from "@/components/analysis-job-auto-refresh";
import { AppSpaceShell } from "@/components/app-space-shell";
import { shouldAutoRefreshAnalysisJobs } from "@/lib/analysis-job-refresh";
import {
  loadAnalysisStudioReadModel,
  type AnalysisStudioJobSummary,
  type AnalysisStudioReadModel,
  type AnalysisStudioResultSummary,
} from "@/lib/analysis-studio-read-model";
import type { AnalysisStudioSearchParams } from "@/lib/analysis-studio-url";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis Results | Anacronia",
};

const ANALYSIS_JOB_STAGE_ORDER = [
  "scope_snapshot",
  "embedding_planning",
  "embedding_computation",
  "faiss",
  "umap",
  "hdbscan",
  "atlas_generation",
  "viewer_metadata",
  "result_registration",
];

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeRecipes(results: AnalysisStudioResultSummary[]) {
  const recipeNames = new Set<string>();

  results.forEach((result) => {
    result.recipeLabels.forEach((recipeName) => recipeNames.add(recipeName));
  });

  return [...recipeNames].sort((left, right) => left.localeCompare(right));
}

function summarizeStates(results: AnalysisStudioResultSummary[]) {
  const counts = new Map<string, number>();

  results.forEach((result) => {
    counts.set(result.state, (counts.get(result.state) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(([leftState], [rightState]) => leftState.localeCompare(rightState))
    .map(([state, count]) => `${formatCount(count, state)}`)
    .join(", ");
}

function isActiveAnalysisJob(job: AnalysisStudioJobSummary) {
  return shouldAutoRefreshAnalysisJobs([job.status]);
}

function formatAnalysisJobStatusCount(count: number, status: string) {
  const labels: Record<string, [string, string]> = {
    failed: ["failed", "failed"],
    partial_failed: ["partial failure", "partial failures"],
    queued: ["queued", "queued"],
    ready: ["ready", "ready"],
    running: ["running", "running"],
  };
  const [singular, plural] = labels[status] ?? [status, status];
  return formatCount(count, singular, plural);
}

function formatStageName(stageName: string | undefined) {
  return stageName !== undefined && stageName.length > 0
    ? stageName.replaceAll("_", " ")
    : "analysis job";
}

function getLatestStage(job: AnalysisStudioJobSummary) {
  const stages = job.stages ?? [];
  return stages.length > 0 ? stages[stages.length - 1] : undefined;
}

function getActiveStageName(job: AnalysisStudioJobSummary) {
  const explicitRunningStage = (job.stages ?? []).find(
    (stage) => stage.status === "running",
  );
  if (explicitRunningStage?.stageName !== undefined) {
    return formatStageName(explicitRunningStage.stageName);
  }

  const latestStageName = getLatestStage(job)?.stageName;
  if (latestStageName === undefined) {
    return job.status === "queued" ? "queued" : "analysis job";
  }

  const latestStageIndex = ANALYSIS_JOB_STAGE_ORDER.indexOf(latestStageName);
  if (
    job.status === "running" &&
    latestStageIndex >= 0 &&
    latestStageIndex < ANALYSIS_JOB_STAGE_ORDER.length - 1
  ) {
    return formatStageName(ANALYSIS_JOB_STAGE_ORDER[latestStageIndex + 1]);
  }

  return formatStageName(latestStageName);
}

function getFailedStageName(job: AnalysisStudioJobSummary) {
  const failedStage = [...(job.stages ?? [])]
    .reverse()
    .find((stage) => stage.status === "failed");
  return formatStageName(failedStage?.stageName ?? getLatestStage(job)?.stageName);
}

function getJobResultStatus(job: AnalysisStudioJobSummary) {
  if (isActiveAnalysisJob(job)) {
    return `Running: ${getActiveStageName(job)}`;
  }
  if (job.status === "failed") {
    return `Failed at ${getFailedStageName(job)}`;
  }
  if (job.status === "partial_failed") {
    return `Partially failed at ${getFailedStageName(job)}`;
  }
  return "No completed result";
}

export default async function AnalysisResultsPage({
  searchParams,
}: {
  searchParams?: Promise<AnalysisStudioSearchParams> | AnalysisStudioSearchParams;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const model = await loadAnalysisStudioReadModel({
    searchParams: resolvedSearchParams,
  });
  const results = model.results;
  const jobs = model.jobs;
  const activeJobs = jobs.filter(isActiveAnalysisJob);
  const activeJob = model.activeJob ?? activeJobs[0];
  const recipeNames = summarizeRecipes(results);
  const stateSummary =
    jobs.length > 0
      ? summarizeJobStates(jobs)
      : model.jobsUnavailable
        ? "Job API unavailable"
        : summarizeStates(results);

  return (
    <AppSpaceShell
      activeSpace="analysis"
      className="bg-neutral-950 text-neutral-100"
    >
      <main className="min-h-screen px-6 py-8">
        <AnalysisJobAutoRefresh enabled={activeJobs.length > 0} />
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
              {model.collections.length > 0 ? (
                <label className="grid gap-2 text-sm text-neutral-300">
                  Collection
                  <select
                    className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none transition focus:border-neutral-500"
                    name="collection_slugs"
                  >
                    {model.collections.map((collection) => (
                      <option key={collection.slug} value={collection.slug}>
                        {collection.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-2 text-sm text-neutral-300">
                  Collection slugs
                  <input
                    className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none transition focus:border-neutral-500"
                    name="collection_slugs"
                    placeholder={
                      model.collectionsUnavailable
                        ? "Collection API unavailable"
                        : "j-shoot, mood-board"
                    }
                    type="text"
                  />
                </label>
              )}
              <fieldset className="flex flex-wrap items-end gap-3">
                <legend className="sr-only">Recipe IDs</legend>
                {model.recipes.map((recipe) => (
                  <label
                    className="flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200"
                    key={recipe.recipeId}
                  >
                    <input
                      defaultChecked={recipe.isDefault}
                      name="recipe_ids"
                      type="checkbox"
                      value={recipe.recipeId}
                    />
                    {recipe.label}
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

          {activeJob ? (
            <section
              aria-label="Running Analysis Job"
              className="rounded-md border border-sky-800/70 bg-sky-950/30 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-medium text-sky-100">
                    Analysis running
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-sky-200/80">
                    {formatAnalysisJobStatusCount(activeJobs.length, "running")}
                    {" · "}
                    {`Current stage: ${getActiveStageName(activeJob)}`}
                    {" · "}
                    {activeJob.analysisJobId}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-200/70">
                  Refreshing automatically
                </p>
              </div>
            </section>
          ) : null}

          {renderSelectedStudioState(model)}

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
                {formatCount(model.summary.indexedImageCount, "image")} indexed
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
                    <tr key={job.analysisJobId}>
                      <td className="px-4 py-4 font-mono text-xs text-neutral-400">
                        {job.analysisJobId}
                      </td>
                      <td className="px-4 py-4 text-neutral-300">
                        {job.recipeLabels.join(", ") || "No recipes"}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {job.viewerHrefs.length > 0 ? (
                          <Link
                            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
                            href={job.viewerHrefs[0]}
                          >
                            Open Explorer
                          </Link>
                        ) : (
                          <span className="text-sm text-neutral-500">
                            {getJobResultStatus(job)}
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
                        {result.scopeLabel || result.runId}
                      </td>
                      <td className="px-4 py-4 text-neutral-300">
                        {result.recipeLabels.length > 0
                          ? result.recipeLabels.join(", ")
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

function renderSelectedStudioState(model: AnalysisStudioReadModel) {
  const { selectedState } = model;

  if (selectedState.state === "selected-result" && model.selectedResult) {
    const result = model.selectedResult;
    return (
      <section
        aria-label="Selected Analysis Result"
        className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-medium text-neutral-100">
              Selected Analysis Result
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-300">
              {result.scopeLabel} · {result.recipeLabels.join(", ") || "No recipes"} ·{" "}
              {formatCount(result.itemCount, "image")}
            </p>
            <p className="mt-1 font-mono text-xs text-neutral-500">
              {result.analysisResultId}
            </p>
          </div>
          {result.canOpenExplorer ? (
            <Link
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-900"
              href={result.explorerHref}
            >
              Open Explorer
            </Link>
          ) : (
            <span className="text-sm text-neutral-500">Explorer unavailable</span>
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Artifact health</dt>
            <dd className="mt-1 text-neutral-300">
              {result.artifactHealth.missingRequiredArtifactKeys.length === 0
                ? "Required artifacts ready"
                : `${formatCount(
                    result.artifactHealth.missingRequiredArtifactKeys.length,
                    "required artifact",
                  )} missing`}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Storage</dt>
            <dd className="mt-1 text-neutral-300">
              {formatBytes(result.storageTotals.totalBytes)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Staleness</dt>
            <dd className="mt-1 text-neutral-300">{result.staleness.state}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (selectedState.state === "missing-result") {
    return (
      <section
        aria-label="Missing Analysis Result"
        className="rounded-md border border-amber-900/70 bg-amber-950/20 p-4"
      >
        <h2 className="text-sm font-medium text-amber-100">
          Analysis Result not found
        </h2>
        <p className="mt-1 font-mono text-xs text-amber-100/70">
          {selectedState.analysisResultId}
        </p>
      </section>
    );
  }

  if (selectedState.state === "selected-job" && model.selectedJob) {
    const job = model.selectedJob;
    return (
      <section
        aria-label="Selected Analysis Job"
        className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4"
      >
        <h2 className="text-sm font-medium text-neutral-100">
          Selected Analysis Job
        </h2>
        <p className="mt-1 text-sm leading-6 text-neutral-300">
          {job.recipeLabels.join(", ") || "No recipes"} · {job.status}
        </p>
        <p className="mt-1 font-mono text-xs text-neutral-500">
          {job.analysisJobId}
        </p>
      </section>
    );
  }

  if (selectedState.state === "missing-job") {
    return (
      <section
        aria-label="Missing Analysis Job"
        className="rounded-md border border-amber-900/70 bg-amber-950/20 p-4"
      >
        <h2 className="text-sm font-medium text-amber-100">
          Analysis Job not found
        </h2>
        <p className="mt-1 font-mono text-xs text-amber-100/70">
          {selectedState.analysisJobId}
        </p>
      </section>
    );
  }

  return null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }
  return `${(kib / 1024).toFixed(1)} MB`;
}

function summarizeJobStates(jobs: AnalysisStudioJobSummary[]) {
  const counts = new Map<string, number>();
  jobs.forEach((job) => {
    counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort(([leftState], [rightState]) => leftState.localeCompare(rightState))
    .map(([state, count]) => formatAnalysisJobStatusCount(count, state))
    .join(", ");
}
