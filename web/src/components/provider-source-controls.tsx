import { Activity, CircleAlert, CircleCheck } from "lucide-react";

import { BatchTargetControl } from "@/components/batch-target-control";
import { ProviderSearchActionButton } from "@/components/provider-search-action-button";
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
import { DEFAULT_BATCH_TARGET } from "@/lib/candidate-limits";
import {
  providerSearchAction,
  providerSearchStatusClassName,
  type ProviderSearchAction,
} from "@/lib/collect-workflow";
import type {
  DashboardProviderCollectionView,
  DashboardSearchSetView,
} from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export type ProviderSourceFormAction = (formData: FormData) => Promise<void>;

type ProviderSourceControlsProps = {
  collectAvailable: boolean;
  providerCollections: DashboardProviderCollectionView[];
  resumeAction: ProviderSourceFormAction;
  searchSet: DashboardSearchSetView;
  startAction: ProviderSourceFormAction;
  stopAction: ProviderSourceFormAction;
};

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
  formAction: ProviderSourceFormAction;
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

export function ProviderSourceControls({
  collectAvailable,
  providerCollections,
  resumeAction,
  searchSet,
  startAction,
  stopAction,
}: ProviderSourceControlsProps) {
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
            formAction={startAction}
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
            ? resumeAction
            : submittableAction?.kind === "stop"
              ? stopAction
              : startAction;

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
