export const DEFAULT_CANDIDATE_OFFSET = 0;
export const DEFAULT_CANDIDATE_LIMIT = 1000;
export const DEFAULT_MAX_IMAGES_PER_OBJECT = 3;

export function normalizeCandidateOffset(value: FormDataEntryValue | number | null): number {
  return normalizeWholeNumber(value, DEFAULT_CANDIDATE_OFFSET, 0);
}

export function normalizeCandidateLimit(value: FormDataEntryValue | number | null): number {
  return normalizeWholeNumber(value, DEFAULT_CANDIDATE_LIMIT, 1);
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
