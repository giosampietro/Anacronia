import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeSwitch } from "@/components/theme-switch";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { BatchTargetControl } from "@/components/batch-target-control";
import { CollectionObjectDetailOverlay } from "@/components/collection-object-detail-overlay";
import { NewCollectionForm } from "@/components/new-collection-form";
import { ProviderCollectionProgress } from "@/components/provider-collection-progress";
import { ProviderSearchActionButton } from "@/components/provider-search-action-button";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Database,
  HardDrive,
  Images,
  Plus,
  Search,
} from "lucide-react";

import {
  createOperationalDashboardView,
  type OperationalDashboard,
} from "@/lib/dashboard";
import {
  imageUrl,
  type CollectionObjectDetail,
  type CollectionObjectSummary,
} from "@/lib/collection-objects";
import { shouldAutoRefreshDashboard } from "@/lib/dashboard-refresh";
import { normalizeBatchTarget } from "@/lib/candidate-limits";
import {
  getActionFormDataString,
  getActionFormDataValue,
} from "@/lib/action-form-data";
import {
  COLLECT_BUSY_NOTICE,
  canStartCollect,
  collectNoticeFromCode,
  providerSearchAction,
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
    object_id?: string | string[];
    object_provider?: string | string[];
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

async function getCollectionObjects(
  apiPort: number,
  slug: string,
): Promise<CollectionObjectSummary[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/objects`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { objects: CollectionObjectSummary[] };
    return payload.objects;
  } catch {
    return [];
  }
}

async function getCollectionObjectDetail(
  apiPort: number,
  slug: string,
  provider: string,
  objectId: number,
): Promise<CollectionObjectDetail | null> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/search-sets/${slug}/objects/${provider}/${objectId}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as CollectionObjectDetail;
  } catch {
    return null;
  }
}

function createCollectionObjectHref(
  slug: string,
  collectionObject: CollectionObjectSummary,
  filterText: string,
): string {
  const params = new URLSearchParams({
    search_set: slug,
    object_provider: collectionObject.provider,
    object_id: String(collectionObject.object_id),
  });
  if (filterText) {
    params.set("filter", filterText);
  }

  return `/?${params.toString()}`;
}

function createCloseObjectHref(slug: string, filterText: string): string {
  const params = new URLSearchParams({ search_set: slug });
  if (filterText) {
    params.set("filter", filterText);
  }

  return `/?${params.toString()}`;
}

function createCollectionObjectTileId(provider: string, objectId: number): string {
  return `collection-object-${provider}-${objectId}`;
}

async function createSearchSetAndCollectFromMet(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const displayName = getActionFormDataString(formData, "display_name");
  const termsText = getActionFormDataString(formData, "terms_text");
  const batchTarget = normalizeBatchTarget(
    getActionFormDataValue(formData, "batch_target"),
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
      batch_target: batchTarget,
    }),
  });

  revalidatePath("/");
  if (!collectResponse.ok) {
    redirect(`/?search_set=${searchSet.slug}&collect_notice=${COLLECT_BUSY_NOTICE}`);
  }
  redirect(`/?search_set=${searchSet.slug}`);
}

async function startMetCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const batchTarget = normalizeBatchTarget(
    getActionFormDataValue(formData, "batch_target"),
  );

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/met/collects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      batch_target: batchTarget,
    }),
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_BUSY_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
}

async function resumeMetCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const batchTarget = normalizeBatchTarget(
    getActionFormDataValue(formData, "batch_target"),
  );

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/met/collects/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      batch_target: batchTarget,
    }),
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_BUSY_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
}

async function stopMetCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/met/collects/stop`, {
    method: "POST",
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_BUSY_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
}

function statusVariant(state: string): "default" | "destructive" | "secondary" | "outline" {
  if (state === "ok" || state === "running" || state === "stopping" || state === "completed") {
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

function statusLabel(state: string): string {
  if (state === "no_more_results") {
    return "No more results";
  }
  if (state === "running") {
    return "searching";
  }
  if (state === "completed") {
    return "ready";
  }
  if (state === "stopped" || state === "canceled") {
    return "stopped";
  }

  return state;
}

function pauseReasonLabel(reason: string): string {
  if (reason === "insufficient_disk") {
    return "Paused: not enough disk space.";
  }
  if (reason === "repeated_provider_failures") {
    return "Paused: repeated provider or download failures.";
  }
  if (reason.trim() !== "") {
    return `Paused: ${reason.replaceAll("_", " ")}.`;
  }

  return "Paused.";
}

function CollectBusyNote({ collectAvailable }: { collectAvailable: boolean }) {
  if (collectAvailable) {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground">
      A search is already active. Collection actions will be available after it finishes.
    </p>
  );
}

function NewSearchSetWorkspace({ collectAvailable }: { collectAvailable: boolean }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-7">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Create</p>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
          New Collection
        </h1>
      </header>

      <NewCollectionForm
        action={createSearchSetAndCollectFromMet}
        collectAvailable={collectAvailable}
      />
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
          {imageCount} collected Image Asset{imageCount === 1 ? "" : "s"} across all Collections.
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
                Collected Image Assets from every Collection will appear here.
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
  const selectedObjectProvider = getFirstParam(resolvedSearchParams?.object_provider);
  const selectedObjectId = Number.parseInt(
    getFirstParam(resolvedSearchParams?.object_id) ?? "",
    10,
  );
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
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
  const workspaceMode = createWorkspaceMode(requestedWorkspaceMode, activeSearchSet);
  const activeProviderCollections = activeSearchSet?.providerCollections ?? [];
  const collectNotice = collectNoticeFromCode(collectNoticeCode, activeProviderCollections);
  const collectionObjects =
    activeSearchSet === null || workspaceMode !== "search-set"
      ? []
      : await getCollectionObjects(apiPort, activeSearchSet.slug);
  const selectedObjectDetail =
    activeSearchSet !== null &&
    workspaceMode === "search-set" &&
    selectedObjectProvider &&
    Number.isFinite(selectedObjectId)
      ? await getCollectionObjectDetail(
          apiPort,
          activeSearchSet.slug,
          selectedObjectProvider,
          selectedObjectId,
        )
      : null;

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
          New Collection
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
            <h2 className="text-sm font-medium text-muted-foreground">Collections</h2>
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
              aria-label="Filter Collections"
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
                  <EmptyTitle>No matching Collections</EmptyTitle>
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
                    <Badge variant="secondary">
                      {searchSet.importedImageCount} Image
                      {searchSet.importedImageCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {searchSet.termSummary || "No active terms"}
                  </p>
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
                  {row.displayState}
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
                  <Badge key={term}>{term}</Badge>
                ))}
                {activeSearchSet.inactiveTerms.map((term) => (
                  <Badge key={term} variant="secondary">
                    {term}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeProviderCollections.length === 0 ? (
                  <Badge variant="outline">Met not searched yet</Badge>
                ) : (
                  activeProviderCollections.map((providerCollection) => (
                    <Badge
                      key={`${activeSearchSet.slug}-${providerCollection.provider}`}
                      variant="outline"
                    >
                      {providerCollection.providerLabel}
                    </Badge>
                  ))
                )}
                <Badge variant="secondary">
                  Objects {activeSearchSet.importedObjectCount}
                </Badge>
                <Badge variant="secondary">
                  Images {activeSearchSet.importedImageCount}
                </Badge>
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
                      {activeSearchSet.importedObjectCount} Object
                      {activeSearchSet.importedObjectCount === 1 ? "" : "s"} /{" "}
                      {activeSearchSet.importedImageCount} Image
                      {activeSearchSet.importedImageCount === 1 ? "" : "s"} in this Collection
                    </CardDescription>
                  </div>
                  <CardAction>
                    <Badge variant="secondary">
                      {collectionObjects.length} shown
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {collectionObjects.length === 0 ? (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Database />
                        </EmptyMedia>
                        <EmptyTitle>No Objects yet</EmptyTitle>
                        <EmptyDescription>
                          Start search to add local Museum Objects to this Collection.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {collectionObjects.map((collectionObject) => (
                        <Link
                          className="group relative aspect-[4/5] overflow-hidden rounded-2xl border bg-muted outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                          href={createCollectionObjectHref(
                            activeSearchSet.slug,
                            collectionObject,
                            filterText,
                          )}
                          id={createCollectionObjectTileId(
                            collectionObject.provider,
                            collectionObject.object_id,
                          )}
                          key={`${collectionObject.provider}-${collectionObject.object_id}`}
                        >
                          {/* Anacronia serves already-sized local derivatives from FastAPI. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={collectionObject.title || `Met object ${collectionObject.object_id}`}
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                            src={imageUrl(apiBaseUrl, collectionObject.cover_thumb_url)}
                          />
                          {collectionObject.has_sibling_images ? (
                            <Badge className="absolute right-2 top-2" variant="secondary">
                              <Images data-icon="inline-start" />
                              {collectionObject.image_count}
                            </Badge>
                          ) : null}
                          <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-background via-background/85 to-transparent p-3 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                            <Badge variant="secondary">Met</Badge>
                            <p className="mt-2 line-clamp-2 text-sm font-medium">
                              {collectionObject.title || "Untitled object"}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <section className="flex flex-col gap-4">
                {activeProviderCollections.length === 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Met</CardTitle>
                      <CardDescription>No search yet</CardDescription>
                    </CardHeader>
                    <form action={startMetCollect}>
                      <input name="slug" type="hidden" value={activeSearchSet.slug} />
                      <CardContent>
                        <BatchTargetControl idPrefix={`${activeSearchSet.slug}_met`} />
                        <CollectBusyNote collectAvailable={collectAvailable} />
                      </CardContent>
                      <CardFooter className="justify-end border-t bg-muted/50">
                        <ProviderSearchActionButton
                          actionKind="start"
                          disabled={!collectAvailable}
                          label="Start search"
                        />
                      </CardFooter>
                    </form>
                  </Card>
                ) : (
                  activeProviderCollections.map((providerCollection) => {
                    const action = providerSearchAction(providerCollection.status);
                    const actionAvailable =
                      action.kind === "stop" ||
                      action.kind === "resume" ||
                      (action.kind === "start" && collectAvailable);
                    const formAction =
                      action.kind === "resume"
                        ? resumeMetCollect
                        : action.kind === "stop"
                          ? stopMetCollect
                          : startMetCollect;

                    return (
                      <Card key={`${activeSearchSet.slug}-${providerCollection.provider}`}>
                        <CardHeader>
                          <div className="min-w-0">
                            <CardTitle>{providerCollection.providerLabel}</CardTitle>
                            <CardDescription>Provider Source</CardDescription>
                          </div>
                          <CardAction>
                            <Badge variant={statusVariant(providerCollection.status)}>
                              {statusIcon(providerCollection.status)}
                              {statusLabel(providerCollection.status)}
                            </Badge>
                          </CardAction>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                          <ProviderCollectionProgress
                            importedObjectCount={providerCollection.importedObjectCount}
                            importedImageCount={providerCollection.importedImageCount}
                          />
                          {providerCollection.status === "paused" ? (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CircleAlert className="size-4" />
                              {pauseReasonLabel(providerCollection.pauseReason)}
                            </p>
                          ) : null}
                          {action.kind !== "none" && !actionAvailable ? (
                            <CollectBusyNote collectAvailable={false} />
                          ) : null}
                        </CardContent>
                        {action.kind === "none" ? (
                          action.label === "Stopping" ? (
                            <CardFooter className="justify-end border-t bg-muted/50">
                              <Button disabled size="sm" type="button" variant="outline">
                                <Activity data-icon="inline-start" />
                                {action.label}
                              </Button>
                            </CardFooter>
                          ) : null
                        ) : (
                          <form action={formAction}>
                            <CardFooter className="flex-col items-stretch gap-4 border-t bg-muted/50">
                              <input name="slug" type="hidden" value={activeSearchSet.slug} />
                              {action.showBatchTarget ? (
                                <BatchTargetControl
                                  idPrefix={`${activeSearchSet.slug}_${providerCollection.provider}`}
                                />
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <ProviderSearchActionButton
                                  actionKind={action.kind}
                                  disabled={!actionAvailable}
                                  label={action.label}
                                  variant={action.kind === "stop" ? "outline" : "default"}
                                />
                              </div>
                            </CardFooter>
                          </form>
                        )}
                      </Card>
                    );
                  })
                )}
              </section>
            </section>
          </div>
        )}
        {activeSearchSet !== null && selectedObjectDetail ? (
          <CollectionObjectDetailOverlay
            apiBaseUrl={apiBaseUrl}
            closeHref={createCloseObjectHref(activeSearchSet.slug, filterText)}
            detail={selectedObjectDetail}
            returnFocusId={createCollectionObjectTileId(
              selectedObjectDetail.object.provider,
              selectedObjectDetail.object.object_id,
            )}
          />
        ) : null}
      </main>
    </div>
  );
}
