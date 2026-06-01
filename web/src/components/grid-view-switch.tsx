"use client";

import Link from "next/link";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { GridViewMode } from "@/lib/grid-view";

type GridViewSwitchProps = {
  ariaLabel?: string;
  className?: string;
  imageCount?: number;
  imageHref: string;
  objectCount?: number;
  objectHref: string;
  viewMode: GridViewMode;
};

function GridViewCount({ count }: { count: number }) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}

export function GridViewSwitch({
  ariaLabel = "Grid view",
  className,
  imageCount,
  imageHref,
  objectCount,
  objectHref,
  viewMode,
}: GridViewSwitchProps) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      className={className}
      size="sm"
      spacing={0}
      value={[viewMode]}
      variant="outline"
    >
      <ToggleGroupItem
        aria-current={viewMode === "objects" ? "page" : undefined}
        aria-label="Show Objects"
        nativeButton={false}
        render={<Link href={objectHref} scroll={false} />}
        value="objects"
      >
        Objects
        {objectCount !== undefined ? <GridViewCount count={objectCount} /> : null}
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-current={viewMode === "images" ? "page" : undefined}
        aria-label="Show Images"
        nativeButton={false}
        render={<Link href={imageHref} scroll={false} />}
        value="images"
      >
        Images
        {imageCount !== undefined ? <GridViewCount count={imageCount} /> : null}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
