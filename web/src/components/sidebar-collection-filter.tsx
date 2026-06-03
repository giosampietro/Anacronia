"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderClosed, FolderOpen, ListFilter, Search } from "lucide-react";

import { CollectionRenameDialog } from "@/components/collection-rename-dialog";
import type { DashboardSearchSetView } from "@/lib/dashboard";
import type { WorkspaceMode } from "@/lib/workspace";
import { createSearchSetHref, filterSearchSets } from "@/lib/workspace";
import { Spinner } from "@/components/ui/spinner";
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
import { formatCollectionDisplayName } from "@/lib/collection-display";
import { cn } from "@/lib/utils";

type SidebarCollectionFilterProps = {
  activeSearchSetSlug: string | null;
  initialFilterText: string;
  searchSets: DashboardSearchSetView[];
  workspaceMode: WorkspaceMode;
};

function isCollectionSearchActive(searchSet: DashboardSearchSetView): boolean {
  return searchSet.providerCollections.some(
    (providerCollection) =>
      providerCollection.status === "running" || providerCollection.status === "stopping",
  );
}

export function SidebarCollectionFilter({
  activeSearchSetSlug,
  initialFilterText,
  searchSets,
  workspaceMode,
}: SidebarCollectionFilterProps) {
  const router = useRouter();
  const [filterText, setFilterText] = useState(initialFilterText);
  const [openedSearchSetSlug, setOpenedSearchSetSlug] = useState<string | null>(
    activeSearchSetSlug,
  );
  const [renamingSearchSet, setRenamingSearchSet] =
    useState<DashboardSearchSetView | null>(null);
  const pendingTitleNavigation = useRef<
    ReturnType<typeof globalThis.setTimeout> | null
  >(null);
  const suppressTitleNavigation = useRef(false);
  const suppressTitleNavigationReset = useRef<
    ReturnType<typeof globalThis.setTimeout> | null
  >(null);
  const filteredSearchSets = useMemo(
    () => filterSearchSets(searchSets, filterText),
    [filterText, searchSets],
  );

  function clearPendingTitleNavigation() {
    if (pendingTitleNavigation.current !== null) {
      globalThis.clearTimeout(pendingTitleNavigation.current);
      pendingTitleNavigation.current = null;
    }
  }

  function clearSuppressedTitleNavigationReset() {
    if (suppressTitleNavigationReset.current !== null) {
      globalThis.clearTimeout(suppressTitleNavigationReset.current);
      suppressTitleNavigationReset.current = null;
    }
  }

  useEffect(
    () => () => {
      clearPendingTitleNavigation();
      clearSuppressedTitleNavigationReset();
    },
    [],
  );

  function openSearchSet(slug: string) {
    setOpenedSearchSetSlug(slug);
  }

  function handleTitleClick({
    event,
    href,
    slug,
  }: {
    event: MouseEvent<HTMLSpanElement>;
    href: string;
    slug: string;
  }) {
    event.preventDefault();
    event.stopPropagation();
    clearPendingTitleNavigation();
    if (suppressTitleNavigation.current) {
      return;
    }

    pendingTitleNavigation.current = globalThis.setTimeout(() => {
      pendingTitleNavigation.current = null;
      if (suppressTitleNavigation.current) {
        return;
      }
      openSearchSet(slug);
      router.push(href);
    }, 250);
  }

  function handleTitleDoubleClick({
    event,
    searchSet,
  }: {
    event: MouseEvent<HTMLSpanElement>;
    searchSet: DashboardSearchSetView;
  }) {
    event.preventDefault();
    event.stopPropagation();
    clearPendingTitleNavigation();
    clearSuppressedTitleNavigationReset();
    suppressTitleNavigation.current = true;
    suppressTitleNavigationReset.current = globalThis.setTimeout(() => {
      suppressTitleNavigation.current = false;
      suppressTitleNavigationReset.current = null;
    }, 1000);
    setRenamingSearchSet(searchSet);
  }

  async function renameSearchSet(nextName: string): Promise<string | null> {
    if (renamingSearchSet === null) {
      return "Collection not found.";
    }

    const response = await fetch(
      `/api/search-sets/${encodeURIComponent(renamingSearchSet.slug)}`,
      {
        body: JSON.stringify({ display_name: nextName }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        detail?: string;
      } | null;
      return payload?.detail ?? "Could not rename Collection.";
    }

    window.location.reload();
    return null;
  }

  return (
    <>
      <div className="relative group-data-[collapsible=icon]:hidden">
        <ListFilter className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
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
            const collectionName = formatCollectionDisplayName(searchSet.displayName);
            const collectionHref = createSearchSetHref(searchSet.slug, filterText);
            const isActive =
              workspaceMode === "search-set" &&
              searchSet.slug === activeSearchSetSlug;
            const isOpen = openedSearchSetSlug === searchSet.slug;
            const termSummary = searchSet.termSummary || "No active terms";
            const searchActive = isCollectionSearchActive(searchSet);

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
                  render={<Link href={collectionHref} />}
                  tooltip={collectionName}
                >
                  {isOpen ? (
                    <FolderOpen className="text-sidebar-foreground/75" />
                  ) : (
                    <FolderClosed className="text-sidebar-foreground/65" />
                  )}
                  <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                    <span
                      onClick={(event) =>
                        handleTitleClick({
                          event,
                          href: collectionHref,
                          slug: searchSet.slug,
                        })
                      }
                      onDoubleClick={(event) =>
                        handleTitleDoubleClick({ event, searchSet })
                      }
                    >
                      {collectionName}
                    </span>
                  </span>
                  <span
                    className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] font-normal tabular-nums text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden"
                  >
                    {searchActive ? (
                      <Spinner
                        aria-label={`${collectionName} search in progress`}
                        className="size-3"
                      />
                    ) : null}
                    <span
                      aria-label={`${searchSet.importedImageCount} images`}
                      title={`${searchSet.importedImageCount} images`}
                    >
                      {searchSet.importedImageCount}
                    </span>
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

      {renamingSearchSet === null ? null : (
        <CollectionRenameDialog
          collectionName={formatCollectionDisplayName(renamingSearchSet.displayName)}
          onOpenChange={(open) => {
            if (!open) {
              setRenamingSearchSet(null);
            }
          }}
          onRename={renameSearchSet}
          open
        />
      )}
    </>
  );
}
