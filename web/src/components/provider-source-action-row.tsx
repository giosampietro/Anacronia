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
  inline?: boolean;
  searchSetSlug: string;
};

export function ProviderSourceActionRow({
  action,
  actionAvailable,
  batchTarget,
  formAction,
  idPrefix,
  inline = false,
  searchSetSlug,
}: ProviderSourceActionRowProps) {
  const showBatchTarget = action.showBatchTarget && actionAvailable;

  return (
    <form
      action={formAction}
      className={cn(
        inline
          ? "flex min-w-0 shrink-0 items-center gap-1.5"
          : "border-t px-5 pt-5",
      )}
    >
      <input name="slug" type="hidden" value={searchSetSlug} />
      <div
        className={cn(
          inline ? "flex min-w-0 shrink-0 items-center gap-1.5" : "flex justify-end gap-3",
          showBatchTarget && !inline &&
            "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end",
        )}
      >
        {showBatchTarget ? (
          <BatchTargetControl
            defaultBatchTarget={batchTarget}
            idPrefix={idPrefix}
            inline={inline}
          />
        ) : null}
        <div className="flex shrink-0 justify-end">
          <ProviderSearchActionButton
            actionKind={action.kind}
            disabled={!actionAvailable}
            label={action.label}
            labelClassName={
              inline ? "@max-[559px]/topbar:hidden" : undefined
            }
            variant={action.kind === "stop" ? "outline" : "default"}
          />
        </div>
      </div>
    </form>
  );
}
