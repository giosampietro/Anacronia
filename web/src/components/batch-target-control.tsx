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
};

export function BatchTargetControl({
  idPrefix,
  defaultBatchTarget = DEFAULT_BATCH_TARGET,
}: BatchTargetControlProps) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}_batch_target`}>Images to find</FieldLabel>
        <NativeSelect
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
