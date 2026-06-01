"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderClosed, FolderOpen, Search } from "lucide-react";

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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
  const [openedSearchSetSlug, setOpenedSearchSetSlug] = useState<string | null>(
    activeSearchSetSlug,
  );
  const filteredSearchSets = useMemo(
    () => filterSearchSets(searchSets, filterText),
    [filterText, searchSets],
  );

  function openSearchSet(slug: string) {
    setOpenedSearchSetSlug(slug);
  }

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

      <SidebarMenu className="mt-3 gap-0.5">
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
          filteredSearchSets.map((searchSet) => {
            const isActive =
              workspaceMode === "search-set" &&
              searchSet.slug === activeSearchSetSlug;
            const isOpen = openedSearchSetSlug === searchSet.slug;
            const termSummary = searchSet.termSummary || "No active terms";

            return (
              <SidebarMenuItem key={searchSet.slug}>
                <SidebarMenuButton
                  aria-expanded={isOpen}
                  className={cn(
                    "h-8 gap-2 rounded-md px-2 text-[13px] font-normal",
                    isOpen && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  isActive={isActive}
                  onClick={() => openSearchSet(searchSet.slug)}
                  render={
                    <Link href={createSearchSetHref(searchSet.slug, filterText)} />
                  }
                  tooltip={searchSet.displayName}
                >
                  {isOpen ? (
                    <FolderOpen className="text-sidebar-foreground/75" />
                  ) : (
                    <FolderClosed className="text-sidebar-foreground/65" />
                  )}
                  <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                    {searchSet.displayName}
                  </span>
                  <span
                    aria-label={`${searchSet.importedImageCount} images`}
                    className="ml-auto shrink-0 font-mono text-[11px] font-normal tabular-nums text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden"
                    title={`${searchSet.importedImageCount} images`}
                  >
                    {searchSet.importedImageCount}
                  </span>
                </SidebarMenuButton>
                {isOpen ? (
                  <p className="ml-8 mr-2 pb-1 pr-2 text-xs leading-5 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                    {termSummary}
                  </p>
                ) : null}
              </SidebarMenuItem>
            );
          })
        )}
      </SidebarMenu>
    </>
  );
}
