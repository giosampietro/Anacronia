"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CircleDashed,
  Database,
  FolderOpen,
  Images,
  Library,
  ListFilter,
  Plus,
  Search,
  Square,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ImageGridThumbnail } from "@/components/image-grid-thumbnail";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  incomingObject,
  prototypeCollections,
  prototypeObjects,
  type PrototypeCollection,
  type PrototypeImageAsset,
  type PrototypeMuseumObject,
  type PrototypeProvider,
  type PrototypeScenario,
  type PrototypeScope,
  type PrototypeVariant,
  type PrototypeView,
} from "./local-result-set-fixtures";

type PrototypeState = {
  collectionFilter: string;
  detail: string;
  provider: PrototypeProvider;
  q: string;
  scenario: PrototypeScenario;
  scope: PrototypeScope;
  searchSet: string;
  variant: PrototypeVariant;
  view: PrototypeView;
};

type LocalResultSetPrototypeProps = {
  initialState: PrototypeState;
};

type ResultObject = {
  collectionLabels: string[];
  id: string;
  kind: "object";
  object: PrototypeMuseumObject;
};

type ResultImage = {
  collectionLabels: string[];
  id: string;
  image: PrototypeImageAsset;
  kind: "image";
  object: PrototypeMuseumObject;
};

type ResultItem = ResultObject | ResultImage;

type ResultSet = {
  activeCollection: PrototypeCollection | null;
  activeItems: ResultItem[];
  baseImages: ResultImage[];
  baseObjects: ResultObject[];
  collections: PrototypeCollection[];
  queryImages: ResultImage[];
  queryObjects: ResultObject[];
};

const providers: Array<{ label: string; value: PrototypeProvider }> = [
  { label: "All Providers", value: "all" },
  { label: "Met", value: "met" },
  { label: "V&A", value: "vam" },
];

const scenarios: Array<{ label: string; value: PrototypeScenario }> = [
  { label: "Normal", value: "normal" },
  { label: "No Material", value: "empty" },
  { label: "Failure", value: "error" },
];

function objectKey(object: PrototypeMuseumObject): string {
  return `object:${object.provider}:${object.objectId}`;
}

function imageKey(image: PrototypeImageAsset): string {
  return `image:${image.imageAssetId}`;
}

function providerLabel(provider: PrototypeProvider): string {
  if (provider === "met") {
    return "Met";
  }
  if (provider === "vam") {
    return "V&A";
  }

  return "All Providers";
}

function searchCorpus({
  collectionLabels,
  image,
  object,
}: {
  collectionLabels: string[];
  image?: PrototypeImageAsset;
  object: PrototypeMuseumObject;
}): string {
  return [
    object.title,
    object.objectName,
    object.artistDisplayName,
    object.provider,
    String(object.objectId),
    ...object.descriptors,
    ...collectionLabels,
    ...(image ? [image.title, image.imageRole, String(image.imageAssetId), ...image.descriptors] : []),
  ]
    .join(" ")
    .toLowerCase();
}

function itemMatchesQuery(item: ResultItem, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (query === "") {
    return true;
  }

  return searchCorpus({
    collectionLabels: item.collectionLabels,
    image: item.kind === "image" ? item.image : undefined,
    object: item.object,
  }).includes(query);
}

function collectionMatchesFilter(collection: PrototypeCollection, filter: string): boolean {
  const query = filter.trim().toLowerCase();
  if (query === "") {
    return true;
  }

  return [
    collection.displayName,
    collection.slug,
    ...collection.terms,
    collection.providerStatus,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function collectionLabelsForObject(object: PrototypeMuseumObject): string[] {
  return object.collectionSlugs.map(
    (slug) =>
      prototypeCollections.find((collection) => collection.slug === slug)?.displayName ??
      slug,
  );
}

function createResultSet({
  includeIncoming,
  state,
}: {
  includeIncoming: boolean;
  state: PrototypeState;
}): ResultSet {
  const activeCollection =
    prototypeCollections.find((collection) => collection.slug === state.searchSet) ??
    prototypeCollections[0] ??
    null;
  const collections = prototypeCollections.filter((collection) =>
    collectionMatchesFilter(collection, state.collectionFilter),
  );
  const sourceObjects =
    state.scenario === "empty"
      ? []
      : includeIncoming
        ? [incomingObject, ...prototypeObjects]
        : prototypeObjects;
  const baseObjects = sourceObjects
    .filter((object) =>
      state.scope === "library" || activeCollection === null
        ? true
        : object.collectionSlugs.includes(activeCollection.slug),
    )
    .filter((object) =>
      state.provider === "all" ? true : object.provider === state.provider,
    )
    .map<ResultObject>((object) => ({
      collectionLabels: collectionLabelsForObject(object),
      id: objectKey(object),
      kind: "object",
      object,
    }));
  const baseImages = baseObjects.flatMap<ResultImage>((resultObject) =>
    resultObject.object.images
      .filter((image) =>
        state.provider === "all" ? true : image.provider === state.provider,
      )
      .map((image) => ({
        collectionLabels: resultObject.collectionLabels,
        id: imageKey(image),
        image,
        kind: "image",
        object: resultObject.object,
      })),
  );
  const queryObjects = baseObjects.filter((item) => itemMatchesQuery(item, state.q));
  const queryImages = baseImages.filter((item) => itemMatchesQuery(item, state.q));

  return {
    activeCollection,
    activeItems: state.view === "objects" ? queryObjects : queryImages,
    baseImages,
    baseObjects,
    collections,
    queryImages,
    queryObjects,
  };
}

function hrefFor(state: PrototypeState, patch: Partial<PrototypeState> = {}): string {
  const nextState = { ...state, ...patch };
  const params = new URLSearchParams();

  params.set("scope", nextState.scope);
  if (nextState.scope === "collection") {
    params.set("search_set", nextState.searchSet);
  }
  params.set("view", nextState.view);
  if (nextState.q.trim() !== "") {
    params.set("q", nextState.q.trim());
  }
  if (nextState.collectionFilter.trim() !== "") {
    params.set("collection_filter", nextState.collectionFilter.trim());
  }
  if (nextState.provider !== "all") {
    params.set("provider", nextState.provider);
  }
  if (nextState.scenario !== "normal") {
    params.set("scenario", nextState.scenario);
  }
  if (nextState.variant !== "A") {
    params.set("variant", nextState.variant);
  }
  if (nextState.detail !== "") {
    params.set("detail", nextState.detail);
  }

  return `/prototype/local-result-set?${params.toString()}`;
}

function usePrototypeRoute(initialState: PrototypeState) {
  const [state, setState] = useState(initialState);

  function updateState(patch: Partial<PrototypeState>) {
    setState((currentState) => {
      const nextState = { ...currentState, ...patch };
      window.history.replaceState(null, "", hrefFor(nextState));
      return nextState;
    });
  }

  return [state, updateState] as const;
}

function MetricCard({
  label,
  sublabel,
  value,
}: {
  label: string;
  sublabel: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}

function AnchorButton({
  active,
  children,
  href,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <a
      className={cn(
        buttonVariants({ size: "sm", variant: active ? "default" : "outline" }),
      )}
      href={href}
    >
      {children}
    </a>
  );
}

function CollectionRail({
  resultSet,
  state,
  updateState,
}: {
  resultSet: ResultSet;
  state: PrototypeState;
  updateState: (patch: Partial<PrototypeState>) => void;
}) {
  const [collectionFilterDraft, setCollectionFilterDraft] = useState(
    state.collectionFilter,
  );

  function applyCollectionFilter() {
    updateState({ collectionFilter: collectionFilterDraft, detail: "" });
  }

  return (
    <aside className="flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Anacronia</p>
            <p className="text-xs text-sidebar-foreground/60">prototype</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4">
        <div className="flex gap-2">
          <AnchorButton
            active={state.scope === "collection"}
            href={hrefFor(state, { detail: "", scope: "collection" })}
          >
            <FolderOpen data-icon="inline-start" />
            Collection
          </AnchorButton>
          <AnchorButton
            active={state.scope === "library"}
            href={hrefFor(state, { detail: "", scope: "library" })}
          >
            <Library data-icon="inline-start" />
            Library
          </AnchorButton>
        </div>
        <InputGroup>
          <InputGroupAddon>
            <ListFilter />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Filter Collections"
            onChange={(event) => setCollectionFilterDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyCollectionFilter();
              }
            }}
            placeholder="Filter Collections"
            value={collectionFilterDraft}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={applyCollectionFilter}>
              Apply
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
        <div className="grid gap-1">
          {resultSet.collections.map((collection) => (
            <button
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent",
                collection.slug === state.searchSet &&
                  state.scope === "collection" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              key={collection.slug}
              onClick={() =>
                updateState({
                  detail: "",
                  scope: "collection",
                  searchSet: collection.slug,
                })
              }
              type="button"
            >
              <FolderOpen className="size-4 shrink-0 text-sidebar-foreground/60" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{collection.displayName}</span>
                <span className="block truncate text-xs text-sidebar-foreground/55">
                  {collection.terms.join(", ")}
                </span>
              </span>
              <span className="font-mono text-xs text-sidebar-foreground/55">
                {collection.importedImageCount}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SearchControls({
  resultSet,
  selectedVisibleCount,
  state,
  updateState,
}: {
  resultSet: ResultSet;
  selectedVisibleCount: number;
  state: PrototypeState;
  updateState: (patch: Partial<PrototypeState>) => void;
}) {
  const [qDraft, setQDraft] = useState(state.q);
  const scopeLabel =
    state.scope === "library"
      ? "User Library"
      : resultSet.activeCollection?.displayName ?? "Collection";

  function applyQuery() {
    updateState({ detail: "", q: qDraft });
  }

  return (
    <div className="grid gap-4 border-b bg-background/95 px-5 py-4 backdrop-blur lg:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Local Result Set
          </p>
          <h1 className="mt-1 truncate text-xl font-semibold">{scopeLabel}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{providerLabel(state.provider)}</Badge>
          <Badge variant="secondary">{state.view}</Badge>
          {selectedVisibleCount > 0 ? (
            <Badge>{selectedVisibleCount} selected here</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto_auto] xl:items-center">
        <InputGroup className="h-9">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search local results"
            onChange={(event) => setQDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyQuery();
              }
            }}
            placeholder="Search canonical fields and Descriptors"
            value={qDraft}
          />
          <InputGroupAddon align="inline-end">
            {qDraft ? (
              <InputGroupButton
                aria-label="Clear search"
                onClick={() => {
                  setQDraft("");
                  updateState({ detail: "", q: "" });
                }}
              >
                <X />
              </InputGroupButton>
            ) : null}
            <InputGroupButton onClick={applyQuery}>Search</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <div className="flex flex-wrap gap-2">
          <AnchorButton
            active={state.view === "objects"}
            href={hrefFor(state, { detail: "", view: "objects" })}
          >
            <Database data-icon="inline-start" />
            Objects
          </AnchorButton>
          <AnchorButton
            active={state.view === "images"}
            href={hrefFor(state, { detail: "", view: "images" })}
          >
            <Images data-icon="inline-start" />
            Images
          </AnchorButton>
        </div>

        <div className="flex flex-wrap gap-2">
          {providers.map((provider) => (
            <AnchorButton
              active={state.provider === provider.value}
              href={hrefFor(state, { detail: "", provider: provider.value })}
              key={provider.value}
            >
              {provider.label}
            </AnchorButton>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultMetrics({ resultSet, state }: { resultSet: ResultSet; state: PrototypeState }) {
  const scopeName =
    state.scope === "library"
      ? "library"
      : resultSet.activeCollection?.displayName ?? "Collection";

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <MetricCard
        label="Objects"
        sublabel={`total in ${scopeName}`}
        value={resultSet.baseObjects.length}
      />
      <MetricCard
        label="Images"
        sublabel={`total in ${scopeName}`}
        value={resultSet.baseImages.length}
      />
      <MetricCard
        label="Shown Objects"
        sublabel={state.q ? `matching "${state.q}"` : "current query"}
        value={resultSet.queryObjects.length}
      />
      <MetricCard
        label="Shown Images"
        sublabel={state.q ? `matching "${state.q}"` : "current query"}
        value={resultSet.queryImages.length}
      />
    </div>
  );
}

function SelectionToolbar({
  activeItems,
  includeIncoming,
  selectedIds,
  selectionMode,
  setIncludeIncoming,
  setSelectedIds,
  setSelectionMode,
}: {
  activeItems: ResultItem[];
  includeIncoming: boolean;
  selectedIds: Set<string>;
  selectionMode: boolean;
  setIncludeIncoming: (includeIncoming: boolean) => void;
  setSelectedIds: (selectedIds: Set<string>) => void;
  setSelectionMode: (selectionMode: boolean) => void;
}) {
  const visibleIds = activeItems.map((item) => item.id);
  const selectedVisibleIds = visibleIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => setSelectionMode(!selectionMode)}
          size="sm"
          variant={selectionMode ? "default" : "outline"}
        >
          {selectionMode ? <Check data-icon="inline-start" /> : <Square data-icon="inline-start" />}
          Selection
        </Button>
        <Button
          disabled={!selectionMode || visibleIds.length === 0}
          onClick={() => {
            if (allVisibleSelected) {
              const next = new Set(selectedIds);
              visibleIds.forEach((id) => next.delete(id));
              setSelectedIds(next);
              return;
            }
            setSelectedIds(new Set([...selectedIds, ...visibleIds]));
          }}
          size="sm"
          variant="outline"
        >
          {allVisibleSelected ? "Unselect shown" : "Select all shown"}
        </Button>
        <Button
          disabled={selectedIds.size === 0}
          onClick={() => setSelectedIds(new Set())}
          size="sm"
          variant="outline"
        >
          Clear
        </Button>
        <Separator className="h-5" orientation="vertical" />
        <Button
          onClick={() => setIncludeIncoming(!includeIncoming)}
          size="sm"
          variant={includeIncoming ? "secondary" : "outline"}
        >
          <Plus data-icon="inline-start" />
          Insert new result
        </Button>
        <span className="text-sm text-muted-foreground">
          {selectedVisibleIds.length} shown selected / {selectedIds.size} total selected
        </span>
        {includeIncoming && selectedIds.size > 0 ? (
          <Badge variant="outline">new result is not auto-selected</Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyResultState({ state }: { state: PrototypeState }) {
  if (state.scenario === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Search failed</AlertTitle>
        <AlertDescription>
          The Local Result Set keeps the previous query state and exposes a retryable
          failure state instead of turning the grid into an empty result.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {state.scenario === "empty" ? <CircleDashed /> : <Search />}
        </EmptyMedia>
        <EmptyTitle>
          {state.scenario === "empty" ? "No local material yet" : "No matching results"}
        </EmptyTitle>
        <EmptyDescription>
          {state.scenario === "empty"
            ? "Start a Provider Search to add Museum Objects and Image Assets."
            : `No ${state.view} matched "${state.q.trim()}".`}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ResultTile({
  item,
  selected,
  selectionMode,
  toggleSelected,
  updateState,
}: {
  item: ResultItem;
  selected: boolean;
  selectionMode: boolean;
  toggleSelected: () => void;
  updateState: (patch: Partial<PrototypeState>) => void;
}) {
  const isImage = item.kind === "image";
  const thumb = isImage ? item.image.thumb : item.object.images[0]?.thumb;
  const title = isImage ? item.image.title : item.object.title;
  const subtitle = isImage ? item.object.title : item.object.objectName;
  const imageCount = item.object.images.length;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-sm transition",
        selected && "ring-2 ring-primary",
      )}
    >
      <AspectRatio ratio={4 / 5}>
        {thumb ? (
          <ImageGridThumbnail
            alt=""
            className="size-full object-cover"
            src={thumb}
          />
        ) : null}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <Badge variant="secondary">{providerLabel(item.object.provider)}</Badge>
          {selectionMode ? (
            <button
              aria-label={selected ? "Unselect result" : "Select result"}
              className={cn(
                "flex size-7 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm",
                selected && "bg-primary text-primary-foreground",
              )}
              onClick={toggleSelected}
              type="button"
            >
              {selected ? <Check className="size-4" /> : <Square className="size-4" />}
            </button>
          ) : null}
        </div>
        {imageCount > 1 && !isImage ? (
          <Badge className="absolute bottom-2 left-2" variant="secondary">
            <Images data-icon="inline-start" />
            {imageCount}
          </Badge>
        ) : null}
        <div className="absolute inset-x-2 bottom-2 rounded-lg bg-background/92 p-2 shadow-sm backdrop-blur">
          <p className="line-clamp-2 text-xs font-medium leading-tight">{title}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-muted-foreground">
              {item.collectionLabels.join(", ")}
            </span>
            <button
              className="text-[11px] font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => updateState({ detail: item.id })}
              type="button"
            >
              Detail
            </button>
          </div>
        </div>
      </AspectRatio>
    </article>
  );
}

function ResultsGrid({
  resultSet,
  selectedIds,
  selectionMode,
  setSelectedIds,
  state,
  updateState,
}: {
  resultSet: ResultSet;
  selectedIds: Set<string>;
  selectionMode: boolean;
  setSelectedIds: (selectedIds: Set<string>) => void;
  state: PrototypeState;
  updateState: (patch: Partial<PrototypeState>) => void;
}) {
  if (state.scenario === "error" || resultSet.activeItems.length === 0) {
    return <EmptyResultState state={state} />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {resultSet.activeItems.map((item) => {
        const selected = selectedIds.has(item.id);

        return (
          <ResultTile
            item={item}
            key={item.id}
            selected={selected}
            selectionMode={selectionMode}
            toggleSelected={() => {
              const next = new Set(selectedIds);
              if (selected) {
                next.delete(item.id);
              } else {
                next.add(item.id);
              }
              setSelectedIds(next);
            }}
            updateState={updateState}
          />
        );
      })}
    </div>
  );
}

function DetailRail({
  detail,
  state,
  updateState,
}: {
  detail: ResultItem | null;
  state: PrototypeState;
  updateState: (patch: Partial<PrototypeState>) => void;
}) {
  if (detail === null) {
    return (
      <Card className="sticky top-4">
        <CardHeader>
          <CardTitle>Detail Anchor</CardTitle>
          <CardDescription>No result selected</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Detail links preserve <code>scope</code>, <code>search_set</code>,{" "}
          <code>q</code>, <code>provider</code>, and <code>view</code>.
        </CardContent>
      </Card>
    );
  }

  const isImage = detail.kind === "image";

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>{isImage ? detail.image.title : detail.object.title}</CardTitle>
        <CardDescription>
          {isImage ? `Image Asset ${detail.image.imageAssetId}` : `Museum Object ${detail.object.objectId}`}
        </CardDescription>
        <CardAction>
          <Button
            aria-label="Close detail"
            onClick={() => updateState({ detail: "" })}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AspectRatio ratio={4 / 5}>
          <ImageGridThumbnail
            alt=""
            className="size-full rounded-xl object-cover"
            src={isImage ? detail.image.thumb : detail.object.images[0]?.thumb}
          />
        </AspectRatio>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Provider</span>
            <span>{providerLabel(detail.object.provider)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Collections</span>
            <span className="text-right">{detail.collectionLabels.join(", ")}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Identity</span>
            <span className="font-mono text-xs">{detail.id}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(isImage ? detail.image.descriptors : detail.object.descriptors).map((descriptor) => (
            <Badge key={descriptor} variant="secondary">
              {descriptor}
            </Badge>
          ))}
        </div>
        <a
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-fit")}
          href={hrefFor(state, { detail: detail.id })}
        >
          Reloadable detail URL
        </a>
      </CardContent>
    </Card>
  );
}

function StateRail({
  resultSet,
  selectedIds,
  state,
}: {
  resultSet: ResultSet;
  selectedIds: Set<string>;
  state: PrototypeState;
}) {
  const stateRows = [
    ["scope", state.scope],
    ["search_set", state.scope === "collection" ? state.searchSet : "-"],
    ["collection_filter", state.collectionFilter || "-"],
    ["q", state.q || "-"],
    ["provider", state.provider],
    ["view", state.view],
    ["scenario", state.scenario],
    ["detail", state.detail || "-"],
    ["items", String(resultSet.activeItems.length)],
    ["selected", String(selectedIds.size)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>State</CardTitle>
        <CardDescription>Result-set Interface surface</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {stateRows.map(([label, value]) => (
          <div className="grid grid-cols-[8rem_1fr] gap-3 text-xs" key={label}>
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate font-mono">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ArchitectureCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Local Result Set Module</CardTitle>
        <CardDescription>Prototype contract candidate</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="font-medium">Interface</p>
          <p className="mt-1 text-muted-foreground">
            scope, query, Provider facet, projection, counts, pagination,
            identity, detail anchor, selection.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="font-medium">Seam</p>
          <p className="mt-1 text-muted-foreground">
            production Adapter can query local SQLite; prototype Adapter uses fixtures.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="font-medium">Depth</p>
          <p className="mt-1 text-muted-foreground">
            grids, counts, detail navigation, and curation consume one Module.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VariantSwitcher({
  state,
}: {
  state: PrototypeState;
}) {
  return (
    <nav className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur">
      <a
        className={cn(
          "rounded-full px-3 py-2 text-sm font-medium",
          state.variant === "A" && "bg-foreground text-background",
        )}
        href={hrefFor(state, { variant: "A" })}
      >
        A Search-first
      </a>
      <a
        className={cn(
          "rounded-full px-3 py-2 text-sm font-medium",
          state.variant === "B" && "bg-foreground text-background",
        )}
        href={hrefFor(state, { variant: "B" })}
      >
        B Contract rail
      </a>
    </nav>
  );
}

export function LocalResultSetPrototype({
  initialState,
}: LocalResultSetPrototypeProps) {
  const [state, updateState] = usePrototypeRoute(initialState);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [includeIncoming, setIncludeIncoming] = useState(false);
  const resultSet = useMemo(
    () => createResultSet({ includeIncoming, state }),
    [includeIncoming, state],
  );
  const selectedVisibleCount = resultSet.activeItems.filter((item) =>
    selectedIds.has(item.id),
  ).length;
  const detail =
    resultSet.activeItems.find((item) => item.id === state.detail) ??
    [...resultSet.queryObjects, ...resultSet.queryImages].find(
      (item) => item.id === state.detail,
    ) ??
    null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[20rem_minmax(0,1fr)]">
        <CollectionRail resultSet={resultSet} state={state} updateState={updateState} />
        <section className="min-w-0">
          <SearchControls
            resultSet={resultSet}
            selectedVisibleCount={selectedVisibleCount}
            state={state}
            updateState={updateState}
          />

          <div className="grid gap-5 px-5 py-5 lg:px-7">
            <div className="flex flex-wrap gap-2">
              {scenarios.map((scenario) => (
                <AnchorButton
                  active={state.scenario === scenario.value}
                  href={hrefFor(state, { detail: "", scenario: scenario.value })}
                  key={scenario.value}
                >
                  {scenario.label}
                </AnchorButton>
              ))}
            </div>

            <ResultMetrics resultSet={resultSet} state={state} />

            <SelectionToolbar
              activeItems={resultSet.activeItems}
              includeIncoming={includeIncoming}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              setIncludeIncoming={setIncludeIncoming}
              setSelectedIds={setSelectedIds}
              setSelectionMode={setSelectionMode}
            />

            {state.variant === "A" ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <ResultsGrid
                  resultSet={resultSet}
                  selectedIds={selectedIds}
                  selectionMode={selectionMode}
                  setSelectedIds={setSelectedIds}
                  state={state}
                  updateState={updateState}
                />
                <div className="grid content-start gap-5">
                  <DetailRail detail={detail} state={state} updateState={updateState} />
                  <StateRail resultSet={resultSet} selectedIds={selectedIds} state={state} />
                </div>
              </div>
            ) : (
              <div className="grid gap-5 2xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
                <div className="grid content-start gap-5">
                  <ArchitectureCard />
                  <StateRail resultSet={resultSet} selectedIds={selectedIds} state={state} />
                </div>
                <ResultsGrid
                  resultSet={resultSet}
                  selectedIds={selectedIds}
                  selectionMode={selectionMode}
                  setSelectedIds={setSelectedIds}
                  state={state}
                  updateState={updateState}
                />
                <DetailRail detail={detail} state={state} updateState={updateState} />
              </div>
            )}
          </div>
        </section>
      </div>
      <VariantSwitcher state={state} />
    </main>
  );
}
