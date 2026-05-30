import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  BATCH_TARGET_OPTIONS,
  DEFAULT_BATCH_TARGET,
} from "@/lib/candidate-limits";

type BatchTargetControlProps = {
  idPrefix: string;
  defaultBatchTarget?: number;
};

export function BatchTargetControl({
  idPrefix,
  defaultBatchTarget = DEFAULT_BATCH_TARGET,
}: BatchTargetControlProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}_batch_target`}>Batch target</FieldLabel>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          defaultValue={defaultBatchTarget}
          id={`${idPrefix}_batch_target`}
          name="batch_target"
        >
          {BATCH_TARGET_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    </FieldGroup>
  );
}
