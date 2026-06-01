import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { BatchTargetControl } from "@/components/batch-target-control";
import { CollectionExportForm } from "@/components/collection-export-form";
import { CollectionObjectDetailOverlay } from "@/components/collection-object-detail-overlay";
import {
  CollectionResultsGrid,
  createCollectionImageAssetTileId,
  createCollectionObjectTileId,
} from "@/components/collection-results-grid";
import { ImageAssetDetailOverlay } from "@/components/image-asset-detail-overlay";
import {
  NewCollectionForm,
  type NewCollectionServerError,
} from "@/components/new-collection-form";
import {
  ObjectDetailErrorOverlay,
} from "@/components/object-detail-pending-link";
import { ProviderSearchActionButton } from "@/components/provider-search-action-button";
import {
  createLibraryImageAssetHref,
  createLibraryImageAssetTileId,
  createLibraryObjectHref,
  createLibraryObjectTileId,
  UserLibraryWorkspace,
} from "@/components/user-library-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  Download,
} from "lucide-react";

import {
  createOperationalDashboardView,
  type DashboardProviderCollectionView,
  type DashboardSearchSetView,
  type OperationalDashboard,
} from "@/lib/dashboard";
import {
  type CollectionObjectDetail,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
  type LibraryObjectSummary,
} from "@/lib/collection-objects";
import { shouldAutoRefreshDashboard } from "@/lib/dashboard-refresh";
import { DEFAULT_BATCH_TARGET, normalizeBatchTarget } from "@/lib/candidate-limits";
import {
  collectionExportAvailability,
  exportArtifactSummary,
  exportSuccessLabel,
  type CollectionExportFormat,
} from "@/lib/export-workflow";
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
} from "@/lib/grid-view";
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
    export_error?: string | string[];
    export_format?: string | string[];
    export_path?: string | string[];
    export_rows?: string | string[];
    export_skipped?: string | string[];
    filter?: string | string[];
    image?: string | string[];
    image_asset_id?: string | string[];
    mode?: string | string[];
    object?: string | string[];
    object_id?: string | string[];
    object_provider?: string | string[];
    collection_error?: string | string[];
    search_set?: string | string[];
    view?: string | string[];
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

async function getCollectionImageAssets(
  apiPort: number,
  slug: string,
): Promise<LibraryImageAssetSummary[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/image-assets`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { image_assets: LibraryImageAssetSummary[] };
    return payload.image_assets;
  } catch {
    return [];
  }
}

async function getLibraryObjects(
  apiPort: number,
  filterText: string,
): Promise<LibraryObjectSummary[]> {
  const params = new URLSearchParams();
  if (filterText.trim() !== "") {
    params.set("filter", filterText.trim());
  }
  const query = params.toString();
  const path = query === "" ? "/library/objects" : `/library/objects?${query}`;

  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { objects: LibraryObjectSummary[] };
    return payload.objects;
  } catch {
    return [];
  }
}

async function getLibraryImageAssets(
  apiPort: number,
  filterText: string,
): Promise<LibraryImageAssetSummary[]> {
  const params = new URLSearchParams();
  if (filterText.trim() !== "") {
    params.set("filter", filterText.trim());
  }
  const query = params.toString();
  const path = query === "" ? "/library/image-assets" : `/library/image-assets?${query}`;

  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { image_assets: LibraryImageAssetSummary[] };
    return payload.image_assets;
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
  collectionObject: CollectionObjectSummary | LibraryImageAssetSummary,
  filterText: string,
  viewMode: GridViewMode,
): string {
  return createGridStateHref({
    filterText,
    object: {
      objectId: collectionObject.object_id,
      provider: collectionObject.provider,
    },
    searchSetSlug: slug,
    viewMode,
    workspaceMode: "search-set",
  });
}

function createCollectionImageAssetHref(
  slug: string,
  imageAsset: LibraryImageAssetSummary,
  filterText: string,
): string {
  return createGridStateHref({
    filterText,
    imageAssetId: imageAsset.image_asset_id,
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

type CollectionExportResponse = {
  format: CollectionExportFormat;
  export_path: string;
  row_count: number;
  skipped_image_asset_count: number;
};

function collectionExportFormatFromParam(value: string): CollectionExportFormat | undefined {
  if (value === "jsonl" || value === "csv" || value === "package") {
    return value;
  }

  return undefined;
}

function exportErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    payload.detail &&
    typeof payload.detail === "object" &&
    "message" in payload.detail &&
    typeof payload.detail.message === "string"
  ) {
    return payload.detail.message;
  }

  return "Export failed.";
}

async function exportSearchSet(formData: FormData) {
  "use server";

  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const slug = getActionFormDataString(formData, "slug");
  const exportFormat = getActionFormDataString(formData, "export_format");
  const params = new URLSearchParams({ search_set: slug });
  const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/exports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ format: exportFormat }),
  });
  const payload = (await response.json()) as CollectionExportResponse | unknown;

  revalidatePath("/");
  if (!response.ok) {
    params.set("export_error", exportErrorMessage(payload));
    redirect(`/?${params.toString()}`);
  }

  const exportResponse = payload as CollectionExportResponse;
  params.set("export_format", exportResponse.format);
  params.set("export_path", exportResponse.export_path);
  params.set("export_rows", String(exportResponse.row_count));
  if (exportResponse.skipped_image_asset_count > 0) {
    params.set("export_skipped", String(exportResponse.skipped_image_asset_count));
  }
  redirect(`/?${params.toString()}`);
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

function CollectionExportControls({
  available,
  error,
  exportFormat,
  exportPath,
  rowCount,
  reason,
  searchSetSlug,
  skippedCount,
}: {
  available: boolean;
  error: string;
  exportFormat?: CollectionExportFormat;
  exportPath: string;
  rowCount: string;
  reason: string;
  searchSetSlug: string;
  skippedCount: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Export</CardTitle>
          <CardDescription>Current Collection</CardDescription>
        </div>
        <CardAction>
          <Download className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
        {exportPath ? (
          <Alert>
            <CircleCheck />
            <AlertTitle>
              {exportFormat ? exportSuccessLabel(exportFormat) : "Export ready"}
            </AlertTitle>
            <AlertDescription>
              {exportFormat && rowCount ? (
                <p>{exportArtifactSummary({ format: exportFormat, rowCount })}</p>
              ) : null}
              <p className="mt-1 break-all font-mono text-xs">{exportPath}</p>
              {skippedCount ? (
                <p className="mt-2 text-xs">
                  {skippedCount} Image Asset{skippedCount === "1" ? "" : "s"} skipped. See
                  export-warnings.json in the export folder.
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Export failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <CollectionExportForm
          action={exportSearchSet}
          available={available}
          initialOpen={Boolean(error)}
          searchSetSlug={searchSetSlug}
        />
      </CardFooter>
    </Card>
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
  const filterText = getFirstParam(resolvedSearchParams?.filter) ?? "";
  const collectNoticeCode = getFirstParam(resolvedSearchParams?.collect_notice);
  const collectionErrorCode = getFirstParam(resolvedSearchParams?.collection_error);
  const exportError = getFirstParam(resolvedSearchParams?.export_error) ?? "";
  const exportFormat = collectionExportFormatFromParam(
    getFirstParam(resolvedSearchParams?.export_format) ?? "",
  );
  const exportPath = getFirstParam(resolvedSearchParams?.export_path) ?? "";
  const exportRows = getFirstParam(resolvedSearchParams?.export_rows) ?? "";
  const exportSkipped = getFirstParam(resolvedSearchParams?.export_skipped) ?? "";
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
  const exportAvailability =
    activeSearchSet === null
      ? { available: false, reason: "" }
      : collectionExportAvailability({
          importedImageCount: activeSearchSet.importedImageCount,
          providerStatuses: activeProviderCollections.map(
            (providerCollection) => providerCollection.status,
          ),
        });
  const collectNotice = collectNoticeFromCode(collectNoticeCode, activeProviderCollections);
  const collectionObjects =
    activeSearchSet === null || workspaceMode !== "search-set"
      ? []
      : await getCollectionObjects(apiPort, activeSearchSet.slug);
  const collectionImageAssets =
    activeSearchSet === null || workspaceMode !== "search-set"
      ? []
      : await getCollectionImageAssets(apiPort, activeSearchSet.slug);
  const libraryObjects =
    workspaceMode === "user-library"
      ? await getLibraryObjects(apiPort, filterText)
      : [];
  const libraryImageAssets =
    workspaceMode === "user-library"
      ? await getLibraryImageAssets(apiPort, filterText)
      : [];
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
  const selectedLibraryObject =
    workspaceMode === "user-library" && selectedObjectRoute !== null
      ? libraryObjects.find(
          (libraryObject) =>
            libraryObject.provider === selectedObjectRoute.provider &&
            libraryObject.object_id === selectedObjectRoute.objectId,
        ) ?? null
      : null;
  const selectedObjectDetailSearchSetSlug: string | null =
    workspaceMode === "search-set"
      ? activeSearchSet?.slug ?? null
      : workspaceMode === "user-library"
        ? activeSearchSetSlug !== undefined &&
          activeSearchSet?.slug === activeSearchSetSlug
          ? activeSearchSet.slug
          : selectedLibraryObject?.collections[0]?.slug ?? null
        : null;
  const shouldLoadSelectedObjectDetail =
    selectedDetailKind === "object" &&
    selectedObjectDetailSearchSetSlug !== null &&
    selectedObjectRoute !== null;
  const selectedObjectDetail =
    shouldLoadSelectedObjectDetail
      ? await getCollectionObjectDetail(
          apiPort,
          selectedObjectDetailSearchSetSlug,
          selectedObjectRoute.provider,
          selectedObjectRoute.objectId,
        )
      : null;
  const selectedImageDetailLoadFailed =
    selectedDetailKind === "image" &&
    Number.isFinite(selectedImageAssetId) &&
    selectedActiveImageAsset === null;
  const selectedObjectCloseHref =
    workspaceMode === "user-library"
      ? createGridStateHref({
          filterText,
          viewMode: gridViewMode,
          workspaceMode: "user-library",
        })
      : selectedObjectDetailSearchSetSlug !== null
        ? createGridStateHref({
            filterText,
            searchSetSlug: selectedObjectDetailSearchSetSlug,
            viewMode: gridViewMode,
            workspaceMode: "search-set",
          })
        : "/";
  const selectedImageCloseHref =
    workspaceMode === "user-library"
      ? createGridStateHref({
          filterText,
          viewMode: gridViewMode,
          workspaceMode: "user-library",
        })
      : activeSearchSet !== null
        ? createGridStateHref({
            filterText,
            searchSetSlug: activeSearchSet.slug,
            viewMode: gridViewMode,
            workspaceMode: "search-set",
          })
        : "/";
  const selectedObjectReturnFocusId =
    selectedObjectRoute === null
      ? ""
      : workspaceMode === "user-library"
        ? createLibraryObjectTileId(
            selectedObjectRoute.provider,
            selectedObjectRoute.objectId,
          )
        : createCollectionObjectTileId(
            selectedObjectRoute.provider,
            selectedObjectRoute.objectId,
          );
  const selectedImageReturnFocusId =
    Number.isFinite(selectedImageAssetId)
      ? workspaceMode === "user-library"
        ? createLibraryImageAssetTileId(selectedImageAssetId)
        : createCollectionImageAssetTileId(selectedImageAssetId)
      : "";
  const selectedObjectLabel =
    selectedObjectRoute !== null
      ? `${objectProviderDisplayLabel(selectedObjectRoute.provider)} object ${selectedObjectRoute.objectId}`
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
    selectedObjectDetailSearchSetSlug !== null &&
    selectedObjectRoute !== null
      ? createAdjacentObjectHrefs({
          currentObjectId: selectedObjectRoute.objectId,
          currentProvider: selectedObjectRoute.provider,
          items: collectionObjects,
          createHref: (collectionObject) =>
            createCollectionObjectHref(
              selectedObjectDetailSearchSetSlug,
              collectionObject,
              filterText,
              gridViewMode,
            ),
        })
      : workspaceMode === "user-library" &&
          selectedObjectRoute !== null
        ? createAdjacentObjectHrefs({
            currentObjectId: selectedObjectRoute.objectId,
            currentProvider: selectedObjectRoute.provider,
            items: libraryObjects,
            createHref: (libraryObject) =>
              createLibraryObjectHref(libraryObject, filterText, gridViewMode),
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
                  filterText,
                )
              : createLibraryImageAssetHref(imageAsset, filterText),
          isCurrentItem: (imageAsset) =>
            imageAsset.image_asset_id === selectedActiveImageAsset.image_asset_id,
        })
      : { nextObjectHref: null, previousObjectHref: null };
  const selectedImageObjectHref =
    selectedActiveImageAsset !== null
      ? workspaceMode === "search-set" && activeSearchSet !== null
        ? createCollectionObjectHref(
            activeSearchSet.slug,
            selectedActiveImageAsset,
            filterText,
            gridViewMode,
          )
        : createLibraryObjectHref(selectedActiveImageAsset, filterText, gridViewMode)
      : "/";
  const selectedObjectCollectionLabels =
    workspaceMode === "user-library"
      ? selectedLibraryObject?.collections.map(
          (collection) => collection.display_name,
        ) ?? []
      : activeSearchSet
        ? [activeSearchSet.displayName]
        : [];
  const contentHeaderObjectCount =
    workspaceMode === "user-library"
      ? libraryObjects.length
      : activeSearchSet?.importedObjectCount ?? 0;
  const contentHeaderImageCount =
    workspaceMode === "user-library"
      ? libraryImageAssets.length
      : activeSearchSet?.importedImageCount ?? 0;
  const gridViewObjectHref =
    workspaceMode === "search-set" && activeSearchSet !== null
      ? createGridStateHref({
          filterText,
          searchSetSlug: activeSearchSet.slug,
          viewMode: "objects",
          workspaceMode: "search-set",
        })
      : workspaceMode === "user-library"
        ? createGridStateHref({
            filterText,
            viewMode: "objects",
            workspaceMode: "user-library",
          })
        : undefined;
  const gridViewImageHref =
    workspaceMode === "search-set" && activeSearchSet !== null
      ? createGridStateHref({
          filterText,
          searchSetSlug: activeSearchSet.slug,
          viewMode: "images",
          workspaceMode: "search-set",
        })
      : workspaceMode === "user-library"
        ? createGridStateHref({
            filterText,
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
      filterText={filterText}
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
            filterText={filterText}
            gridViewMode={gridViewMode}
            imageAssets={libraryImageAssets}
            imageCount={dashboardView.libraryImageCount}
            objects={libraryObjects}
            resolvedImageAssetId={
              selectedImageDetailResolved && Number.isFinite(selectedImageAssetId)
                ? selectedImageAssetId
                : null
            }
            resolvedObject={selectedObjectDetailResolved ? selectedObjectRoute : null}
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

              <div className="xl:col-span-2">
                <CollectionExportControls
                  available={exportAvailability.available}
                  error={exportError}
                  exportFormat={exportFormat}
                  exportPath={exportPath}
                  rowCount={exportRows}
                  reason={exportAvailability.reason}
                  searchSetSlug={activeSearchSet.slug}
                  skippedCount={exportSkipped}
                />
              </div>
            </section>

            <section>
              <CollectionResultsGrid
                apiBaseUrl={apiBaseUrl}
                closeImageHref={createGridStateHref({
                  filterText,
                  searchSetSlug: activeSearchSet.slug,
                  viewMode: "images",
                  workspaceMode: "search-set",
                })}
                closeObjectHref={createGridStateHref({
                  filterText,
                  searchSetSlug: activeSearchSet.slug,
                  viewMode: gridViewMode,
                  workspaceMode: "search-set",
                })}
                collectionDisplayName={activeSearchSet.displayName}
                createImageAssetHref={(imageAsset) =>
                  createCollectionImageAssetHref(
                    activeSearchSet.slug,
                    imageAsset,
                    filterText,
                  )
                }
                createObjectHref={(collectionObject) =>
                  createCollectionObjectHref(
                    activeSearchSet.slug,
                    collectionObject,
                    filterText,
                    gridViewMode,
                  )
                }
                imageAssets={collectionImageAssets}
                objects={collectionObjects}
                resolvedImageAssetId={
                  selectedImageDetailResolved && Number.isFinite(selectedImageAssetId)
                    ? selectedImageAssetId
                    : null
                }
                resolvedObject={selectedObjectDetailResolved ? selectedObjectRoute : null}
                viewMode={gridViewMode}
              />
            </section>
          </div>
        )}
        {selectedObjectDetail ? (
          <CollectionObjectDetailOverlay
            apiBaseUrl={apiBaseUrl}
            closeHref={selectedObjectCloseHref}
            collectionLabels={selectedObjectCollectionLabels}
            detail={selectedObjectDetail}
            key={`${selectedObjectDetail.object.provider}-${selectedObjectDetail.object.object_id}`}
            nextObjectHref={selectedObjectNavigationHrefs.nextObjectHref}
            previousObjectHref={selectedObjectNavigationHrefs.previousObjectHref}
            returnFocusId={selectedObjectReturnFocusId}
          />
        ) : selectedObjectDetailLoadFailed ? (
          <ObjectDetailErrorOverlay
            closeHref={selectedObjectCloseHref}
            objectLabel={selectedObjectLabel}
            returnFocusId={selectedObjectReturnFocusId}
          />
        ) : selectedActiveImageAsset ? (
          <ImageAssetDetailOverlay
            apiBaseUrl={apiBaseUrl}
            closeHref={selectedImageCloseHref}
            imageAsset={selectedActiveImageAsset}
            key={selectedActiveImageAsset.image_asset_id}
            nextImageHref={selectedImageNavigationHrefs.nextObjectHref}
            objectHref={selectedImageObjectHref}
            previousImageHref={selectedImageNavigationHrefs.previousObjectHref}
            returnFocusId={selectedImageReturnFocusId}
          />
        ) : selectedImageDetailLoadFailed ? (
          <ObjectDetailErrorOverlay
            closeHref={selectedImageCloseHref}
            objectLabel={selectedImageLabel}
            returnFocusId={selectedImageReturnFocusId}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
