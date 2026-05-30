"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import type { DashboardSearchSetView } from "@/lib/dashboard";
import type { WorkspaceMode } from "@/lib/workspace";
import { createSearchSetHref, filterSearchSets } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";

type SidebarCollectionFilterProps = {
  activeSearchSetSlug: string | null;
  initialFilterText: string;
  searchSets: DashboardSearchSetView[];
  workspaceMode: WorkspaceMode;
};

export function SidebarCollectionFilter({
  activeSearchSetSlug,
  initialFilterText,
  searchSets,
  workspaceMode,
}: SidebarCollectionFilterProps) {
  const [filterText, setFilterText] = useState(initialFilterText);
  const filteredSearchSets = useMemo(
    () => filterSearchSets(searchSets, filterText),
    [filterText, searchSets],
  );

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Filter Collections"
          className="pl-9"
          onChange={(event) => setFilterText(event.currentTarget.value)}
          placeholder="Filter by title or term"
          value={filterText}
        />
      </div>

      <div className="flex flex-col gap-2">
        {filteredSearchSets.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>No matching Collections</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          filteredSearchSets.map((searchSet) => (
            <Link
              className={cn(
                "flex flex-col gap-2 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50",
                workspaceMode === "search-set" &&
                  searchSet.slug === activeSearchSetSlug &&
                  "border-ring bg-muted shadow-xs",
              )}
              href={createSearchSetHref(searchSet.slug, filterText)}
              key={searchSet.slug}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {searchSet.displayName}
                </span>
                <Badge variant="secondary">
                  {searchSet.importedImageCount} Image
                  {searchSet.importedImageCount === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {searchSet.termSummary || "No active terms"}
              </p>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
