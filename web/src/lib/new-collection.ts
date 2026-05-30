import { parseSearchTerms } from "./search-terms";

export function canStartNewCollectionSearch(
  displayName: string,
  termsText: string,
): boolean {
  return displayName.trim() !== "" && parseSearchTerms(termsText).length > 0;
}
