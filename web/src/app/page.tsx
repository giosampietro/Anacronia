import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { BatchTargetControl } from "@/components/batch-target-control";
import { CollectionExportForm } from "@/components/collection-export-form";
import { CollectionObjectDetailOverlay } from "@/components/collection-object-detail-overlay";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import { NewCollectionForm } from "@/components/new-collection-form";
import {
  ObjectDetailErrorOverlay,
  ObjectDetailPendingLink,
} from "@/components/object-detail-pending-link";
import { ProviderSearchActionButton } from "@/components/provider-search-action-button";
import {
  createLibraryImageAssetHref,
  createLibraryImageAssetTileId,
  UserLibraryWorkspace,
} from "@/components/user-library-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AspectRatio } from "@/components/ui/aspect-ratio";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
  Database,
  Download,
  Images,
} from "lucide-react";

import {
  createOperationalDashboardView,
  type DashboardProviderCollectionView,
  type DashboardSearchSetView,
  type OperationalDashboard,
} from "@/lib/dashboard";
import {
  imageUrl,
  type CollectionObjectDetail,
  type CollectionObjectSummary,
  type LibraryImageAssetSummary,
} from "@/lib/collection-objects";
import {
  IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
  IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME,
  IMAGE_GRID_TILE_CLASS_NAME,
} from "@/lib/image-grid-style";
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
  createUserLibraryHref,
  createWorkspaceMode,
  getFirstParam,
} from "@/lib/workspace";
import { createAdjacentObjectHrefs } from "@/lib/object-navigation";

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
    image_asset_id?: string | string[];
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

function objectProviderDisplayLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
}

function countLibraryObjects(imageAssets: LibraryImageAssetSummary[]): number {
  return new Set(
    imageAssets.map((imageAsset) => `${imageAsset.provider}:${imageAsset.object_id}`),
  ).size;
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

function NewSearchSetWorkspace({ collectAvailable }: { collectAvailable: boolean }) {
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
      <NewCollectionForm action={createSearchSetAndCollectFromMet} />
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
  const exportError = getFirstParam(resolvedSearchParams?.export_error) ?? "";
  const exportFormat = collectionExportFormatFromParam(
    getFirstParam(resolvedSearchParams?.export_format) ?? ""
  );
  const exportPath = getFirstParam(resolvedSearchParams?.export_path) ?? "";
  const exportRows = getFirstParam(resolvedSearchParams?.export_rows) ?? "";
  const exportSkipped = getFirstParam(resolvedSearchParams?.export_skipped) ?? "";
  const requestedWorkspaceMode = getFirstParam(resolvedSearchParams?.mode);
  const activeSearchSetSlug = getFirstParam(resolvedSearchParams?.search_set);
  const selectedObjectProvider = getFirstParam(resolvedSearchParams?.object_provider);
  const selectedObjectId = Number.parseInt(
    getFirstParam(resolvedSearchParams?.object_id) ?? "",
    10,
  );
  const selectedImageAssetId = Number.parseInt(
    getFirstParam(resolvedSearchParams?.image_asset_id) ?? "",
    10,
  );
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
  const rows = createStatusRows({ uiPort, apiPort, apiHealth });
  const activeSearchSet = dashboardView.activeSearchSet;
  const collectAvailable = canStartCollect(dashboardView.workerStatus);
  const workspaceMode = createWorkspaceMode(requestedWorkspaceMode, activeSearchSet);
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
  const libraryImageAssets =
    workspaceMode === "user-library"
      ? await getLibraryImageAssets(apiPort, filterText)
      : [];
  const selectedLibraryImageAsset =
    workspaceMode === "user-library" && Number.isFinite(selectedImageAssetId)
      ? libraryImageAssets.find(
          (imageAsset) => imageAsset.image_asset_id === selectedImageAssetId,
        ) ?? null
      : null;
  const selectedObjectDetailSearchSetSlug: string | null =
    workspaceMode === "search-set"
      ? activeSearchSet?.slug ?? null
      : workspaceMode === "user-library" &&
          activeSearchSetSlug !== undefined &&
          activeSearchSet?.slug === activeSearchSetSlug
        ? activeSearchSet.slug
        : null;
  const shouldLoadSelectedObjectDetail =
    selectedObjectDetailSearchSetSlug !== null &&
    selectedObjectProvider !== undefined &&
    Number.isFinite(selectedObjectId);
  const selectedObjectDetail =
    shouldLoadSelectedObjectDetail
      ? await getCollectionObjectDetail(
          apiPort,
          selectedObjectDetailSearchSetSlug,
          selectedObjectProvider,
          selectedObjectId,
        )
      : null;
  const selectedObjectCloseHref =
    workspaceMode === "user-library"
      ? createUserLibraryHref(filterText)
      : selectedObjectDetailSearchSetSlug !== null
        ? createCloseObjectHref(selectedObjectDetailSearchSetSlug, filterText)
        : "/";
  const selectedObjectReturnFocusId =
    workspaceMode === "user-library" && Number.isFinite(selectedImageAssetId)
      ? createLibraryImageAssetTileId(selectedImageAssetId)
      : selectedObjectProvider !== undefined && Number.isFinite(selectedObjectId)
        ? createCollectionObjectTileId(selectedObjectProvider, selectedObjectId)
        : "";
  const selectedObjectLabel =
    selectedObjectProvider !== undefined && Number.isFinite(selectedObjectId)
      ? `${objectProviderDisplayLabel(selectedObjectProvider)} object ${selectedObjectId}`
      : "Selected object";
  const selectedObjectDetailLoadFailed =
    shouldLoadSelectedObjectDetail && selectedObjectDetail === null;
  const selectedObjectDetailResolved =
    selectedObjectDetail !== null || selectedObjectDetailLoadFailed;
  const selectedObjectNavigationHrefs =
    workspaceMode === "search-set" &&
    selectedObjectDetailSearchSetSlug !== null &&
    selectedObjectProvider !== undefined &&
    Number.isFinite(selectedObjectId)
      ? createAdjacentObjectHrefs({
          currentObjectId: selectedObjectId,
          currentProvider: selectedObjectProvider,
          items: collectionObjects,
          createHref: (collectionObject) =>
            createCollectionObjectHref(
              selectedObjectDetailSearchSetSlug,
              collectionObject,
              filterText,
            ),
        })
      : workspaceMode === "user-library" && selectedLibraryImageAsset !== null
        ? createAdjacentObjectHrefs({
            currentObjectId: selectedLibraryImageAsset.object_id,
            currentProvider: selectedLibraryImageAsset.provider,
            items: libraryImageAssets,
            createHref: (imageAsset) =>
              createLibraryImageAssetHref(imageAsset, filterText),
            isCurrentItem: (imageAsset) =>
              imageAsset.image_asset_id === selectedLibraryImageAsset.image_asset_id,
          })
        : { nextObjectHref: null, previousObjectHref: null };
  const selectedObjectCollectionLabels =
    workspaceMode === "user-library"
      ? selectedLibraryImageAsset?.collections.map(
          (collection) => collection.display_name,
        ) ?? []
      : activeSearchSet
        ? [activeSearchSet.displayName]
        : [];
  const contentHeaderObjectCount =
    workspaceMode === "user-library"
      ? countLibraryObjects(libraryImageAssets)
      : activeSearchSet?.importedObjectCount ?? 0;
  const contentHeaderImageCount =
    workspaceMode === "user-library"
      ? libraryImageAssets.length
      : activeSearchSet?.importedImageCount ?? 0;

  return (
    <AppShell
      activeSearchSetSlug={activeSearchSet?.slug ?? null}
      appVersionStamp={appVersionStamp}
      collectAvailable={collectAvailable}
      contentHeaderImageCount={contentHeaderImageCount}
      contentHeaderObjectCount={contentHeaderObjectCount}
      dashboardView={dashboardView}
      filterText={filterText}
      rows={rows}
      workspaceMode={workspaceMode}
    >
      <DashboardAutoRefresh enabled={shouldAutoRefreshDashboard(dashboardView.workerStatus)} />
      <div className="min-w-0 px-5 py-6 md:px-8 lg:px-10 lg:py-9">
        {workspaceMode === "new-search-set" ? (
          <NewSearchSetWorkspace collectAvailable={collectAvailable} />
        ) : workspaceMode === "user-library" ? (
          <UserLibraryWorkspace
            apiBaseUrl={apiBaseUrl}
            filterText={filterText}
            imageAssets={libraryImageAssets}
            imageCount={dashboardView.libraryImageCount}
            resolvedImageAssetId={
              workspaceMode === "user-library" &&
              selectedObjectDetailResolved &&
              Number.isFinite(selectedImageAssetId)
                ? selectedImageAssetId
                : null
            }
          />
        ) : activeSearchSet === null ? (
          <NewSearchSetWorkspace collectAvailable={collectAvailable} />
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
              <Card className="min-w-0">
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>Results</CardTitle>
                    <CardDescription>
                      Local Museum Objects in this Collection
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
                    <div className={IMAGE_GRID_CLASS_NAME}>
                      {collectionObjects.map((collectionObject) => {
                        const collectionObjectProviderLabel =
                          objectProviderDisplayLabel(collectionObject.provider);
                        const tileId = createCollectionObjectTileId(
                          collectionObject.provider,
                          collectionObject.object_id,
                        );
                        const thumbSrc = imageUrl(
                          apiBaseUrl,
                          collectionObject.cover_thumb_url,
                        );
                        const objectAlt =
                          collectionObject.title ||
                          `${collectionObjectProviderLabel} object ${collectionObject.object_id}`;
                        const tileStateKey =
                          selectedObjectDetailResolved &&
                          selectedObjectProvider === collectionObject.provider &&
                          selectedObjectId === collectionObject.object_id
                            ? "resolved"
                            : "grid";

                        return (
                          <ObjectDetailPendingLink
                            ariaLabel={`Open ${collectionObjectProviderLabel} object ${collectionObject.object_id}`}
                            className={IMAGE_GRID_TILE_CLASS_NAME}
                            closeHref={createCloseObjectHref(
                              activeSearchSet.slug,
                              filterText,
                            )}
                            href={createCollectionObjectHref(
                              activeSearchSet.slug,
                              collectionObject,
                              filterText,
                            )}
                            id={tileId}
                            key={`${collectionObject.provider}-${collectionObject.object_id}-${tileStateKey}`}
                            preview={{
                              alt: objectAlt,
                              collectionLabel: activeSearchSet.displayName,
                              height: collectionObject.cover_original_height,
                              imageCount: collectionObject.image_count,
                              providerLabel: collectionObjectProviderLabel,
                              src: thumbSrc,
                              title: collectionObject.title || "Untitled object",
                              width: collectionObject.cover_original_width,
                            }}
                          >
                            <AspectRatio ratio={4 / 5}>
                              <ImageGridThumbnail alt={objectAlt} src={thumbSrc} />
                              {collectionObject.has_sibling_images ? (
                                <span
                                  aria-label={`${collectionObject.image_count} images`}
                                  className={IMAGE_GRID_CAROUSEL_INDICATOR_CLASS_NAME}
                                >
                                  <Images data-icon="inline-start" />
                                  {collectionObject.image_count}
                                </span>
                              ) : null}
                              <Badge
                                className={IMAGE_GRID_PROVIDER_BADGE_CLASS_NAME}
                                variant="secondary"
                              >
                                {collectionObjectProviderLabel}
                              </Badge>
                              <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                                <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                                  {collectionObject.title || "Untitled object"}
                                </p>
                              </div>
                            </AspectRatio>
                          </ObjectDetailPendingLink>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
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
        ) : null}
      </div>
    </AppShell>
  );
}
