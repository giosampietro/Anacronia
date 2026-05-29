export const BATCH_TARGET_OPTIONS = [100, 500, 1000] as const;
export type BatchTarget = (typeof BATCH_TARGET_OPTIONS)[number];
export const DEFAULT_BATCH_TARGET: BatchTarget = 100;
export const DEFAULT_MAX_IMAGES_PER_OBJECT = 3;

export function normalizeBatchTarget(value: FormDataEntryValue | number | null): BatchTarget {
  const parsed = normalizeWholeNumber(value, DEFAULT_BATCH_TARGET, 1);
  return BATCH_TARGET_OPTIONS.includes(parsed as BatchTarget)
    ? (parsed as BatchTarget)
    : DEFAULT_BATCH_TARGET;
}

export function normalizeMaxImagesPerObject(value: FormDataEntryValue | number | null): number {
  return Math.min(
    normalizeWholeNumber(value, DEFAULT_MAX_IMAGES_PER_OBJECT, 1),
    DEFAULT_MAX_IMAGES_PER_OBJECT,
  );
}

function normalizeWholeNumber(
  value: FormDataEntryValue | number | null,
  defaultValue: number,
  minimumValue: number,
): number {
  if (value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value ?? defaultValue);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(Math.trunc(parsed), minimumValue);
}
