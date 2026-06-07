import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { CollectionObjectDetailOverlay } from "@/components/collection-object-detail-overlay";
import { CollectionResultsGrid } from "@/components/collection-results-grid";
import {
  NewCollectionForm,
  type NewCollectionServerError,
} from "@/components/new-collection-form";
import {
  ObjectDetailErrorOverlay,
} from "@/components/object-detail-pending-link";
import { ProviderSourceActionRow } from "@/components/provider-source-action-row";
import { UserLibraryWorkspace } from "@/components/user-library-workspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CircleAlert,
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
  COLLECT_STATE_CHANGED_NOTICE,
  canStartCollect,
  collectNoticeFromCode,
  providerSearchActionAvailable,
  providerSearchAction,
  type ProviderSearchAction,
} from "@/lib/collect-workflow";
import { createStatusRows } from "@/lib/status";
import type { ApiHealth } from "@/lib/status";
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
  deleteCreatedCollectionAfterFailedInitialCollect,
} from "@/lib/new-collection";
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
  limit?: number,
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
  if (limit !== undefined) {
    params.set("limit", String(limit));
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
  objectId: string,
): Promise<CollectionObjectDetail | null> {
  try {
    const encodedProvider = encodeURIComponent(provider);
    const encodedObjectId = encodeURIComponent(objectId);
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/search-sets/${slug}/objects/${encodedProvider}/${encodedObjectId}`,
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
  objectId: string,
): Promise<CollectionObjectDetail | null> {
  try {
    const encodedProvider = encodeURIComponent(provider);
    const encodedObjectId = encodeURIComponent(objectId);
    const response = await fetch(
      `http://127.0.0.1:${apiPort}/library/objects/${encodedProvider}/${encodedObjectId}`,
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
  if (provider === "vam") {
    return "V&A";
  }

  return provider.trim() || "Unknown";
}

function getActionProviderKey(formData: FormData): string {
  return getActionFormDataString(formData, "provider").trim() || "met";
}

async function createSearchSetAndCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const displayName = getActionFormDataString(formData, "display_name");
  const termsText = getActionFormDataString(formData, "terms_text");
  const provider = getActionProviderKey(formData);
  const batchTarget = normalizeBatchTarget(
    getActionFormDataValue(formData, "batch_target"),
  );
  const searchSetResponse = await fetch(`${apiBaseUrl}/search-sets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      display_name: displayName,
      terms_text: termsText,
      provider,
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
  const collectResponse = await fetch(`${apiBaseUrl}/search-sets/${searchSet.slug}/provider-collections/${encodeURIComponent(provider)}/collects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      batch_target: batchTarget,
    }),
  });

  revalidatePath("/");
  if (!collectResponse.ok) {
    await deleteCreatedCollectionAfterFailedInitialCollect({
      apiBaseUrl,
      slug: searchSet.slug,
    });
    redirect(`/?search_set=${searchSet.slug}&collect_notice=${COLLECT_STATE_CHANGED_NOTICE}`);
  }
  redirect(`/?search_set=${searchSet.slug}`);
}

async function startProviderCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const provider = getActionProviderKey(formData);
  const batchTarget = normalizeBatchTarget(
    getActionFormDataValue(formData, "batch_target"),
  );

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/${encodeURIComponent(provider)}/collects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      batch_target: batchTarget,
    }),
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_STATE_CHANGED_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
}

async function resumeProviderCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const provider = getActionProviderKey(formData);
  const batchTarget = normalizeBatchTarget(
    getActionFormDataValue(formData, "batch_target"),
  );

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/${encodeURIComponent(provider)}/collects/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      batch_target: batchTarget,
    }),
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_STATE_CHANGED_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
}

async function stopProviderCollect(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const provider = getActionProviderKey(formData);

  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/provider-collections/${encodeURIComponent(provider)}/collects/stop`, {
    method: "POST",
  });

  revalidatePath("/");
  if (!response.ok) {
    redirect(`/?search_set=${slug}&collect_notice=${COLLECT_STATE_CHANGED_NOTICE}`);
  }
  redirect(`/?search_set=${slug}`);
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
        action={createSearchSetAndCollect}
        existingCollections={existingCollections}
        serverError={serverError}
      />
    </div>
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

function ProviderSourceHeaderControls({
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
      <ProviderSourceActionRow
        action={{
          kind: "start",
          label: "Start search",
          showBatchTarget: true,
          disabled: false,
        }}
        actionAvailable={collectAvailable}
        batchTarget={DEFAULT_BATCH_TARGET}
        formAction={startProviderCollect}
        idPrefix={`${searchSet.slug}_met`}
        inline
        provider="met"
        searchSetSlug={searchSet.slug}
      />
    );
  }

  return (
    <>
      {providerCollections.map((providerCollection) => {
        const action = providerSearchAction(providerCollection.status);
        const submittableAction = isSubmittableProviderSearchAction(action) ? action : null;
        const actionAvailable =
          submittableAction !== null &&
          providerSearchActionAvailable({
            actionKind: submittableAction.kind,
            collectAvailable,
          });
        const formAction =
          submittableAction?.kind === "resume"
            ? resumeProviderCollect
            : submittableAction?.kind === "stop"
              ? stopProviderCollect
              : startProviderCollect;

        if (submittableAction === null) {
          return null;
        }

        return (
          <ProviderSourceActionRow
            action={submittableAction}
            actionAvailable={actionAvailable}
            batchTarget={providerCollection.batchTarget}
            formAction={formAction}
            idPrefix={`${searchSet.slug}_${providerCollection.provider}`}
            inline
            key={`${searchSet.slug}-${providerCollection.provider}`}
            provider={providerCollection.provider}
            searchSetSlug={searchSet.slug}
          />
        );
      })}
    </>
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
  const legacyObjectId = getFirstParam(resolvedSearchParams?.object_id)?.trim();
  const selectedObjectRoute =
    parseObjectRouteKey(getFirstParam(resolvedSearchParams?.object)) ??
    (legacyObjectProvider !== undefined &&
    legacyObjectId !== undefined &&
    legacyObjectId !== ""
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
  const libraryNoCollectionCounts =
    workspaceMode === "user-library"
      ? libraryCollectionFilter === "none"
        ? libraryLocalResultSet.counts
        : (
            await getLibraryLocalResultSet(
              apiPort,
              gridViewMode,
              localQueryText,
              providerFilter,
              favoriteOnly,
              "none",
              1,
            )
          ).counts
      : { objects: 0, images: 0 };
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
  const userLibraryUnscopedHref = createGridStateHref({
    favoriteOnly,
    libraryCollectionFilter: "all",
    localQueryText,
    provider: providerFilter,
    viewMode: gridViewMode,
    workspaceMode: "user-library",
  });
  const selectedDetailDeleteCompletionHref =
    workspaceMode === "user-library" &&
    libraryCollectionFilter === "none" &&
    ((selectedDetailKind === "image" && libraryImageAssets.length === 1) ||
      (selectedDetailKind !== "image" && libraryObjects.length === 1))
      ? userLibraryUnscopedHref
      : undefined;
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
        {collectNotice ? (
          <div className="mx-auto mb-5 max-w-7xl">
            <Alert>
              <CircleAlert />
              <AlertDescription>{collectNotice}</AlertDescription>
            </Alert>
          </div>
        ) : null}
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
            noCollectionCounts={libraryNoCollectionCounts}
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
                headerActionControls={
                  <ProviderSourceHeaderControls
                    collectAvailable={collectAvailable}
                    providerCollections={activeProviderCollections}
                    searchSet={activeSearchSet}
                  />
                }
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
            deleteCompletionHref={selectedDetailDeleteCompletionHref}
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
