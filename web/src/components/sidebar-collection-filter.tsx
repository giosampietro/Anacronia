"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderClosed, FolderOpen, ListFilter, Search, X } from "lucide-react";

import { CollectionRenameDialog } from "@/components/collection-rename-dialog";
import type { DashboardSearchSetView } from "@/lib/dashboard";
import type { WorkspaceMode } from "@/lib/workspace";
import {
  createSearchSetHref,
  createUserLibraryHref,
  filterSearchSets,
} from "@/lib/workspace";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

type CollectionDeleteDialogProps = {
  deleteError: string | null;
  isDeleting: boolean;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  searchSet: DashboardSearchSetView;
};

type CollectionDeleteDialogBodyProps = {
  deleteError: string | null;
  isDeleting: boolean;
  onDelete: () => void;
  searchSet: DashboardSearchSetView;
};

function isCollectionSearchActive(searchSet: DashboardSearchSetView): boolean {
  return searchSet.providerCollections.some(
    (providerCollection) =>
      providerCollection.status === "running" || providerCollection.status === "stopping",
  );
}

export function CollectionDeleteDialog({
  deleteError,
  isDeleting,
  onDelete,
  onOpenChange,
  open,
  searchSet,
}: CollectionDeleteDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <CollectionDeleteDialogBody
          deleteError={deleteError}
          isDeleting={isDeleting}
          onDelete={onDelete}
          searchSet={searchSet}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CollectionDeleteDialogBody({
  deleteError,
  isDeleting,
  onDelete,
  searchSet,
}: CollectionDeleteDialogBodyProps) {
  const collectionName = formatCollectionDisplayName(searchSet.displayName);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{`Delete "${collectionName}"?`}</AlertDialogTitle>
        <AlertDialogDescription>
          {searchSet.importedImageCount > 0
            ? `This will remove ${searchSet.importedObjectCount} objects and ${searchSet.importedImageCount} images from this Collection. Shared material used by other Collections will stay. Favorites that only belong to this Collection will remain in My Library as No Collection. Local files for non-favorite exclusive material will be deleted. Exports will not be deleted. There is no undo.`
            : "This Collection has no downloaded images. It will be removed permanently. There is no undo."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {deleteError === null ? null : (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isDeleting}
          onClick={(event) => {
            event.preventDefault();
            onDelete();
          }}
          variant="destructive"
        >
          Delete Collection
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
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
  const [deletingSearchSet, setDeletingSearchSet] =
    useState<DashboardSearchSetView | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  async function deleteSearchSet() {
    if (deletingSearchSet === null) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    const response = await fetch(
      `/api/search-sets/${encodeURIComponent(deletingSearchSet.slug)}`,
      { method: "DELETE" },
    );
    setIsDeleting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        detail?: string;
      } | null;
      setDeleteError(payload?.detail ?? "Could not delete Collection.");
      return;
    }

    setDeletingSearchSet(null);
    window.location.href = createUserLibraryHref(filterText);
  }

  return (
    <>
      <div className="relative group-data-[collapsible=icon]:hidden">
        <ListFilter className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
        <SidebarInput
          aria-label="Filter Collections"
          className="pl-8 pr-8"
          onChange={(event) => setFilterText(event.currentTarget.value)}
          placeholder="Filter by title or term"
          value={filterText}
        />
        {filterText !== "" ? (
          <button
            aria-label="Clear Collection filter"
            className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring focus-visible:outline-hidden"
            onClick={() => setFilterText("")}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
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
                <ContextMenu>
                  <ContextMenuTrigger render={<div />}>
                    <SidebarMenuButton
                      aria-expanded={isOpen}
                      className={cn(
                        "h-8 gap-2 rounded-md px-2 text-[13px] font-normal group-data-[collapsible=icon]:justify-center",
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
                  </ContextMenuTrigger>
                  <ContextMenuContent aria-label={`${collectionName} actions`}>
                    <ContextMenuItem onClick={() => setRenamingSearchSet(searchSet)}>
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem disabled>Pin</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={searchActive}
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingSearchSet(searchSet);
                      }}
                      variant="destructive"
                    >
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
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
      {deletingSearchSet === null ? null : (
        <CollectionDeleteDialog
          deleteError={deleteError}
          isDeleting={isDeleting}
          onDelete={() => {
            void deleteSearchSet();
          }}
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setDeletingSearchSet(null);
              setDeleteError(null);
            }
          }}
          open
          searchSet={deletingSearchSet}
        />
      )}
    </>
  );
}
