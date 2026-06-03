import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { BatchTargetControl } from "@/components/batch-target-control";
import { CollectionObjectDetailOverlay } from "@/components/collection-object-detail-overlay";
import { CollectionResultsGrid } from "@/components/collection-results-grid";
import {
  NewCollectionForm,
  type NewCollectionServerError,
} from "@/components/new-collection-form";
import {
  ObjectDetailErrorOverlay,
} from "@/components/object-detail-pending-link";
import { ProviderSearchActionButton } from "@/components/provider-search-action-button";
import { UserLibraryWorkspace } from "@/components/user-library-workspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import {
  Activity,
  CircleAlert,
  CircleCheck,
} from "lucide-react";

import {
  createOperationalDashboardView,
  type DashboardProviderCollectionView,
  type DashboardSearchSetView,
  type OperationalDashboard,
} from "@/lib/dashboard";
import {
  type CollectionObjectDetail,
  type CollectionProviderFacet,
  type CollectionResultCounts,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
  type LibraryObjectSummary,
} from "@/lib/collection-objects";
import { shouldAutoRefreshDashboard } from "@/lib/dashboard-refresh";
import { DEFAULT_BATCH_TARGET, normalizeBatchTarget } from "@/lib/candidate-limits";
import { readAppVersionStamp } from "@/lib/app-version";
import {
  getActionFormDataString,
  getActionFormDataValue,
} from "@/lib/action-form-data";
import {
  COLLECT_BUSY_NOTICE,
  canStartCollect,
  collectNoticeFromCode,
  providerSearchStatusClassName,
  providerSearchAction,
  type ProviderSearchAction,
} from "@/lib/collect-workflow";
import { createStatusRows } from "@/lib/status";
import type { ApiHealth } from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  createGridStateHref,
  createGridViewMode,
  parseObjectRouteKey,
  type GridViewMode,
  type LibraryCollectionFilter,
} from "@/lib/grid-view";
import {
  createCollectionImageAssetTileId,
  createCollectionObjectTileId,
  createLibraryImageAssetTileId,
  createLibraryObjectTileId,
} from "@/lib/grid-tile-ids";
import {
  createLibraryImageAssetHref,
  createLibraryObjectHref,
} from "@/lib/user-library-grid";
import {
  createWorkspaceMode,
  getFirstParam,
} from "@/lib/workspace";
import {
  createAdjacentItemHrefs,
  createAdjacentObjectHrefs,
} from "@/lib/object-navigation";

const DEFAULT_UI_PORT = 18660;
const DEFAULT_API_PORT = 18670;

type HomeProps = {
  searchParams?: Promise<{
    collect_notice?: string | string[];
    collection?: string | string[];
    collection_filter?: string | string[];
    filter?: string | string[];
    image?: string | string[];
    image_asset_id?: string | string[];
    mode?: string | string[];
    object?: string | string[];
    object_id?: string | string[];
    object_provider?: string | string[];
    provider?: string | string[];
    q?: string | string[];
    collection_error?: string | string[];
    favorite?: string | string[];
    search_set?: string | string[];
    view?: string | string[];
  }>;
};

type CollectionProviderFacetPayload = {
  provider: string;
  object_count: number;
  image_count: number;
};

type CollectionLocalResultSetPayload = {
  query: string;
  provider: string;
  view: GridViewMode;
  counts: CollectionResultCounts;
  provider_facets: CollectionProviderFacetPayload[];
  objects: CollectionObjectSummary[];
  image_assets: LibraryImageAssetSummary[];
};

type CollectionLocalResultSetView = {
  query: string;
  provider: string;
  view: GridViewMode;
  counts: CollectionResultCounts;
  providerFacets: CollectionProviderFacet[];
  objects: CollectionObjectSummary[];
  imageAssets: LibraryImageAssetSummary[];
};

type LibraryLocalResultSetPayload = Omit<
  CollectionLocalResultSetPayload,
  "objects"
> & {
  objects: LibraryObjectSummary[];
};

type LibraryLocalResultSetView = Omit<
  CollectionLocalResultSetView,
  "objects"
> & {
  objects: LibraryObjectSummary[];
};

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function createLibraryCollectionFilter(
  value: string | undefined,
): LibraryCollectionFilter {
  return value === "none" ? "none" : "all";
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

function emptyCollectionLocalResultSet(
  viewMode: GridViewMode,
): CollectionLocalResultSetView {
  return {
    query: "",
    provider: "all",
    view: viewMode,
    counts: { objects: 0, images: 0 },
    providerFacets: [],
    objects: [],
    imageAssets: [],
  };
}

function emptyLibraryLocalResultSet(
  viewMode: GridViewMode,
): LibraryLocalResultSetView {
  return {
    query: "",
    provider: "all",
    view: viewMode,
    counts: { objects: 0, images: 0 },
    providerFacets: [],
    objects: [],
    imageAssets: [],
  };
}

async function getCollectionLocalResultSet(
  apiPort: number,
  slug: string,
  viewMode: GridViewMode,
  queryText: string,
  providerFilter: string,
  favoriteOnly: boolean,
): Promise<CollectionLocalResultSetView> {
  const params = new URLSearchParams({ view: viewMode });
  if (queryText.trim() !== "") {
    params.set("q", queryText.trim());
  }
  if (providerFilter !== "all") {
    params.set("provider", providerFilter);
  }
  if (favoriteOnly) {
    params.set("favorite", "true");
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/search-sets/${slug}/local-result-set?${params.toString()}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return emptyCollectionLocalResultSet(viewMode);
    }

    const payload = (await response.json()) as CollectionLocalResultSetPayload;
    return {
      query: payload.query,
      provider: payload.provider,
      view: payload.view,
      counts: payload.counts,
      providerFacets: payload.provider_facets.map((facet) => ({
        provider: facet.provider,
        objectCount: facet.object_count,
        imageCount: facet.image_count,
      })),
      objects: payload.objects,
      imageAssets: payload.image_assets,
    };
  } catch {
    return emptyCollectionLocalResultSet(viewMode);
  }
}

async function getLibraryLocalResultSet(
  apiPort: number,
  viewMode: GridViewMode,
  queryText: string,
  providerFilter: string,
  favoriteOnly: boolean,
  libraryCollectionFilter: LibraryCollectionFilter,
): Promise<LibraryLocalResultSetView> {
  const params = new URLSearchParams({ view: viewMode });
  if (queryText.trim() !== "") {
    params.set("q", queryText.trim());
  }
  if (providerFilter !== "all") {
    params.set("provider", providerFilter);
  }
  if (favoriteOnly) {
    params.set("favorite", "true");
  }
  if (libraryCollectionFilter === "none") {
    params.set("collection", "none");
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/library/local-result-set?${params.toString()}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return emptyLibraryLocalResultSet(viewMode);
    }

    const payload = (await response.json()) as LibraryLocalResultSetPayload;
    return {
      query: payload.query,
      provider: payload.provider,
      view: payload.view,
      counts: payload.counts,
      providerFacets: payload.provider_facets.map((facet) => ({
        provider: facet.provider,
        objectCount: facet.object_count,
        imageCount: facet.image_count,
      })),
      objects: payload.objects,
      imageAssets: payload.image_assets,
    };
  } catch {
    return emptyLibraryLocalResultSet(viewMode);
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

async function getLibraryObjectDetail(
  apiPort: number,
  provider: string,
  objectId: number,
): Promise<CollectionObjectDetail | null> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/library/objects/${provider}/${objectId}`,
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
  collectionObject: CollectionObjectSummary | LibraryImageAssetSummary,
  collectionFilterText: string,
  localQueryText: string,
  providerFilter: string,
  viewMode: GridViewMode,
  favoriteOnly: boolean,
): string {
  return createGridStateHref({
    collectionFilterText,
    favoriteOnly,
    localQueryText,
    object: {
      objectId: collectionObject.object_id,
      provider: collectionObject.provider,
    },
    provider: providerFilter,
    searchSetSlug: slug,
    viewMode,
    workspaceMode: "search-set",
  });
}

function createCollectionImageAssetHref(
  slug: string,
  imageAsset: LibraryImageAssetSummary,
  collectionFilterText: string,
  localQueryText: string,
  providerFilter: string,
  favoriteOnly: boolean,
): string {
  return createGridStateHref({
    collectionFilterText,
    favoriteOnly,
    imageAssetId: imageAsset.image_asset_id,
    localQueryText,
    provider: providerFilter,
    searchSetSlug: slug,
    viewMode: "images",
    workspaceMode: "search-set",
  });
}

function objectProviderDisplayLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
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

  if (searchSetResponse.status === 409) {
    revalidatePath("/");
    redirect("/?mode=new-search-set&collection_error=duplicate_name");
  }

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
  if (state === "running" || state === "stopping") {
    return <Spinner data-icon="inline-start" />;
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

function NewSearchSetWorkspace({
  collectAvailable,
  existingCollections,
  serverError,
}: {
  collectAvailable: boolean;
  existingCollections: { displayName: string; slug: string }[];
  serverError: NewCollectionServerError | null;
}) {
  if (!collectAvailable) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>A search is already running</CardTitle>
            <CardDescription>
              Let this one finish or stop it before starting a new Collection.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <NewCollectionForm
        action={createSearchSetAndCollectFromMet}
        existingCollections={existingCollections}
        serverError={serverError}
      />
    </div>
  );
}

function ProviderSourceMetrics({
  importedImageCount,
  importedObjectCount,
}: {
  importedImageCount: number;
  importedObjectCount: number;
}) {
  return (
    <ItemGroup className="gap-2">
      <Item size="xs" variant="muted">
        <ItemContent>
          <ItemTitle className="font-normal text-muted-foreground">
            Objects
          </ItemTitle>
        </ItemContent>
        <ItemContent className="flex-none items-end">
          <span className="text-sm font-semibold tabular-nums">
            {importedObjectCount}
          </span>
        </ItemContent>
      </Item>
      <Item size="xs" variant="muted">
        <ItemContent>
          <ItemTitle className="font-normal text-muted-foreground">
            Images
          </ItemTitle>
        </ItemContent>
        <ItemContent className="flex-none items-end">
          <span className="text-sm font-semibold tabular-nums">
            {importedImageCount}
          </span>
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}

type SubmittableProviderSearchAction = ProviderSearchAction & {
  kind: "start" | "stop" | "resume";
};

function isSubmittableProviderSearchAction(
  action: ProviderSearchAction,
): action is SubmittableProviderSearchAction {
  return action.kind === "start" || action.kind === "stop" || action.kind === "resume";
}

function ProviderSourceActionRow({
  action,
  actionAvailable,
  batchTarget,
  formAction,
  idPrefix,
  searchSetSlug,
}: {
  action: SubmittableProviderSearchAction;
  actionAvailable: boolean;
  batchTarget: number;
  formAction: (formData: FormData) => Promise<void>;
  idPrefix: string;
  searchSetSlug: string;
}) {
  return (
    <form action={formAction} className="border-t px-5 pt-5">
      <input name="slug" type="hidden" value={searchSetSlug} />
      <div
        className={cn(
          "flex justify-end gap-3",
          action.showBatchTarget &&
            "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end",
        )}
      >
        {action.showBatchTarget ? (
          <BatchTargetControl
            defaultBatchTarget={batchTarget}
            idPrefix={idPrefix}
          />
        ) : null}
        <div className="flex justify-end">
          <ProviderSearchActionButton
            actionKind={action.kind}
            disabled={!actionAvailable}
            label={action.label}
            variant={action.kind === "stop" ? "outline" : "default"}
          />
        </div>
      </div>
    </form>
  );
}

function ProviderSourceControls({
  collectAvailable,
  providerCollections,
  searchSet,
}: {
  collectAvailable: boolean;
  providerCollections: DashboardProviderCollectionView[];
  searchSet: DashboardSearchSetView;
}) {
  if (providerCollections.length === 0) {
    return (
      <section aria-label="Provider Sources" className="flex w-full flex-col gap-3">
        <Card size="sm">
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Met</CardTitle>
              <CardDescription>Provider Source</CardDescription>
            </div>
            <CardAction>
              <Badge variant="secondary">ready</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ProviderSourceMetrics importedObjectCount={0} importedImageCount={0} />
            <CollectBusyNote collectAvailable={collectAvailable} />
          </CardContent>
          <ProviderSourceActionRow
            action={{
              kind: "start",
              label: "Start search",
              showBatchTarget: true,
              disabled: false,
            }}
            actionAvailable={collectAvailable}
            batchTarget={DEFAULT_BATCH_TARGET}
            formAction={startMetCollect}
            idPrefix={`${searchSet.slug}_met`}
            searchSetSlug={searchSet.slug}
          />
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Provider Sources" className="flex w-full flex-col gap-3">
      {providerCollections.map((providerCollection) => {
        const action = providerSearchAction(providerCollection.status);
        const submittableAction = isSubmittableProviderSearchAction(action) ? action : null;
        const actionAvailable =
          submittableAction !== null &&
          (submittableAction.kind === "stop" ||
            submittableAction.kind === "resume" ||
            (submittableAction.kind === "start" && collectAvailable));
        const formAction =
          submittableAction?.kind === "resume"
            ? resumeMetCollect
            : submittableAction?.kind === "stop"
              ? stopMetCollect
              : startMetCollect;

        return (
          <Card key={`${searchSet.slug}-${providerCollection.provider}`} size="sm">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{providerCollection.providerLabel}</CardTitle>
                <CardDescription>Provider Source</CardDescription>
              </div>
              <CardAction>
                <Badge
                  className={providerSearchStatusClassName(providerCollection.status)}
                  variant={statusVariant(providerCollection.status)}
                >
                  {statusIcon(providerCollection.status)}
                  {statusLabel(providerCollection.status)}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ProviderSourceMetrics
                importedObjectCount={providerCollection.importedObjectCount}
                importedImageCount={providerCollection.importedImageCount}
              />
              {providerCollection.status === "paused" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleAlert className="size-4" />
                  {pauseReasonLabel(providerCollection.pauseReason)}
                </p>
              ) : null}
              {submittableAction !== null && !actionAvailable ? (
                <CollectBusyNote collectAvailable={false} />
              ) : null}
            </CardContent>
            {submittableAction === null ? null : (
              <ProviderSourceActionRow
                action={submittableAction}
                actionAvailable={actionAvailable}
                batchTarget={providerCollection.batchTarget}
                formAction={formAction}
                idPrefix={`${searchSet.slug}_${providerCollection.provider}`}
                searchSetSlug={searchSet.slug}
              />
            )}
          </Card>
        );
      })}
    </section>
  );
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = await searchParams;
  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarCookie !== "false";
  const legacyFilterText = getFirstParam(resolvedSearchParams?.filter) ?? "";
  const collectionFilterText =
    getFirstParam(resolvedSearchParams?.collection_filter) ?? legacyFilterText;
  const localQueryText = getFirstParam(resolvedSearchParams?.q) ?? "";
  const providerFilter =
    getFirstParam(resolvedSearchParams?.provider)?.trim() || "all";
  const favoriteOnly = getFirstParam(resolvedSearchParams?.favorite) === "true";
  const libraryCollectionFilter = createLibraryCollectionFilter(
    getFirstParam(resolvedSearchParams?.collection),
  );
  const collectNoticeCode = getFirstParam(resolvedSearchParams?.collect_notice);
  const collectionErrorCode = getFirstParam(resolvedSearchParams?.collection_error);
  const requestedWorkspaceMode = getFirstParam(resolvedSearchParams?.mode);
  const requestedGridViewMode = getFirstParam(resolvedSearchParams?.view);
  const activeSearchSetSlug = getFirstParam(resolvedSearchParams?.search_set);
  const legacyObjectProvider = getFirstParam(resolvedSearchParams?.object_provider);
  const legacyObjectId = Number.parseInt(
    getFirstParam(resolvedSearchParams?.object_id) ?? "",
    10,
  );
  const selectedObjectRoute =
    parseObjectRouteKey(getFirstParam(resolvedSearchParams?.object)) ??
    (legacyObjectProvider !== undefined && Number.isFinite(legacyObjectId)
      ? { objectId: legacyObjectId, provider: legacyObjectProvider }
      : null);
  const selectedImageAssetId = Number.parseInt(
    getFirstParam(resolvedSearchParams?.image) ??
      getFirstParam(resolvedSearchParams?.image_asset_id) ??
      "",
    10,
  );
  const selectedDetailKind =
    selectedObjectRoute !== null
      ? "object"
      : Number.isFinite(selectedImageAssetId)
        ? "image"
        : null;
  const uiPort = getPort("ANACRONIA_UI_PORT", DEFAULT_UI_PORT);
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const appVersionStamp = readAppVersionStamp();
  const [apiHealth, dashboardResponse] = await Promise.all([
    getApiHealth(apiPort),
    getDashboard(apiPort),
  ]);
  const dashboard = dashboardResponse ?? emptyDashboard(apiHealth.worker.status);
  const dashboardView = createOperationalDashboardView(dashboard, activeSearchSetSlug);
  const existingCollections = dashboardView.searchSets.map((searchSet) => ({
    displayName: searchSet.displayName,
    slug: searchSet.slug,
  }));
  const newCollectionServerError: NewCollectionServerError | null =
    collectionErrorCode === "duplicate_name" ? "duplicate_name" : null;
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });
  const activeSearchSet = dashboardView.activeSearchSet;
  const collectAvailable = canStartCollect(dashboardView.workerStatus);
  const workspaceMode = createWorkspaceMode(requestedWorkspaceMode, activeSearchSet);
  const gridViewMode = createGridViewMode(requestedGridViewMode, workspaceMode);
  const activeProviderCollections = activeSearchSet?.providerCollections ?? [];
  const curationActionsDisabled =
    dashboardView.workerStatus === "running" || dashboardView.workerStatus === "stopping";
  const collectNotice = collectNoticeFromCode(collectNoticeCode, activeProviderCollections);
  const collectionLocalResultSet =
    activeSearchSet === null || workspaceMode !== "search-set"
      ? emptyCollectionLocalResultSet(gridViewMode)
      : await getCollectionLocalResultSet(
          apiPort,
          activeSearchSet.slug,
          gridViewMode,
          localQueryText,
          providerFilter,
          favoriteOnly,
        );
  const collectionObjects = collectionLocalResultSet.objects;
  const collectionImageAssets = collectionLocalResultSet.imageAssets;
  const libraryLocalResultSet =
    workspaceMode === "user-library"
      ? await getLibraryLocalResultSet(
          apiPort,
          gridViewMode,
          localQueryText,
          providerFilter,
          favoriteOnly,
          libraryCollectionFilter,
        )
      : emptyLibraryLocalResultSet(gridViewMode);
  const libraryObjects = libraryLocalResultSet.objects;
  const libraryImageAssets = libraryLocalResultSet.imageAssets;
  const activeImageAssets =
    workspaceMode === "search-set"
      ? collectionImageAssets
      : workspaceMode === "user-library"
        ? libraryImageAssets
        : [];
  const selectedCollectionImageAsset =
    selectedDetailKind === "image" && gridViewMode === "images"
      ? collectionImageAssets.find(
          (imageAsset) => imageAsset.image_asset_id === selectedImageAssetId,
        ) ?? null
      : null;
  const selectedLibraryImageAsset =
    selectedDetailKind === "image" && gridViewMode === "images"
      ? libraryImageAssets.find(
          (imageAsset) => imageAsset.image_asset_id === selectedImageAssetId,
        ) ?? null
      : null;
  const selectedActiveImageAsset =
    workspaceMode === "search-set"
      ? selectedCollectionImageAsset
      : selectedLibraryImageAsset;
  const selectedImageObjectRoute =
    selectedDetailKind === "image" && selectedActiveImageAsset !== null
      ? {
          objectId: selectedActiveImageAsset.object_id,
          provider: selectedActiveImageAsset.provider,
        }
      : null;
  const selectedDetailObjectRoute =
    selectedDetailKind === "object" ? selectedObjectRoute : selectedImageObjectRoute;
  const selectedLibraryObject =
    workspaceMode === "user-library" && selectedDetailObjectRoute !== null
      ? libraryObjects.find(
          (libraryObject) =>
            libraryObject.provider === selectedDetailObjectRoute.provider &&
            libraryObject.object_id === selectedDetailObjectRoute.objectId,
        ) ?? null
      : null;
  const shouldLoadSelectedObjectDetail =
    selectedDetailObjectRoute !== null &&
    ((workspaceMode === "search-set" && activeSearchSet !== null) ||
      workspaceMode === "user-library");
  const selectedObjectDetail =
    shouldLoadSelectedObjectDetail
      ? workspaceMode === "search-set" && activeSearchSet !== null
        ? await getCollectionObjectDetail(
            apiPort,
            activeSearchSet.slug,
            selectedDetailObjectRoute.provider,
            selectedDetailObjectRoute.objectId,
          )
        : await getLibraryObjectDetail(
            apiPort,
            selectedDetailObjectRoute.provider,
            selectedDetailObjectRoute.objectId,
          )
      : null;
  const selectedImageDetailLoadFailed =
    selectedDetailKind === "image" &&
    Number.isFinite(selectedImageAssetId) &&
    selectedActiveImageAsset === null;
  const selectedObjectCloseHref =
    workspaceMode === "user-library"
      ? createGridStateHref({
          favoriteOnly,
          libraryCollectionFilter,
          localQueryText,
          provider: providerFilter,
          viewMode: gridViewMode,
          workspaceMode: "user-library",
        })
      : activeSearchSet !== null
        ? createGridStateHref({
            collectionFilterText,
            favoriteOnly,
            localQueryText,
            provider: providerFilter,
            searchSetSlug: activeSearchSet.slug,
            viewMode: gridViewMode,
            workspaceMode: "search-set",
          })
        : "/";
  const selectedImageCloseHref =
    workspaceMode === "user-library"
      ? createGridStateHref({
          favoriteOnly,
          libraryCollectionFilter,
          localQueryText,
          provider: providerFilter,
          viewMode: gridViewMode,
          workspaceMode: "user-library",
        })
      : activeSearchSet !== null
        ? createGridStateHref({
            collectionFilterText,
            favoriteOnly,
            localQueryText,
            provider: providerFilter,
            searchSetSlug: activeSearchSet.slug,
            viewMode: gridViewMode,
            workspaceMode: "search-set",
          })
        : "/";
  const selectedObjectReturnFocusId =
    selectedDetailObjectRoute === null
      ? ""
      : workspaceMode === "user-library"
        ? createLibraryObjectTileId(
            selectedDetailObjectRoute.provider,
            selectedDetailObjectRoute.objectId,
          )
        : createCollectionObjectTileId(
            selectedDetailObjectRoute.provider,
            selectedDetailObjectRoute.objectId,
          );
  const selectedImageReturnFocusId =
    Number.isFinite(selectedImageAssetId)
      ? workspaceMode === "user-library"
        ? createLibraryImageAssetTileId(selectedImageAssetId)
        : createCollectionImageAssetTileId(selectedImageAssetId)
      : "";
  const selectedObjectLabel =
    selectedDetailObjectRoute !== null
      ? `${objectProviderDisplayLabel(selectedDetailObjectRoute.provider)} object ${selectedDetailObjectRoute.objectId}`
      : "Selected object";
  const selectedImageLabel =
    Number.isFinite(selectedImageAssetId)
      ? `Image Asset ${selectedImageAssetId}`
      : "Selected image";
  const selectedObjectDetailLoadFailed =
    shouldLoadSelectedObjectDetail && selectedObjectDetail === null;
  const selectedObjectDetailResolved =
    selectedObjectDetail !== null || selectedObjectDetailLoadFailed;
  const selectedImageDetailResolved =
    selectedActiveImageAsset !== null || selectedImageDetailLoadFailed;
  const selectedObjectNavigationHrefs =
    workspaceMode === "search-set" &&
    activeSearchSet !== null &&
    selectedDetailObjectRoute !== null
      ? createAdjacentObjectHrefs({
          currentObjectId: selectedDetailObjectRoute.objectId,
          currentProvider: selectedDetailObjectRoute.provider,
          items: collectionObjects,
          createHref: (collectionObject) =>
            createCollectionObjectHref(
              activeSearchSet.slug,
              collectionObject,
              collectionFilterText,
              localQueryText,
              providerFilter,
              gridViewMode,
              favoriteOnly,
            ),
        })
      : workspaceMode === "user-library" &&
          selectedDetailObjectRoute !== null
        ? createAdjacentObjectHrefs({
            currentObjectId: selectedDetailObjectRoute.objectId,
            currentProvider: selectedDetailObjectRoute.provider,
            items: libraryObjects,
            createHref: (libraryObject) =>
              createLibraryObjectHref(
                libraryObject,
                localQueryText,
                providerFilter,
                gridViewMode,
                favoriteOnly,
                libraryCollectionFilter,
              ),
          })
        : { nextObjectHref: null, previousObjectHref: null };
  const selectedImageNavigationHrefs =
    selectedActiveImageAsset !== null
      ? createAdjacentItemHrefs({
          items: activeImageAssets,
          createHref: (imageAsset) =>
            workspaceMode === "search-set" && activeSearchSet !== null
              ? createCollectionImageAssetHref(
                  activeSearchSet.slug,
                  imageAsset,
                  collectionFilterText,
                  localQueryText,
                  providerFilter,
                  favoriteOnly,
                )
              : createLibraryImageAssetHref(
                  imageAsset,
                  localQueryText,
                  providerFilter,
                  favoriteOnly,
                  libraryCollectionFilter,
                ),
          isCurrentItem: (imageAsset) =>
            imageAsset.image_asset_id === selectedActiveImageAsset.image_asset_id,
        })
      : { nextObjectHref: null, previousObjectHref: null };
  const selectedObjectCollectionLabels =
    workspaceMode === "user-library"
      ? selectedDetailKind === "image"
        ? selectedActiveImageAsset?.collections.map(
            (collection) => collection.display_name,
          ) ?? []
        : selectedLibraryObject?.collections.map(
            (collection) => collection.display_name,
          ) ?? []
      : activeSearchSet
        ? [activeSearchSet.displayName]
        : [];
  const selectedDetailCloseHref =
    selectedDetailKind === "image" ? selectedImageCloseHref : selectedObjectCloseHref;
  const selectedDetailReturnFocusId =
    selectedDetailKind === "image"
      ? selectedImageReturnFocusId
      : selectedObjectReturnFocusId;
  const selectedDetailNavigationHrefs =
    selectedDetailKind === "image"
      ? selectedImageNavigationHrefs
      : selectedObjectNavigationHrefs;
  const selectedDetailLoadFailed =
    selectedObjectDetailLoadFailed || selectedImageDetailLoadFailed;
  const selectedDetailLabel =
    selectedDetailKind === "image" ? selectedImageLabel : selectedObjectLabel;
  const selectedDetailInitialImageAssetId =
    selectedDetailKind === "image" && Number.isFinite(selectedImageAssetId)
      ? selectedImageAssetId
      : null;
  const selectedObjectDetailOverlayKey =
    selectedObjectDetail !== null
      ? `${selectedObjectDetail.object.provider}-${selectedObjectDetail.object.object_id}-${selectedDetailKind}-${selectedDetailInitialImageAssetId ?? "object"}`
      : "";
  const contentHeaderObjectCount =
    workspaceMode === "user-library"
      ? libraryLocalResultSet.counts.objects
      : collectionLocalResultSet.counts.objects;
  const contentHeaderImageCount =
    workspaceMode === "user-library"
      ? libraryLocalResultSet.counts.images
      : collectionLocalResultSet.counts.images;
  const gridViewObjectHref =
    workspaceMode === "search-set" && activeSearchSet !== null
      ? createGridStateHref({
          collectionFilterText,
          favoriteOnly,
          localQueryText,
          provider: providerFilter,
          searchSetSlug: activeSearchSet.slug,
          viewMode: "objects",
          workspaceMode: "search-set",
        })
      : workspaceMode === "user-library"
        ? createGridStateHref({
            favoriteOnly,
            libraryCollectionFilter,
            localQueryText,
            provider: providerFilter,
            viewMode: "objects",
            workspaceMode: "user-library",
          })
        : undefined;
  const gridViewImageHref =
    workspaceMode === "search-set" && activeSearchSet !== null
      ? createGridStateHref({
          collectionFilterText,
          favoriteOnly,
          localQueryText,
          provider: providerFilter,
          searchSetSlug: activeSearchSet.slug,
          viewMode: "images",
          workspaceMode: "search-set",
        })
      : workspaceMode === "user-library"
        ? createGridStateHref({
            favoriteOnly,
            libraryCollectionFilter,
            localQueryText,
            provider: providerFilter,
            viewMode: "images",
            workspaceMode: "user-library",
          })
        : undefined;

  return (
    <AppShell
      activeSearchSetSlug={activeSearchSet?.slug ?? null}
      appVersionStamp={appVersionStamp}
      collectAvailable={collectAvailable}
      contentHeaderImageCount={contentHeaderImageCount}
      contentHeaderObjectCount={contentHeaderObjectCount}
      dashboardView={dashboardView}
      defaultSidebarOpen={defaultSidebarOpen}
      filterText={collectionFilterText}
      gridViewImageHref={gridViewImageHref}
      gridViewMode={
        workspaceMode === "search-set" || workspaceMode === "user-library"
          ? gridViewMode
          : undefined
      }
      gridViewObjectHref={gridViewObjectHref}
      rows={rows}
      workspaceMode={workspaceMode}
    >
      <DashboardAutoRefresh enabled={shouldAutoRefreshDashboard(dashboardView.workerStatus)} />
      <div className="min-w-0 px-5 py-6 md:px-8 lg:px-10 lg:py-9">
        {workspaceMode === "new-search-set" ? (
          <NewSearchSetWorkspace
            collectAvailable={collectAvailable}
            existingCollections={existingCollections}
            serverError={newCollectionServerError}
          />
        ) : workspaceMode === "user-library" ? (
          <UserLibraryWorkspace
            apiBaseUrl={apiBaseUrl}
            curationActionsDisabled={curationActionsDisabled}
            favoriteOnly={favoriteOnly}
            imageAssets={libraryImageAssets}
            libraryCollectionFilter={libraryCollectionFilter}
            localQueryText={localQueryText}
            objects={libraryObjects}
            providerFacets={libraryLocalResultSet.providerFacets}
            providerFilter={providerFilter}
            resolvedImageAssetId={
              selectedImageDetailResolved && Number.isFinite(selectedImageAssetId)
                ? selectedImageAssetId
                : null
            }
            resolvedObject={selectedObjectDetailResolved ? selectedObjectRoute : null}
            resultCounts={libraryLocalResultSet.counts}
            viewMode={gridViewMode}
          />
        ) : activeSearchSet === null ? (
          <NewSearchSetWorkspace
            collectAvailable={collectAvailable}
            existingCollections={existingCollections}
            serverError={newCollectionServerError}
          />
        ) : (
          <div className="mx-auto flex max-w-7xl flex-col gap-7">
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:items-start">
              <div className="flex min-w-0 flex-col gap-5">
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

                {collectNotice ? (
                  <Alert>
                    <CircleAlert />
                    <AlertDescription>{collectNotice}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <ProviderSourceControls
                collectAvailable={collectAvailable}
                providerCollections={activeProviderCollections}
                searchSet={activeSearchSet}
              />
            </section>

            <section>
              <CollectionResultsGrid
                apiBaseUrl={apiBaseUrl}
                closeImageHref={createGridStateHref({
                  collectionFilterText,
                  favoriteOnly,
                  localQueryText,
                  provider: providerFilter,
                  searchSetSlug: activeSearchSet.slug,
                  viewMode: "images",
                  workspaceMode: "search-set",
                })}
                closeObjectHref={createGridStateHref({
                  collectionFilterText,
                  favoriteOnly,
                  localQueryText,
                  provider: providerFilter,
                  searchSetSlug: activeSearchSet.slug,
                  viewMode: gridViewMode,
                  workspaceMode: "search-set",
                })}
                collectionFilterText={collectionFilterText}
                collectionDisplayName={activeSearchSet.displayName}
                curationActionsDisabled={curationActionsDisabled}
                favoriteOnly={favoriteOnly}
                hasLocalMaterial={
                  activeSearchSet.importedObjectCount > 0 ||
                  activeSearchSet.importedImageCount > 0
                }
                imageAssets={collectionImageAssets}
                localQueryText={collectionLocalResultSet.query}
                objects={collectionObjects}
                providerFacets={collectionLocalResultSet.providerFacets}
                providerFilter={collectionLocalResultSet.provider}
                resolvedImageAssetId={
                  selectedImageDetailResolved && Number.isFinite(selectedImageAssetId)
                    ? selectedImageAssetId
                    : null
                }
                resolvedObject={selectedObjectDetailResolved ? selectedObjectRoute : null}
                resultCounts={collectionLocalResultSet.counts}
                searchSetSlug={activeSearchSet.slug}
                viewMode={gridViewMode}
              />
            </section>
          </div>
        )}
        {selectedObjectDetail ? (
          <CollectionObjectDetailOverlay
            apiBaseUrl={apiBaseUrl}
            closeHref={selectedDetailCloseHref}
            collectionLabels={selectedObjectCollectionLabels}
            curationActionsDisabled={curationActionsDisabled}
            deleteEndpoint="/api/curation/delete"
            detail={selectedObjectDetail}
            detailKind={selectedDetailKind ?? "object"}
            initialImageAssetId={selectedDetailInitialImageAssetId}
            key={selectedObjectDetailOverlayKey}
            nextObjectHref={selectedDetailNavigationHrefs.nextObjectHref}
            previousObjectHref={selectedDetailNavigationHrefs.previousObjectHref}
            removeFromCollectionEndpoint={
              workspaceMode === "search-set" && activeSearchSet !== null
                ? `/api/search-sets/${encodeURIComponent(activeSearchSet.slug)}/remove-from-collection`
                : undefined
            }
            returnFocusId={selectedDetailReturnFocusId}
          />
        ) : selectedDetailLoadFailed ? (
          <ObjectDetailErrorOverlay
            closeHref={selectedDetailCloseHref}
            objectLabel={selectedDetailLabel}
            returnFocusId={selectedDetailReturnFocusId}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
