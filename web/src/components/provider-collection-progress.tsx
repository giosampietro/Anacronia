type ProviderCollectionProgressProps = {
  importedImageCount: number;
};

export function ProviderCollectionProgress({
  importedImageCount,
}: ProviderCollectionProgressProps) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Images</span>
        <span className="text-sm font-medium">{importedImageCount}</span>
      </div>
    </div>
  );
}
