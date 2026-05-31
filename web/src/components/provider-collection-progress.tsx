import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";

type ProviderCollectionProgressProps = {
  batchTarget: number;
  importedObjectCount: number;
  importedImageCount: number;
};

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <Item className="px-0 py-0" size="xs">
      <ItemContent>
        <ItemTitle className="font-normal text-muted-foreground">
          {label}
        </ItemTitle>
      </ItemContent>
      <ItemContent className="flex-none items-end">
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </ItemContent>
    </Item>
  );
}

export function ProviderCollectionProgress({
  batchTarget,
  importedObjectCount,
  importedImageCount,
}: ProviderCollectionProgressProps) {
  return (
    <ItemGroup className="gap-3">
      <ProgressRow label="Objects" value={importedObjectCount} />
      <ProgressRow label="Images" value={importedImageCount} />
      <ProgressRow label="Batch target" value={batchTarget} />
    </ItemGroup>
  );
}
