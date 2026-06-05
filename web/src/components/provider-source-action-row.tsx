import { BatchTargetControl } from "@/components/batch-target-control";
import { ProviderSearchActionButton } from "@/components/provider-search-action-button";
import type { ProviderSearchAction } from "@/lib/collect-workflow";
import { cn } from "@/lib/utils";

type SubmittableProviderSearchAction = ProviderSearchAction & {
  kind: "start" | "stop" | "resume";
};

type ProviderSourceActionRowProps = {
  action: SubmittableProviderSearchAction;
  actionAvailable: boolean;
  batchTarget: number;
  formAction: (formData: FormData) => Promise<void>;
  idPrefix: string;
  searchSetSlug: string;
};

export function ProviderSourceActionRow({
  action,
  actionAvailable,
  batchTarget,
  formAction,
  idPrefix,
  searchSetSlug,
}: ProviderSourceActionRowProps) {
  const showBatchTarget = action.showBatchTarget && actionAvailable;

  return (
    <form action={formAction} className="border-t px-5 pt-5">
      <input name="slug" type="hidden" value={searchSetSlug} />
      <div
        className={cn(
          "flex justify-end gap-3",
          showBatchTarget &&
            "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end",
        )}
      >
        {showBatchTarget ? (
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
