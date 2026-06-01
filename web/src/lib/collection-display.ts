export function formatCollectionDisplayName(displayName: string): string {
  const normalizedName = displayName.trim().replace(/\s+/g, " ");

  if (normalizedName === "") {
    return "Collection";
  }

  return normalizedName.toLocaleLowerCase().replace(
    /(^|[\s/_-])(\S)/g,
    (_match, prefix: string, character: string) =>
      `${prefix}${character.toLocaleUpperCase()}`,
  );
}
