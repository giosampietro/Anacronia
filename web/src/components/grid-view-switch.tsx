"use client";

import Link from "next/link";
import { Box, Images as ImagesIcon } from "lucide-react";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { GridViewMode } from "@/lib/grid-view";
import { cn } from "@/lib/utils";

type GridViewSwitchProps = {
  ariaLabel?: string;
  className?: string;
  countClassName?: string;
  imageCount?: number;
  imageHref: string;
  labelClassName?: string;
  objectCount?: number;
  objectHref: string;
  viewMode: GridViewMode;
};

function GridViewCount({
  className,
  count,
}: {
  className?: string;
  count: number;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      {count}
    </span>
  );
}

export function GridViewSwitch({
  ariaLabel = "Grid view",
  className,
  countClassName = "@max-[459px]/topbar:hidden",
  imageCount,
  imageHref,
  labelClassName = "@min-[700px]/topbar:inline",
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
        <Box data-icon="inline-start" />
        <span className={cn("hidden", labelClassName)}>Objects</span>
        {objectCount !== undefined ? (
          <GridViewCount className={countClassName} count={objectCount} />
        ) : null}
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-current={viewMode === "images" ? "page" : undefined}
        aria-label="Show Images"
        nativeButton={false}
        render={<Link href={imageHref} scroll={false} />}
        value="images"
      >
        <ImagesIcon data-icon="inline-start" />
        <span className={cn("hidden", labelClassName)}>Images</span>
        {imageCount !== undefined ? (
          <GridViewCount className={countClassName} count={imageCount} />
        ) : null}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
