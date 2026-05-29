export const DEFAULT_CANDIDATE_LIMIT = 100;
export const MAX_CANDIDATE_LIMIT = 500;

export function normalizeCandidateLimit(value: FormDataEntryValue | number | null): number {
  if (value === null || value === "") {
    return DEFAULT_CANDIDATE_LIMIT;
  }

  const parsed = Number(value ?? DEFAULT_CANDIDATE_LIMIT);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CANDIDATE_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_CANDIDATE_LIMIT);
}
