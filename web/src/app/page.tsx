import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TermsField } from "@/components/terms-field";
import { ThemeSwitch } from "@/components/theme-switch";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { ProviderCollectionProgress } from "@/components/provider-collection-progress";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Database,
  HardDrive,
  MinusCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import {
  createOperationalDashboardView,
  type OperationalDashboard,
} from "@/lib/dashboard";
import { shouldAutoRefreshDashboard } from "@/lib/dashboard-refresh";
import {
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_CANDIDATE_OFFSET,
  DEFAULT_MAX_IMAGES_PER_OBJECT,
  normalizeCandidateLimit,
  normalizeCandidateOffset,
  normalizeMaxImagesPerObject,
} from "@/lib/candidate-limits";
import {
  getActionFormDataString,
  getActionFormDataValue,
} from "@/lib/action-form-data";
import {
  COLLECT_BUSY_NOTICE,
  canStartCollect,
  collectNoticeFromCode,
} from "@/lib/collect-workflow";
import { createStatusRows } from "@/lib/status";
import type { ApiHealth } from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  createNewSearchSetHref,
  createSearchSetHref,
  createUserLibraryHref,
  createWorkspaceMode,
  filterSearchSets,
  getFirstParam,
} from "@/lib/workspace";

const DEFAULT_UI_PORT = 18660;
const DEFAULT_API_PORT = 18670;

type HomeProps = {
  searchParams?: Promise<{
    collect_notice?: string | string[];
    filter?: string | string[];
    mode?: string | string[];
    search_set?: string | string[];
  }>;
};

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

async function getApiHealth(apiPort: number): Promise<ApiHealth> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    return (await response.json()) as ApiHealth;
  } catch {
    return {
      service: "api",
      status: "error",
      worker: { service: "worker", status: "error" },
    };
  }
}

function emptyDashboard(workerStatus: OperationalDashboard["worker_status"]["status"]): OperationalDashboard {
  return {
    worker_status: {
      service: "worker",
      status: workerStatus,
      active_collect_job_id: null,
    },
    search_sets: [],
    provider_focus: [],
  };
}

async function getDashboard(apiPort: number): Promise<OperationalDashboard | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/dashboard`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as OperationalDashboard;
  } catch {
    return null;
  }
}

async function createSearchSet(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const displayName = getActionFormDataString(formData, "display_name");
  const termsText = getActionFormDataString(formData, "terms_text");

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      terms_text: termsText,
    }),
  });

  revalidatePath("/");
  if (!response.ok) {
    return;
  }

  const searchSet = (await response.json()) as { slug: string };
  redirect(`/?search_set=${searchSet.slug}`);
}

async function createSearchSetAndCollectFromMet(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const displayName = getActionFormDataString(formData, "display_name");
  const termsText = getActionFormDataString(formData, "terms_text");
  const candidateOffset = normalizeCandidateOffset(
    getActionFormDataValue(formData, "candidate_offset"),
  );
  const candidateLimit = normalizeCandidateLimit(
    getActionFormDataValue(formData, "candidate_limit"),
  );
  const maxImagesPerObject = normalizeMaxImagesPerObject(
    getActionFormDataValue(formData, "max_images_per_object"),
  );
  const searchSetResponse = await fetch(`http://127.0.0.1:${apiPort}/search-sets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      terms_text: termsText,
    }),
  });

  if (!searchSetResponse.ok) {
    revalidatePath("/");
    return;
  }

  const searchSet = (await searchSetResponse.json()) as { slug: string };
  const collectResponse = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${searchSet.slug}/provider-collections/met/collects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidate_offset: candidateOffset,
      candidate_limit: candidateLimit,
      max_images_per_object: maxImagesPerObject,
    }),
  });

  revalidatePath("/");
  if (!collectResponse.ok) {
    redirect(`/?search_set=${searchSet.slug}&collect_notice=${COLLECT_BUSY_NOTICE}`);
  }
  redirect(`/?search_set=${searchSet.slug}`);
}

async function deactivateSearchSetTerm(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const term = getActionFormDataString(formData, "term");

  await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/terms/deactivate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ term }),
  });

  revalidatePath("/");
}

async function startMetCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const candidateOffset = normalizeCandidateOffset(
    getActionFormDataValue(formData, "candidate_offset"),
  );
  const candidateLimit = normalizeCandidateLimit(
    getActionFormDataValue(formData, "candidate_limit"),
  );
  const maxImagesPerObject = normalizeMaxImagesPerObject(
    getActionFormDataValue(formData, "max_images_per_object"),
  );

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/met/collects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      candidate_offset: candidateOffset,
      candidate_limit: candidateLimit,
      max_images_per_object: maxImagesPerObject,
    }),
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_BUSY_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
}

function statusVariant(state: string): "default" | "destructive" | "secondary" | "outline" {
  if (state === "ok" || state === "running" || state === "completed") {
    return "default";
  }
  if (state === "error") {
    return "destructive";
  }
  if (state === "canceled") {
    return "outline";
  }
  return "secondary";
}

function statusIcon(state: string) {
  if (state === "ok" || state === "completed") {
    return <CircleCheck data-icon="inline-start" />;
  }
  if (state === "error") {
    return <CircleAlert data-icon="inline-start" />;
  }
  return <Activity data-icon="inline-start" />;
}

function CollectControls({
  idPrefix,
  startAtCandidate = DEFAULT_CANDIDATE_OFFSET,
}: {
  idPrefix: string;
  startAtCandidate?: number;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}_candidate_offset`}>Start at candidate</FieldLabel>
        <Input
          defaultValue={startAtCandidate}
          id={`${idPrefix}_candidate_offset`}
          min={0}
          name="candidate_offset"
          type="number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}_candidate_limit`}>Candidate limit</FieldLabel>
        <Input
          defaultValue={DEFAULT_CANDIDATE_LIMIT}
          id={`${idPrefix}_candidate_limit`}
          min={1}
          name="candidate_limit"
          type="number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}_max_images_per_object`}>
          Max images per object
        </FieldLabel>
        <Input
          defaultValue={DEFAULT_MAX_IMAGES_PER_OBJECT}
          id={`${idPrefix}_max_images_per_object`}
          min={1}
          name="max_images_per_object"
          type="number"
        />
        <FieldDescription>
          Limits sibling images collected from image-heavy Museum Objects.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function CollectBusyNote({ collectAvailable }: { collectAvailable: boolean }) {
  if (collectAvailable) {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground">
      A Met collection is already running. Collection actions will be available after it finishes.
    </p>
  );
}

function NewSearchSetWorkspace({ collectAvailable }: { collectAvailable: boolean }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-7">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Create</p>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
          New Search Set
        </h1>
      </header>

      <form className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Search Set</CardTitle>
            <CardDescription>
              Give this workspace a name and paste the terms to collect from.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="display_name">Display name</FieldLabel>
                <Input id="display_name" name="display_name" required />
              </Field>
              <TermsField
                id="terms_text"
                name="terms_text"
                placeholder="snake, anaconda, serpent"
                required
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {collectAvailable ? (
          <Card>
            <CardHeader>
              <CardTitle>Met</CardTitle>
            </CardHeader>
            <CardContent>
              <CollectControls idPrefix="new_search_set" />
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t bg-muted/50">
              <Button formAction={createSearchSet} type="submit" variant="outline">
                Save only
              </Button>
              <Button formAction={createSearchSetAndCollectFromMet} type="submit">
                <Play data-icon="inline-start" />
                Create and collect from Met
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Met collection unavailable</CardTitle>
              <CardDescription>
                Another Met collection is already running. Save this Search Set now,
                then collect from Met after the current job finishes.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-end border-t bg-muted/50">
              <Button formAction={createSearchSet} type="submit">
                Save Search Set
              </Button>
            </CardFooter>
          </Card>
        )}
      </form>
    </div>
  );
}

function UserLibraryWorkspace({ imageCount }: { imageCount: number }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-7">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Library</p>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
          User Library
        </h1>
        <p className="text-sm text-muted-foreground">
          {imageCount} collected Image Asset{imageCount === 1 ? "" : "s"} across all Search Sets.
        </p>
      </header>

      <Card>
        <CardContent className="py-6">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Database />
              </EmptyMedia>
              <EmptyTitle>No library grid yet</EmptyTitle>
              <EmptyDescription>
                Collected Image Assets from every Search Set will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = await searchParams;
  const filterText = getFirstParam(resolvedSearchParams?.filter) ?? "";
  const collectNoticeCode = getFirstParam(resolvedSearchParams?.collect_notice);
  const requestedWorkspaceMode = getFirstParam(resolvedSearchParams?.mode);
  const activeSearchSetSlug = getFirstParam(resolvedSearchParams?.search_set);
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const [apiHealth, dashboardResponse] = await Promise.all([
    getApiHealth(apiPort),
    getDashboard(apiPort),
  ]);
  const dashboard = dashboardResponse ?? emptyDashboard(apiHealth.worker.status);
  const dashboardView = createOperationalDashboardView(dashboard, activeSearchSetSlug);
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });
  const filteredSearchSets = filterSearchSets(dashboardView.searchSets, filterText);
  const activeSearchSet = dashboardView.activeSearchSet;
  const collectAvailable = canStartCollect(dashboardView.workerStatus);
  const collectNotice = collectNoticeFromCode(collectNoticeCode);
  const workspaceMode = createWorkspaceMode(requestedWorkspaceMode, activeSearchSet);
  const activeProviderCollections = activeSearchSet?.providerCollections ?? [];
  const resultSlotCount = Math.min(activeSearchSet?.importedImageCount ?? 0, 28);

  return (
    <div className="grid min-h-svh bg-background text-foreground lg:grid-cols-[340px_minmax(0,1fr)]">
      <DashboardAutoRefresh enabled={shouldAutoRefreshDashboard(dashboardView.workerStatus)} />
      <aside className="flex min-h-svh flex-col gap-5 border-r bg-card/20 p-5 lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border bg-background font-heading text-lg font-semibold">
            A
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">Anacronia</h1>
          </div>
          <ThemeSwitch />
        </div>

        <Link
          className={cn(
            buttonVariants({ variant: workspaceMode === "new-search-set" ? "default" : "outline" }),
            "h-11 w-full",
          )}
          href={createNewSearchSetHref(filterText)}
        >
          <Plus data-icon="inline-start" />
          New Search Set
        </Link>

        <Link
          className={cn(
            "flex flex-col gap-1 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50",
            workspaceMode === "user-library" && "border-ring bg-muted shadow-xs",
          )}
          href={createUserLibraryHref(filterText)}
        >
          <span className="text-sm font-medium">User Library</span>
          <span className="text-sm text-muted-foreground">
            {dashboardView.libraryImageCount} collected Image Asset
            {dashboardView.libraryImageCount === 1 ? "" : "s"}
          </span>
        </Link>

        <section className="flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-medium text-muted-foreground">Search Sets</h2>
            <Badge variant="secondary">{dashboardView.searchSets.length}</Badge>
          </div>

          <form className="flex gap-2">
            {workspaceMode === "search-set" && activeSearchSet ? (
              <input name="search_set" type="hidden" value={activeSearchSet.slug} />
            ) : null}
            {workspaceMode === "new-search-set" || workspaceMode === "user-library" ? (
              <input name="mode" type="hidden" value={workspaceMode} />
            ) : null}
            <Input
              aria-label="Filter Search Sets"
              defaultValue={filterText}
              name="filter"
              placeholder="Filter by title or term"
            />
            <Button size="icon" type="submit" variant="outline">
              <Search data-icon="inline-start" />
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            {filteredSearchSets.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>No matching Search Sets</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              filteredSearchSets.map((searchSet) => (
                <Link
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50",
                    workspaceMode === "search-set" &&
                      searchSet.isActive &&
                      "border-ring bg-muted shadow-xs",
                  )}
                  href={createSearchSetHref(searchSet.slug, filterText)}
                  key={searchSet.slug}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {searchSet.displayName}
                    </span>
                    <Badge variant="secondary">{searchSet.activeTerms.length}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {searchSet.termSummary || "No active terms"}
                  </p>
                  {searchSet.providerCollections.length === 0 ? null : (
                    <div className="flex flex-wrap gap-1">
                      {searchSet.providerCollections.map((providerCollection) => (
                        <Badge
                          key={`${searchSet.slug}-${providerCollection.provider}`}
                          variant="outline"
                        >
                          {providerCollection.providerLabel} (
                          {providerCollection.importedImageCount})
                        </Badge>
                      ))}
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <HardDrive className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground">Local runtime</h2>
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div className="flex items-center justify-between gap-3 text-sm" key={row.name}>
                <span className="truncate text-muted-foreground">{row.name}</span>
                <Badge variant={statusVariant(row.state)}>
                  {statusIcon(row.state)}
                  {row.state}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="min-w-0 px-5 py-6 md:px-8 lg:px-10 lg:py-9">
        {workspaceMode === "new-search-set" ? (
          <NewSearchSetWorkspace collectAvailable={collectAvailable} />
        ) : workspaceMode === "user-library" ? (
          <UserLibraryWorkspace imageCount={dashboardView.libraryImageCount} />
        ) : activeSearchSet === null ? (
          <NewSearchSetWorkspace collectAvailable={collectAvailable} />
        ) : (
          <div className="mx-auto flex max-w-7xl flex-col gap-7">
            <header className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-heading text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
                    {activeSearchSet.displayName}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeSearchSet.activeTerms.map((term) => (
                  <form
                    action={deactivateSearchSetTerm}
                    className="flex items-center gap-1"
                    key={term}
                  >
                    <input name="slug" type="hidden" value={activeSearchSet.slug} />
                    <input name="term" type="hidden" value={term} />
                    <Badge>{term}</Badge>
                    <Button
                      aria-label={`Deactivate ${term}`}
                      size="icon-xs"
                      type="submit"
                      variant="ghost"
                    >
                      <MinusCircle data-icon="inline-start" />
                    </Button>
                  </form>
                ))}
                {activeSearchSet.inactiveTerms.map((term) => (
                  <Badge key={term} variant="secondary">
                    {term}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeProviderCollections.length === 0 ? (
                  <Badge variant="outline">Met not collected yet</Badge>
                ) : (
                  activeProviderCollections.map((providerCollection) => (
                    <Badge
                      key={`${activeSearchSet.slug}-${providerCollection.provider}`}
                      variant="outline"
                    >
                      {providerCollection.providerLabel} (
                      {providerCollection.importedImageCount})
                    </Badge>
                  ))
                )}
              </div>

              {collectNotice ? (
                <div className="rounded-2xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  {collectNotice}
                </div>
              ) : null}
            </header>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="min-w-0">
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>Results</CardTitle>
                    <CardDescription>
                      {activeSearchSet.importedImageCount} Image Asset
                      {activeSearchSet.importedImageCount === 1 ? "" : "s"} in this Search Set
                    </CardDescription>
                  </div>
                  <CardAction>
                    <Badge variant="secondary">
                      {activeSearchSet.importedImageCount} shown
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {resultSlotCount === 0 ? (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Database />
                        </EmptyMedia>
                        <EmptyTitle>No Image Assets yet</EmptyTitle>
                        <EmptyDescription>
                          Collect from Met to add local Image Assets to this Search Set.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {Array.from({ length: resultSlotCount }).map((_, index) => {
                        const providerCollection =
                          activeProviderCollections[index % activeProviderCollections.length];

                        return (
                          <div
                            className="relative aspect-[4/5] overflow-hidden rounded-2xl border bg-muted"
                            key={`${activeSearchSet.slug}-asset-${index}`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-muted via-background/20 to-muted" />
                            {providerCollection ? (
                              <Badge className="absolute bottom-2 left-2" variant="secondary">
                                {providerCollection.providerLabel}
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <section className="flex flex-col gap-4">
                {activeProviderCollections.length === 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Met</CardTitle>
                      <CardDescription>No run yet</CardDescription>
                    </CardHeader>
                    <form action={startMetCollect}>
                      <input name="slug" type="hidden" value={activeSearchSet.slug} />
                      <CardContent>
                        <CollectControls idPrefix={`${activeSearchSet.slug}_met`} />
                        <CollectBusyNote collectAvailable={collectAvailable} />
                      </CardContent>
                      <CardFooter className="justify-end border-t bg-muted/50">
                        <Button disabled={!collectAvailable} size="sm" type="submit">
                          <Play data-icon="inline-start" />
                          Collect from Met
                        </Button>
                      </CardFooter>
                    </form>
                  </Card>
                ) : (
                  activeProviderCollections.map((providerCollection) => (
                    <Card key={`${activeSearchSet.slug}-${providerCollection.provider}`}>
                      <CardHeader>
                        <div className="min-w-0">
                          <CardTitle>{providerCollection.providerLabel}</CardTitle>
                          <CardDescription>{providerCollection.latestRunLabel}</CardDescription>
                        </div>
                        <CardAction>
                          <Badge variant={statusVariant(providerCollection.status)}>
                            {statusIcon(providerCollection.status)}
                            {providerCollection.status}
                          </Badge>
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        <ProviderCollectionProgress
                          continueCandidateOffset={providerCollection.continueCandidateOffset}
                          importedImageCount={providerCollection.importedImageCount}
                          progressLabel={providerCollection.progressLabel}
                          progressPercent={providerCollection.progressPercent}
                        />
                      </CardContent>
                      <form action={startMetCollect}>
                        <CardFooter className="flex-col items-stretch gap-4 border-t bg-muted/50">
                          <input name="slug" type="hidden" value={activeSearchSet.slug} />
                          <CollectControls
                            idPrefix={`${activeSearchSet.slug}_${providerCollection.provider}`}
                            startAtCandidate={providerCollection.nextCandidateOffset}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              disabled={!collectAvailable}
                              size="sm"
                              type="submit"
                              variant="outline"
                            >
                              <RotateCcw data-icon="inline-start" />
                              Continue same terms
                            </Button>
                          </div>
                        </CardFooter>
                      </form>
                    </Card>
                  ))
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Add terms</CardTitle>
                  </CardHeader>
                  <form>
                    <input
                      name="display_name"
                      type="hidden"
                      value={activeSearchSet.displayName}
                    />
                    <CardContent>
                      <FieldGroup>
                        <TermsField
                          id={`${activeSearchSet.slug}_additional_terms`}
                          name="terms_text"
                          placeholder="cobra, serpent"
                        />
                        <CollectControls idPrefix={`${activeSearchSet.slug}_add_terms`} />
                        <CollectBusyNote collectAvailable={collectAvailable} />
                      </FieldGroup>
                    </CardContent>
                    <CardFooter className="justify-end gap-2 border-t bg-muted/50">
                      <Button formAction={createSearchSet} size="sm" type="submit" variant="outline">
                        Save terms only
                      </Button>
                      <Button
                        disabled={!collectAvailable}
                        formAction={createSearchSetAndCollectFromMet}
                        size="sm"
                        type="submit"
                      >
                        <Play data-icon="inline-start" />
                        Add terms and collect from Met
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </section>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
