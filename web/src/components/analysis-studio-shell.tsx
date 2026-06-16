"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  Boxes,
  Clock3,
  Database,
  FileSearch,
  FlaskConical,
  FolderClosed,
  FolderOpen,
  ListFilter,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";

import { AnalysisJobAutoRefresh } from "@/components/analysis-job-auto-refresh";
import { AppSpaceShell } from "@/components/app-space-shell";
import { APP_TOP_BAR_CONTROLS_ID } from "@/components/app-top-bar-portal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  WorkspaceBrandHeader,
  WorkspaceProjectAttributionFooter,
  WorkspaceRuntimeStatusFooter,
  WorkspaceSidebarPreviewTrigger,
} from "@/components/workspace-sidebar-chrome";
import type { AppVersionStamp } from "@/lib/app-version";
import { shouldAutoRefreshAnalysisJobs } from "@/lib/analysis-job-refresh";
import type {
  AnalysisStudioAnalysisSummary,
  AnalysisStudioJobSummary,
  AnalysisStudioReadModel,
  AnalysisStudioResultSummary,
  AnalysisStudioJobStageSummary,
} from "@/lib/analysis-studio-read-model";
import { createAnalysisStudioHref } from "@/lib/analysis-studio-read-model";
import type { StatusRow } from "@/lib/status";
import { cn } from "@/lib/utils";

type AnalysisStudioShellProps = {
  appVersionStamp: AppVersionStamp;
  defaultSidebarOpen?: boolean;
  model: AnalysisStudioReadModel;
  rows: StatusRow[];
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

const ANALYSIS_JOB_STAGE_LABELS: Record<string, string> = {
  atlas_generation: "Explorer atlas generation",
  embedding_computation: "Embedding computation",
  embedding_planning: "Embedding planning",
  faiss: "FAISS",
  hdbscan: "HDBSCAN",
  job_runtime: "Job runtime",
  result_registration: "Result creation",
  scope_snapshot: "Scope snapshot",
  umap: "UMAP",
  viewer_metadata: "Viewer metadata",
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function formatOptionalBytes(bytes: number | null) {
  return bytes === null ? "Unavailable" : formatBytes(bytes);
}

function formatSharedEmbeddings(
  variant: AnalysisStudioAnalysisSummary["variants"][number],
) {
  const parts = [
    variant.sharedEmbeddings.reusableCount === null
      ? null
      : `${variant.sharedEmbeddings.reusableCount} reused`,
    variant.sharedEmbeddings.missingCount === null
      ? null
      : `${variant.sharedEmbeddings.missingCount} new`,
  ].filter((value): value is string => value !== null);
  return parts.length > 0 ? parts.join(" · ") : "Unavailable";
}

function formatStageName(stageName: string | undefined) {
  if (stageName === undefined || stageName.length === 0) {
    return "analysis job";
  }
  return ANALYSIS_JOB_STAGE_LABELS[stageName] ?? stageName.replaceAll("_", " ");
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
  return formatStageName(
    getFailedStage(job)?.stageName ?? getLatestStage(job)?.stageName,
  );
}

function getFailedStage(job: AnalysisStudioJobSummary) {
  return [...(job.stages ?? [])]
    .reverse()
    .find((stage) => stage.status === "failed");
}

function getRecipeLabelForStage(
  job: AnalysisStudioJobSummary,
  recipeId: string | undefined,
) {
  if (recipeId === undefined || recipeId.length === 0) {
    return null;
  }
  const recipeIndex = job.recipeIds.indexOf(recipeId);
  if (recipeIndex >= 0) {
    return job.recipeLabels[recipeIndex] ?? recipeId;
  }
  return recipeId;
}

function formatJobActivityStage(job: AnalysisStudioJobSummary) {
  if (job.status === "failed" || job.status === "partial_failed") {
    return `Failed at ${getFailedStageName(job)}`;
  }
  if (job.status === "running" || job.status === "queued") {
    return `Current stage: ${getActiveStageName(job)}`;
  }
  return getActiveStageName(job);
}

function formatDuration(elapsedMs: number | undefined) {
  if (elapsedMs === undefined || elapsedMs <= 0) {
    return null;
  }
  if (elapsedMs < 1000) {
    return `${elapsedMs} ms`;
  }
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

function formatTimestamp(timestamp: string | null) {
  if (timestamp === null || timestamp.length === 0) {
    return "Unknown";
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed
    .toISOString()
    .replace(".000Z", " UTC")
    .replace("T", " ");
}

function formatStageOutputCounts(
  outputCounts: Record<string, number> | undefined,
) {
  if (outputCounts === undefined || Object.keys(outputCounts).length === 0) {
    return null;
  }
  return Object.entries(outputCounts)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${value} ${key.replaceAll("_", " ")}`)
    .join(" · ");
}

function formatScopeCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return "No scope breakdown recorded";
  }
  return entries
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${value} ${key.replaceAll("_", " ")}`)
    .join(" · ");
}

function createStageMetaSummary(stage: AnalysisStudioJobStageSummary) {
  const parts = [
    formatDuration(stage.elapsedMs),
    stage.outputArtifactCount !== undefined && stage.outputArtifactCount > 0
      ? formatCount(stage.outputArtifactCount, "artifact")
      : null,
    formatStageOutputCounts(stage.outputCounts),
  ].filter((value): value is string => value !== null);
  return parts.length > 0 ? parts.join(" · ") : "No output details recorded";
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

function createResultSecondaryLabel(result: AnalysisStudioResultSummary) {
  const recipeLabel = result.recipeLabels[0] ?? "No recipes";
  return `${recipeLabel} · ${formatCount(result.itemCount, "image")} · ${result.state}`;
}

function createResultSidebarMetaLabel(result: AnalysisStudioResultSummary) {
  const recipeLabel = result.recipeLabels[0] ?? "No recipes";
  return `${recipeLabel} · ${result.state}`;
}

function compactAnalysisJobId(analysisJobId: string) {
  return analysisJobId.replace(/^analysis-job-/, "");
}

function createJobSecondaryLabel(job: AnalysisStudioJobSummary) {
  const recipeLabel = job.recipeLabels[0] ?? "No recipes";

  if (shouldAutoRefreshAnalysisJobs([job.status])) {
    return `${compactAnalysisJobId(job.analysisJobId)} · ${job.status} · ${getActiveStageName(job)}`;
  }
  if (job.status === "failed" || job.status === "partial_failed") {
    return `${compactAnalysisJobId(job.analysisJobId)} · ${job.status} · ${getFailedStageName(job)}`;
  }

  return `${compactAnalysisJobId(job.analysisJobId)} · ${recipeLabel}`;
}

function sourceCollectionSummary(analysis: AnalysisStudioAnalysisSummary) {
  return analysis.sourceCollections
    .map((source) => source.label)
    .filter(Boolean)
    .join(", ");
}

function isAnalysisRunning(analysis: AnalysisStudioAnalysisSummary) {
  return analysis.status === "running" || analysis.status === "queued";
}

function filterAnalyses(
  analyses: AnalysisStudioAnalysisSummary[],
  filterText: string,
) {
  const query = filterText.trim().toLowerCase();
  if (query.length === 0) {
    return analyses;
  }
  return analyses.filter((analysis) => {
    const searchable = [
      analysis.title,
      analysis.status,
      ...analysis.sourceCollections.map((source) => source.label),
      ...analysis.sourceCollections.map((source) => source.slug),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}

function createBadgeVariant(
  state: string,
): "secondary" | "destructive" | "outline" {
  if (state === "failed" || state === "deleted") {
    return "destructive";
  }
  if (state === "ready" || state === "current") {
    return "secondary";
  }
  return "outline";
}

function AnalysisStudioSidebarContent({
  appVersionStamp,
  model,
  rows,
}: {
  appVersionStamp: AppVersionStamp;
  model: AnalysisStudioReadModel;
  rows: StatusRow[];
}) {
  const [analysisFilterText, setAnalysisFilterText] = useState("");
  const activeAnalysisId =
    model.selectedState.state === "selected-analysis"
      ? model.selectedState.analysisId
      : null;
  const [openedAnalysisId, setOpenedAnalysisId] = useState<string | null>(
    activeAnalysisId,
  );
  const filteredAnalyses = filterAnalyses(model.analyses, analysisFilterText);

  return (
    <>
      <SidebarHeader>
        <WorkspaceBrandHeader label="Analysis Studio" />
        <SidebarMenu className="gap-3">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={model.selectedState.state === "new-analysis"}
              render={<Link href={createAnalysisStudioHref({ state: "new-analysis" })} />}
              tooltip="New Analysis"
            >
              <Plus />
              <span className="group-data-[collapsible=icon]:hidden">
                New Analysis
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Analyses</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="relative group-data-[collapsible=icon]:hidden">
              <ListFilter className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              <SidebarInput
                aria-label="Filter Analyses"
                className="pl-8 pr-8"
                onChange={(event) => setAnalysisFilterText(event.currentTarget.value)}
                placeholder="Filter by title or collection"
                value={analysisFilterText}
              />
              {analysisFilterText !== "" ? (
                <button
                  aria-label="Clear Analysis filter"
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
                  onClick={() => setAnalysisFilterText("")}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <SidebarMenu className="mt-3 gap-0.5">
              {filteredAnalyses.length === 0 ? (
                <Empty className="border group-data-[collapsible=icon]:hidden">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>
                      {model.analyses.length === 0
                        ? "New analyses will appear here."
                        : "No matching Analyses"}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                filteredAnalyses.map((analysis) => {
                  const isActive = activeAnalysisId === analysis.analysisId;
                  const isOpen = openedAnalysisId === analysis.analysisId || isActive;
                  const sourceSummary =
                    sourceCollectionSummary(analysis) || "No source Collections";
                  return (
                    <SidebarMenuItem key={analysis.analysisId}>
                      <SidebarMenuButton
                        aria-expanded={isOpen}
                        className={cn(
                          "h-8 gap-2 rounded-md px-2 text-[13px] font-normal group-data-[collapsible=icon]:justify-center",
                          isOpen && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                        isActive={isActive}
                        onClick={() => setOpenedAnalysisId(analysis.analysisId)}
                        render={
                          <Link
                            href={createAnalysisStudioHref({
                              analysisId: analysis.analysisId,
                              state: "selected-analysis",
                            })}
                          />
                        }
                        tooltip={analysis.title}
                      >
                        {isOpen ? (
                          <FolderOpen className="text-sidebar-foreground/75" />
                        ) : (
                          <FolderClosed className="text-sidebar-foreground/65" />
                        )}
                        <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                          {analysis.title}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] font-normal tabular-nums text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                          {isAnalysisRunning(analysis) ? (
                            <Spinner
                              aria-label={`${analysis.title} analysis in progress`}
                              className="size-3"
                            />
                          ) : null}
                          <span
                            aria-label={`${analysis.variants.length} variants`}
                            title={`${analysis.variants.length} variants`}
                          >
                            {analysis.variants.length}
                          </span>
                        </span>
                      </SidebarMenuButton>
                      {isOpen ? (
                        <p className="ml-8 mr-2 pb-1 pr-2 text-xs leading-5 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                          {sourceSummary}
                        </p>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <WorkspaceRuntimeStatusFooter appVersionStamp={appVersionStamp} rows={rows} />
        <WorkspaceProjectAttributionFooter />
      </SidebarFooter>
    </>
  );
}

function OverviewWorkspace({ model }: { model: AnalysisStudioReadModel }) {
  const attachedAnalysisJobIds = new Set(
    model.analyses.flatMap((analysis) => analysis.analysisJobIds),
  );
  const attachedJobs = model.jobs.filter((job) =>
    attachedAnalysisJobIds.has(job.analysisJobId),
  );
  const stateSummary =
    attachedJobs.length > 0
      ? summarizeJobStates(attachedJobs)
      : model.jobsUnavailable
        ? "Job API unavailable"
        : "No jobs found";
  const recipeSummary = [
    ...new Set(
      model.analyses.flatMap((analysis) =>
        analysis.variants.flatMap((variant) => variant.recipeLabels),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Analyses run</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-semibold">{model.summary.analysisCount}</p>
            <p className="text-sm text-muted-foreground">
              {formatCount(model.summary.sourceImageCount, "image")}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recipes used</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
            {recipeSummary.length > 0 ? (
              recipeSummary.map((recipeLabel) => (
                <p key={recipeLabel}>{recipeLabel}</p>
              ))
            ) : (
              <p>No recipes yet</p>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Analysis jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{stateSummary}</p>
          </CardContent>
        </Card>
      </div>

      {model.analyses.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Boxes />
            </EmptyMedia>
            <EmptyTitle>No analyses yet</EmptyTitle>
            <EmptyDescription>
              Start a new Analysis to create the first Variant.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={createAnalysisStudioHref({ state: "new-analysis" })}
            >
              Start New Analysis
            </Link>
          </EmptyContent>
        </Empty>
      ) : null}
    </div>
  );
}

function NewAnalysisWorkspace({ model }: { model: AnalysisStudioReadModel }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>New Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {model.analysisError ? (
            <Alert className="mb-4" variant="destructive">
              <AlertTitle>Analysis was not created</AlertTitle>
              <AlertDescription>{model.analysisError}</AlertDescription>
            </Alert>
          ) : null}
          <form
            action="/api/analyses"
            className="grid gap-4"
            method="post"
          >
            <label className="grid max-w-md gap-2 text-sm text-foreground">
              <span>Name the Analysis</span>
              <input
                autoComplete="off"
                className="h-10 rounded-2xl border border-border bg-input/50 px-3 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                name="title"
                required
                type="text"
              />
            </label>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium text-foreground">
                Choose Collections
              </legend>
              <div className="grid gap-2 md:grid-cols-2">
                {model.collections.map((collection) => (
                  <label
                    className="flex min-h-10 items-center gap-2 rounded-2xl border border-border px-3 text-sm text-foreground"
                    key={collection.slug}
                  >
                    <input
                      name="collection_slugs"
                      type="checkbox"
                      value={collection.slug}
                    />
                    {collection.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium text-foreground">
                Recipes
              </legend>
              <div className="flex flex-wrap gap-3">
                {model.recipes.map((recipe) => (
                  <label
                    className="flex h-10 items-center gap-2 rounded-2xl border border-border px-3 text-sm text-foreground"
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
              </div>
            </fieldset>

            <div className="flex items-center gap-3">
              <button
                className={buttonVariants({ variant: "outline", size: "lg" })}
                type="submit"
              >
                <Play data-icon="inline-start" />
                Create Analysis
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SelectedResultWorkspace({
  result,
}: {
  result: AnalysisStudioResultSummary;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Analysis Result
        </p>
        <h1 className="text-3xl font-semibold tracking-normal">{result.scopeLabel}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {result.recipeLabels.join(", ") || "No recipes"} ·{" "}
          {formatCount(result.itemCount, "image")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Selected Analysis Result</CardTitle>
          <CardDescription className="font-mono text-xs">
            {result.analysisResultId}
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            {result.canOpenExplorer ? (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={result.explorerHref}
              >
                Open Explorer
              </Link>
            ) : null}
            <form
              action={`/api/analysis-results/${encodeURIComponent(
                result.analysisResultId,
              )}`}
              method="post"
            >
              <button
                className={buttonVariants({ size: "sm", variant: "destructive" })}
                type="submit"
              >
                Delete
              </button>
            </form>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Explorer readiness</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge
                variant={
                  result.artifactHealth.missingRequiredArtifactKeys.length === 0
                    ? "secondary"
                    : "destructive"
                }
              >
                {result.artifactHealth.missingRequiredArtifactKeys.length === 0
                  ? "Required artifacts ready"
                  : `${result.artifactHealth.missingRequiredArtifactKeys.length} missing`}
              </Badge>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Storage</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {formatBytes(result.storageTotals.totalBytes)}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Staleness</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={createBadgeVariant(result.staleness.state)}>
                {result.staleness.state}
              </Badge>
            </CardContent>
          </Card>
        </CardContent>
        <CardFooter className="border-t text-sm text-muted-foreground">
          Durable artifacts and render-cache availability are already tracked in
          the Result manifest. The deeper Result dashboard lands next.
        </CardFooter>
      </Card>
    </div>
  );
}

function SelectedJobWorkspace({ job }: { job: AnalysisStudioJobSummary }) {
  const failedStage = getFailedStage(job);
  const failedRecipeLabel = getRecipeLabelForStage(job, failedStage?.recipeId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Analysis Job
        </p>
        <h1 className="text-3xl font-semibold tracking-normal">Selected Analysis Job</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {job.recipeLabels.join(", ") || "No recipes"} · {job.status}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{job.analysisJobId}</CardTitle>
          <CardDescription>
            Durable Job state tracks execution history separately from durable Analysis
            Results.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Badge variant={createBadgeVariant(job.status)}>{job.status}</Badge>
                {job.status === "running" || job.status === "queued" ? (
                  <p className="text-sm text-muted-foreground">
                    Current stage: {getActiveStageName(job)}
                  </p>
                ) : null}
                {job.status === "failed" || job.status === "partial_failed" ? (
                  <p className="text-sm text-muted-foreground">
                    Failed at {getFailedStageName(job)}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Analysis Scope</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <p className="text-base font-medium">
                  {job.scopeSnapshot?.itemCount !== null &&
                  job.scopeSnapshot?.itemCount !== undefined
                    ? `${job.scopeSnapshot.itemCount} items in scope`
                    : "Scope size unavailable"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {job.scopeSnapshot
                    ? formatScopeCounts(job.scopeSnapshot.counts)
                    : "Scope snapshot missing"}
                </p>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Recipes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {job.recipeLabels.map((recipeLabel) => (
                  <p className="text-sm text-muted-foreground" key={recipeLabel}>
                    {recipeLabel}
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Created</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {formatTimestamp(job.createdAt)}
              </CardContent>
            </Card>
          </div>

          {failedStage ? (
            <Alert variant="destructive">
              <Clock3 />
              <AlertTitle>Failed recipe</AlertTitle>
              <AlertDescription>
                <span className="font-medium">
                  {failedRecipeLabel ?? "Unknown recipe"}
                </span>
                {" · "}
                {`Failed at ${getFailedStageName(job)}`}
                {failedStage.error ? ` · ${failedStage.error}` : ""}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Stage Timeline</CardTitle>
                <CardDescription>
                  Recorded execution stages from the durable Job manifest.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {job.stages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No stage records available yet.
                  </p>
                ) : (
                  job.stages.map((stage, index) => {
                    const stageRecipeLabel = getRecipeLabelForStage(
                      job,
                      stage.recipeId,
                    );
                    return (
                      <div
                        className="rounded-2xl border border-border bg-muted/20 p-4"
                        key={`${stage.stageName ?? "stage"}-${stage.recipeId ?? "global"}-${stage.startedAt ?? stage.completedAt ?? index}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {formatStageName(stage.stageName)}
                          </p>
                          {stageRecipeLabel ? (
                            <Badge variant="outline">{stageRecipeLabel}</Badge>
                          ) : null}
                          <Badge variant={createBadgeVariant(stage.status ?? "unknown")}>
                            {stage.status ?? "unknown"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {createStageMetaSummary(stage)}
                        </p>
                        {stage.error ? (
                          <p className="mt-2 text-sm text-destructive">{stage.error}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recipe Results</CardTitle>
                <CardDescription>
                  Completed sibling Results are linked by recipe. Open the Result first,
                  then enter the Explorer from there.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {job.producedResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed result yet.</p>
                ) : (
                  job.producedResults.map((result) => (
                    <Link
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "h-auto justify-start px-4 py-3",
                      )}
                      href={result.href}
                      key={result.analysisResultId}
                    >
                      <span className="flex min-w-0 flex-col items-start gap-1">
                        <span className="truncate font-medium">{result.recipeLabel}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {`${result.scopeLabel} · ${formatCount(result.itemCount, "image")} · ${result.state}`}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SelectedAnalysisWorkspace({
  analysis,
  model,
}: {
  analysis: AnalysisStudioAnalysisSummary;
  model: AnalysisStudioReadModel;
}) {
  const analysisJobs = model.jobs.filter((job) =>
    analysis.analysisJobIds.includes(job.analysisJobId),
  );
  const resultById = new Map(
    model.results.map((result) => [result.analysisResultId, result]),
  );
  const sourceSummary =
    sourceCollectionSummary(analysis) || "No source Collections recorded";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Source Collections</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {sourceSummary}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Job activity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            {analysisJobs.length === 0 ? (
              <p>No job activity recorded.</p>
            ) : (
              analysisJobs.map((job) => {
                const failedStage = getFailedStage(job);
                return (
                  <div className="grid gap-1" key={job.analysisJobId}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={createBadgeVariant(job.status)}>
                        {job.status}
                      </Badge>
                      <span className="font-mono text-xs">
                        {compactAnalysisJobId(job.analysisJobId)}
                      </span>
                      <span>{formatJobActivityStage(job)}</span>
                    </div>
                    {failedStage?.error ? (
                      <p className="text-xs text-destructive">
                        {failedStage.error}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {analysis.variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Variants yet.</p>
          ) : (
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Variant</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Recipe</th>
                  <th className="py-2 pr-4 font-medium">Images</th>
                  <th className="py-2 pr-4 font-medium">Shared embeddings</th>
                  <th className="py-2 pr-4 font-medium">Variant storage</th>
                  <th className="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analysis.variants.map((variant, index) => {
                  const result = resultById.get(variant.analysisResultId);
                  const recipeLabel =
                    variant.recipeLabels.join(", ") || "Recipe unavailable";
                  return (
                    <tr key={variant.analysisResultId}>
                      <td className="py-3 pr-4 font-medium">{`Variant ${index + 1}`}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={createBadgeVariant(variant.status)}>
                          {variant.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {recipeLabel}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {variant.itemCount === null
                          ? "Unavailable"
                          : formatCount(variant.itemCount, "image")}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatSharedEmbeddings(variant)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatOptionalBytes(variant.storage.variantBytes)}
                      </td>
                      <td className="py-3 text-right">
                        {result?.canOpenExplorer ? (
                          <Link
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                            href={variant.explorerHref}
                          >
                            Open Explorer
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Unavailable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MissingWorkspace({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function renderWorkspaceState(model: AnalysisStudioReadModel) {
  if (model.selectedState.state === "selected-analysis" && model.selectedAnalysis) {
    return (
      <SelectedAnalysisWorkspace
        analysis={model.selectedAnalysis}
        model={model}
      />
    );
  }

  if (model.selectedState.state === "selected-analysis" && model.analysesUnavailable) {
    return (
      <MissingWorkspace
        description="Analyses could not be loaded from the backend."
        icon={<FlaskConical />}
        title="Analyses unavailable"
      />
    );
  }

  if (model.selectedState.state === "missing-analysis") {
    return (
      <MissingWorkspace
        description={model.selectedState.analysisId}
        icon={<FlaskConical />}
        title="Analysis not found"
      />
    );
  }

  if (model.selectedState.state === "selected-result" && model.selectedResult) {
    return <SelectedResultWorkspace result={model.selectedResult} />;
  }

  if (model.selectedState.state === "selected-result" && model.resultsUnavailable) {
    return (
      <MissingWorkspace
        description="Analysis Results could not be loaded from the backend."
        icon={<FileSearch />}
        title="Analysis Results unavailable"
      />
    );
  }

  if (model.selectedState.state === "missing-result") {
    return (
      <MissingWorkspace
        description={model.selectedState.analysisResultId}
        icon={<FileSearch />}
        title="Analysis Result not found"
      />
    );
  }

  if (model.selectedState.state === "selected-job" && model.selectedJob) {
    return <SelectedJobWorkspace job={model.selectedJob} />;
  }

  if (model.selectedState.state === "selected-job" && model.jobsUnavailable) {
    return (
      <MissingWorkspace
        description="Analysis Jobs could not be loaded from the backend."
        icon={<Clock3 />}
        title="Analysis Jobs unavailable"
      />
    );
  }

  if (model.selectedState.state === "missing-job") {
    return (
      <MissingWorkspace
        description={model.selectedState.analysisJobId}
        icon={<Clock3 />}
        title="Analysis Job not found"
      />
    );
  }

  if (model.selectedState.state === "new-analysis") {
    return <NewAnalysisWorkspace model={model} />;
  }

  return <OverviewWorkspace model={model} />;
}

export function AnalysisStudioShell({
  appVersionStamp,
  defaultSidebarOpen = true,
  model,
  rows,
}: AnalysisStudioShellProps) {
  const sidebarStyle = {
    "--sidebar-width": "21rem",
    "--sidebar-width-mobile": "20rem",
  } as CSSProperties;
  const activeJobs = model.jobs.filter((job) =>
    shouldAutoRefreshAnalysisJobs([job.status]),
  );
  const activeJob = model.activeJob ?? activeJobs[0] ?? null;

  return (
    <AppSpaceShell activeSpace="analysis" contentClassName="min-w-0">
      <SidebarProvider defaultOpen={defaultSidebarOpen} style={sidebarStyle}>
        <Sidebar collapsible="offcanvas" variant="inset">
          <AnalysisStudioSidebarContent
            appVersionStamp={appVersionStamp}
            model={model}
            rows={rows}
          />
        </Sidebar>

        <SidebarInset className="min-w-0 overflow-x-hidden">
          <header className="sticky top-0 z-40 flex min-h-12 shrink-0 items-center gap-1 border-b bg-background px-3 py-3">
            <div aria-label="Workspace" className="flex shrink-0 items-center gap-3">
              <WorkspaceSidebarPreviewTrigger>
                <AnalysisStudioSidebarContent
                  appVersionStamp={appVersionStamp}
                  model={model}
                  rows={rows}
                />
              </WorkspaceSidebarPreviewTrigger>
            </div>
            <div
              className="@container/topbar flex min-w-0 flex-1 items-center"
              id={APP_TOP_BAR_CONTROLS_ID}
            />
          </header>

          <main className="min-h-svh px-6 py-8">
            <AnalysisJobAutoRefresh enabled={activeJobs.length > 0} />
            <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
              {activeJob ? (
                <Alert>
                  <Database />
                  <AlertTitle>Analysis active</AlertTitle>
                  <AlertDescription>
                    {summarizeJobStates(activeJobs)}
                    {" · "}
                    {`Current stage: ${getActiveStageName(activeJob)}`}
                    {" · "}
                    {activeJob.analysisJobId}
                  </AlertDescription>
                </Alert>
              ) : null}
              {renderWorkspaceState(model)}
            </section>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AppSpaceShell>
  );
}
