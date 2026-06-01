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
import { createGridStateHref, type GridViewMode } from "@/lib/grid-view";

type CollectionResultSetSearchFormProps = {
  collectionFilterText: string;
  localQueryText: string;
  providerFilter: string;
  searchSetSlug: string;
  viewMode: GridViewMode;
};

export function CollectionResultSetSearchForm({
  collectionFilterText,
  localQueryText,
  providerFilter,
  searchSetSlug,
  viewMode,
}: CollectionResultSetSearchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasLocalQuery = localQueryText.trim() !== "";

  function submitLocalQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedQuery = formData.get("q");
    const queryText =
      typeof submittedQuery === "string" ? submittedQuery.trim() : "";

    const href = createGridStateHref({
      collectionFilterText,
      localQueryText: queryText,
      provider: providerFilter,
      searchSetSlug,
      viewMode,
      workspaceMode: "search-set",
    });

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function clearLocalQuery() {
    const href = createGridStateHref({
      collectionFilterText,
      localQueryText: "",
      provider: providerFilter,
      searchSetSlug,
      viewMode,
      workspaceMode: "search-set",
    });

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <form
      className="min-w-[min(100%,20rem)] flex-1"
      onSubmit={submitLocalQuery}
    >
      <input name="search_set" type="hidden" value={searchSetSlug} />
      {viewMode === "images" ? (
        <input name="view" type="hidden" value="images" />
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
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search local Collection results"
          defaultValue={localQueryText}
          key={localQueryText}
          name="q"
          placeholder="Search local results"
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
          <InputGroupButton disabled={isPending} type="submit">
            Search
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
