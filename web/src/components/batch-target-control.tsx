import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  BATCH_TARGET_OPTIONS,
  DEFAULT_BATCH_TARGET,
} from "@/lib/candidate-limits";

type BatchTargetControlProps = {
  idPrefix: string;
  defaultBatchTarget?: number;
  inline?: boolean;
  showLabel?: boolean;
};

export function BatchTargetControl({
  idPrefix,
  defaultBatchTarget = DEFAULT_BATCH_TARGET,
  inline = false,
  showLabel = true,
}: BatchTargetControlProps) {
  if (inline) {
    return (
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 @max-[559px]/topbar:hidden">
        <label className="sr-only" htmlFor={`${idPrefix}_batch_target`}>
          Images to find
        </label>
        <NativeSelect
          aria-label="Images to find"
          className="w-24 @min-[900px]/topbar:w-28"
          defaultValue={defaultBatchTarget}
          id={`${idPrefix}_batch_target`}
          name="batch_target"
          size="sm"
        >
          {BATCH_TARGET_OPTIONS.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option} images
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    );
  }

  return (
    <FieldGroup>
      <Field>
        {showLabel ? (
          <FieldLabel htmlFor={`${idPrefix}_batch_target`}>
            Images to find
          </FieldLabel>
        ) : null}
        <NativeSelect
          aria-label={showLabel ? undefined : "Image count"}
          className="w-full"
          defaultValue={defaultBatchTarget}
          id={`${idPrefix}_batch_target`}
          name="batch_target"
        >
          {BATCH_TARGET_OPTIONS.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option} images
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </FieldGroup>
  );
}
