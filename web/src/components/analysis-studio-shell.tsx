"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Boxes,
  Clock3,
  Database,
  FileSearch,
  FlaskConical,
  Play,
  Plus,
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
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
  AnalysisStudioJobSummary,
  AnalysisStudioReadModel,
  AnalysisStudioResultSummary,
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
  return (
    <>
      <SidebarHeader>
        <WorkspaceBrandHeader />
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
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={model.selectedState.state === "overview"}
              render={<Link href={createAnalysisStudioHref({ state: "overview" })} />}
              tooltip="Overview"
            >
              <FlaskConical />
              <span className="group-data-[collapsible=icon]:hidden">Overview</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>{model.summary.resultCount}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Analysis Results</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="mt-3 gap-0.5">
              {model.results.length === 0 ? (
                <Empty className="border group-data-[collapsible=icon]:hidden">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileSearch />
                    </EmptyMedia>
                    <EmptyTitle>No Analysis Results</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                model.results.map((result) => {
                  const isActive =
                    model.selectedState.state === "selected-result" &&
                    model.selectedState.analysisResultId === result.analysisResultId;
                  return (
                    <SidebarMenuItem key={result.analysisResultId}>
                      <SidebarMenuButton
                        className={cn(
                          "h-auto gap-2 rounded-md px-2 py-1.5 text-[13px] font-normal group-data-[collapsible=icon]:justify-center",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                        isActive={isActive}
                        render={
                          <Link
                            href={createAnalysisStudioHref({
                              analysisResultId: result.analysisResultId,
                              state: "selected-result",
                            })}
                          />
                        }
                        tooltip={`${result.scopeLabel} · ${createResultSecondaryLabel(result)}`}
                      >
                        <FileSearch className="mt-0.5 shrink-0 text-sidebar-foreground/65" />
                        <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                          <span className="block truncate">{result.scopeLabel}</span>
                          <span className="block truncate text-[11px] leading-4 text-sidebar-foreground/55">
                            {createResultSidebarMetaLabel(result)}
                          </span>
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                          {result.itemCount}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Jobs</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="mt-3 gap-0.5">
              {model.jobs.length === 0 ? (
                <Empty className="border group-data-[collapsible=icon]:hidden">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Clock3 />
                    </EmptyMedia>
                    <EmptyTitle>No Jobs</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                model.jobs.map((job) => {
                  const isActive =
                    model.selectedState.state === "selected-job" &&
                    model.selectedState.analysisJobId === job.analysisJobId;
                  return (
                    <SidebarMenuItem key={job.analysisJobId}>
                      <SidebarMenuButton
                        className={cn(
                          "h-auto gap-2 rounded-md px-2 py-1.5 text-[13px] font-normal group-data-[collapsible=icon]:justify-center",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                        isActive={isActive}
                        render={
                          <Link
                            href={createAnalysisStudioHref({
                              analysisJobId: job.analysisJobId,
                              state: "selected-job",
                            })}
                          />
                        }
                        tooltip={`${job.analysisJobId} · ${createJobSecondaryLabel(job)}`}
                      >
                        <Clock3 className="mt-0.5 shrink-0 text-sidebar-foreground/65" />
                        <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                          <span className="block truncate">
                            {job.recipeLabels[0] ?? "Analysis job"}
                          </span>
                          <span className="block truncate text-[11px] leading-4 text-sidebar-foreground/55">
                            {compactAnalysisJobId(job.analysisJobId)}
                          </span>
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                          {job.status}
                        </span>
                      </SidebarMenuButton>
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
  const stateSummary =
    model.jobs.length > 0
      ? summarizeJobStates(model.jobs)
      : model.jobsUnavailable
        ? "Job API unavailable"
        : "No jobs found";
  const recipeSummary = new Set(
    model.results.flatMap((result) => result.recipeLabels),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Analysis Studio
        </p>
        <h1 className="text-3xl font-semibold tracking-normal">Analysis Results</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Durable Analysis Results live here. Select a Result or Job from the
          Studio sidebar, or start a new Analysis.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Analysis Scope</CardTitle>
            <CardDescription>Durable results currently indexed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-semibold">{model.summary.resultCount}</p>
            <p className="text-sm text-muted-foreground">
              {formatCount(model.summary.indexedImageCount, "image")} indexed
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recipe Choices</CardTitle>
            <CardDescription>Recipe variants already represented in Results.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              {recipeSummary.size > 0
                ? [...recipeSummary].sort((left, right) => left.localeCompare(right)).join(", ")
                : "No recipes yet"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Job Status</CardTitle>
            <CardDescription>Current Analysis Job history summary.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{stateSummary}</p>
          </CardContent>
        </Card>
      </div>

      {model.results.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Boxes />
            </EmptyMedia>
            <EmptyTitle>No Analysis Results yet</EmptyTitle>
            <EmptyDescription>
              Start a new Analysis to create the first durable Result for the
              Latent Space Explorer.
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Analysis Studio
        </p>
        <h1 className="text-3xl font-semibold tracking-normal">New Analysis</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose a Collection and recipe set to create durable Analysis Results.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Start Analysis Job</CardTitle>
          <CardDescription>
            This keeps the current submission path alive until the dedicated New
            Analysis flow lands in the next slice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/api/analysis-jobs"
            className="grid gap-4"
            method="post"
          >
            {model.collections.length > 0 ? (
              <label className="grid gap-2 text-sm text-foreground">
                <span>Collection</span>
                <select
                  className="h-10 rounded-2xl border border-border bg-input/50 px-3 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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
              <label className="grid gap-2 text-sm text-foreground">
                <span>Collection slugs</span>
                <input
                  className="h-10 rounded-2xl border border-border bg-input/50 px-3 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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

            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium text-foreground">
                Recipe IDs
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
                Run Analysis
              </button>
              <p className="text-sm text-muted-foreground">
                Result and Job detail panels will deepen in the next slices.
              </p>
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
            Process history is separate from durable Analysis Results.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={createBadgeVariant(job.status)}>{job.status}</Badge>
            {job.status === "running" || job.status === "queued" ? (
              <span className="text-sm text-muted-foreground">
                Current stage: {getActiveStageName(job)}
              </span>
            ) : null}
            {job.status === "failed" || job.status === "partial_failed" ? (
              <span className="text-sm text-muted-foreground">
                Failed at {getFailedStageName(job)}
              </span>
            ) : null}
          </div>

          <div className="grid gap-2">
            <h2 className="text-sm font-medium text-foreground">Produced Results</h2>
            {job.analysisResultIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed result yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {job.analysisResultIds.map((analysisResultId) => (
                  <Link
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "justify-start",
                    )}
                    href={createAnalysisStudioHref({
                      analysisResultId,
                      state: "selected-result",
                    })}
                    key={analysisResultId}
                  >
                    {analysisResultId}
                  </Link>
                ))}
              </div>
            )}
          </div>
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
