export type ProviderSourceFooterLayout = "inline" | "stacked";

export function providerSourceFooterClassName(
  layout: ProviderSourceFooterLayout,
): string {
  const base = "border-t";

  if (layout === "stacked") {
    return `${base} flex-col items-stretch gap-4`;
  }

  return `${base} justify-end`;
}
