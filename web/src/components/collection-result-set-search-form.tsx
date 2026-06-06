"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  createGridStateHref,
  type GridViewMode,
  type LibraryCollectionFilter,
} from "@/lib/grid-view";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "@/lib/workspace";

type CollectionResultSetSearchFormProps = {
  collectionFilterText: string;
  localQueryText: string;
  providerFilter: string;
  searchSetSlug: string;
  viewMode: GridViewMode;
};

type LocalResultSetSearchFormProps = {
  ariaLabel: string;
  className?: string;
  collectionFilterText?: string;
  favoriteOnly?: boolean;
  libraryCollectionFilter?: LibraryCollectionFilter;
  localQueryText: string;
  placeholder?: string;
  providerFilter: string;
  searchSetSlug?: string;
  viewMode: GridViewMode;
  workspaceMode: WorkspaceMode;
};

export function LocalResultSetSearchForm({
  ariaLabel,
  className,
  collectionFilterText = "",
  favoriteOnly = false,
  libraryCollectionFilter = "all",
  localQueryText,
  placeholder = "",
  providerFilter,
  searchSetSlug,
  viewMode,
  workspaceMode,
}: LocalResultSetSearchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasLocalQuery = localQueryText.trim() !== "";

  function createHref(queryText: string): string {
    return createGridStateHref({
      collectionFilterText,
      favoriteOnly,
      libraryCollectionFilter,
      localQueryText: queryText,
      provider: providerFilter,
      searchSetSlug,
      viewMode,
      workspaceMode,
    });
  }

  function submitLocalQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedQuery = formData.get("q");
    const queryText =
      typeof submittedQuery === "string" ? submittedQuery.trim() : "";

    startTransition(() => {
      router.replace(createHref(queryText), { scroll: false });
    });
  }

  function clearLocalQuery() {
    startTransition(() => {
      router.replace(createHref(""), { scroll: false });
    });
  }

  return (
    <form
      className={cn("min-w-0 flex-1", className)}
      onSubmit={submitLocalQuery}
    >
      {workspaceMode === "user-library" ? (
        <input name="mode" type="hidden" value="user-library" />
      ) : null}
      {searchSetSlug !== undefined ? (
        <input name="search_set" type="hidden" value={searchSetSlug} />
      ) : null}
      {viewMode === "objects" || viewMode === "images" ? (
        <input name="view" type="hidden" value={viewMode} />
      ) : null}
      {collectionFilterText.trim() !== "" ? (
        <input
          name="collection_filter"
          type="hidden"
          value={collectionFilterText.trim()}
        />
      ) : null}
      {providerFilter !== "all" ? (
        <input name="provider" type="hidden" value={providerFilter} />
      ) : null}
      {favoriteOnly ? <input name="favorite" type="hidden" value="true" /> : null}
      {workspaceMode === "user-library" && libraryCollectionFilter === "none" ? (
        <input name="collection" type="hidden" value="none" />
      ) : null}
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={ariaLabel}
          defaultValue={localQueryText}
          key={localQueryText}
          name="q"
          placeholder={placeholder}
        />
        <InputGroupAddon align="inline-end">
          {hasLocalQuery ? (
            <InputGroupButton
              aria-label="Clear local search"
              disabled={isPending}
              onClick={clearLocalQuery}
              size="icon-xs"
              title="Clear local search"
            >
              <X />
            </InputGroupButton>
          ) : null}
          <InputGroupButton
            className="@max-[459px]/topbar:hidden"
            disabled={isPending}
            type="submit"
          >
            Search
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

export function CollectionResultSetSearchForm({
  collectionFilterText,
  localQueryText,
  providerFilter,
  searchSetSlug,
  viewMode,
}: CollectionResultSetSearchFormProps) {
  return (
    <LocalResultSetSearchForm
      ariaLabel="Search local Collection results"
      collectionFilterText={collectionFilterText}
      localQueryText={localQueryText}
      providerFilter={providerFilter}
      searchSetSlug={searchSetSlug}
      viewMode={viewMode}
      workspaceMode="search-set"
    />
  );
}
