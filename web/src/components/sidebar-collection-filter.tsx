"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Database, MoreHorizontal, Search } from "lucide-react";

import type { DashboardSearchSetView } from "@/lib/dashboard";
import type { WorkspaceMode } from "@/lib/workspace";
import { createSearchSetHref, filterSearchSets } from "@/lib/workspace";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

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
      <div className="relative group-data-[collapsible=icon]:hidden">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
        <SidebarInput
          aria-label="Filter Collections"
          className="pl-8"
          onChange={(event) => setFilterText(event.currentTarget.value)}
          placeholder="Filter by title or term"
          value={filterText}
        />
      </div>

      <SidebarMenu className="mt-3">
        {filteredSearchSets.length === 0 ? (
          <Empty className="border group-data-[collapsible=icon]:hidden">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>No matching Collections</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          filteredSearchSets.map((searchSet) => (
            <SidebarMenuItem
              key={searchSet.slug}
            >
              <SidebarMenuButton
                isActive={
                  workspaceMode === "search-set" &&
                  searchSet.slug === activeSearchSetSlug
                }
                render={<Link href={createSearchSetHref(searchSet.slug, filterText)} />}
                size="lg"
                tooltip={searchSet.displayName}
              >
                <Database />
                <span className="flex min-w-0 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                  <span className="truncate">
                    {searchSet.displayName}
                  </span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {searchSet.termSummary || "No active terms"}
                  </span>
                </span>
              </SidebarMenuButton>
              <SidebarMenuBadge>{searchSet.importedImageCount}</SidebarMenuBadge>
              <SidebarMenuAction
                aria-label={`More actions for ${searchSet.displayName}`}
                showOnHover
              >
                <MoreHorizontal />
              </SidebarMenuAction>
            </SidebarMenuItem>
          ))
        )}
      </SidebarMenu>
    </>
  );
}
