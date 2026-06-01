import { parseSearchTerms } from "./search-terms";

export type ExistingCollectionIdentity = {
  displayName: string;
  slug: string;
};

export function createCollectionSlug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeCollectionDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isDuplicateCollectionName(
  displayName: string,
  existingCollections: ExistingCollectionIdentity[],
): boolean {
  const normalizedName = normalizeCollectionDisplayName(displayName);
  const slug = createCollectionSlug(displayName);

  if (normalizedName === "" && slug === "") {
    return false;
  }

  return existingCollections.some((collection) => {
    return (
      normalizeCollectionDisplayName(collection.displayName) === normalizedName ||
      collection.slug === slug
    );
  });
}

export function canStartNewCollectionSearch(
  displayName: string,
  termsText: string,
  existingCollections: ExistingCollectionIdentity[] = [],
): boolean {
  return (
    displayName.trim() !== "" &&
    parseSearchTerms(termsText).length > 0 &&
    !isDuplicateCollectionName(displayName, existingCollections)
  );
}
