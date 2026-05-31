"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  Database,
  HardDrive,
  Images,
  Library,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
} from "lucide-react";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { CollectionObjectSummary } from "@/lib/collection-objects";
import { imageUrl } from "@/lib/collection-objects";
import {
  IMAGE_GRID_BADGE_CLASS_NAME,
  IMAGE_GRID_CLASS_NAME,
  IMAGE_GRID_IMAGE_CLASS_NAME,
  IMAGE_GRID_OVERLAY_CLASS_NAME,
  IMAGE_GRID_TILE_CLASS_NAME,
} from "@/lib/image-grid-style";
import type { AppVersionStamp } from "@/lib/app-version";
import { cn } from "@/lib/utils";

import type {
  PrototypeProviderCollection,
  PrototypeSearchSet,
  SidebarPrototypeVariant,
} from "./page";

type SidebarPrototypeProps = {
  activeSearchSet: PrototypeSearchSet | null;
  apiBaseUrl: string;
  appVersionStamp: AppVersionStamp;
  libraryImageCount: number;
  objects: CollectionObjectSummary[];
  searchSets: PrototypeSearchSet[];
  variant: SidebarPrototypeVariant;
  workerStatus: string;
};

type VariantConfig = {
  collapsible: "icon" | "none";
  defaultOpen: boolean;
  description: string;
  main: "flush" | "inset";
  sidebarVariant: "inset" | "sidebar";
  title: string;
};

const variants: Record<SidebarPrototypeVariant, VariantConfig> = {
  A: {
    collapsible: "none",
    defaultOpen: true,
    description: "Closest to today: permanent navigation, no collapsed state.",
    main: "flush",
    sidebarVariant: "sidebar",
    title: "Persistent navigator",
  },
  B: {
    collapsible: "icon",
    defaultOpen: false,
    description: "Collapses to an icon rail; good for dense visual review.",
    main: "flush",
    sidebarVariant: "sidebar",
    title: "Icon rail",
  },
  C: {
    collapsible: "icon",
    defaultOpen: true,
    description: "Native shadcn inset shell with a framed workspace.",
    main: "inset",
    sidebarVariant: "inset",
    title: "Inset workspace",
  },
};

function providerLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
}

function importedImageCount(searchSet: PrototypeSearchSet): number {
  return searchSet.provider_collections.reduce(
    (total, providerCollection) =>
      total + providerCollection.imported_image_count,
    0,
  );
}

function importedObjectCount(searchSet: PrototypeSearchSet): number {
  return searchSet.provider_collections.reduce(
    (total, providerCollection) =>
      total + providerCollection.imported_object_count,
    0,
  );
}

function providerStatus(searchSet: PrototypeSearchSet): string {
  return (
    searchSet.provider_collections[0]?.collect_status.replaceAll("_", " ") ??
    "not searched"
  );
}

function primaryProvider(searchSet: PrototypeSearchSet | null): PrototypeProviderCollection | null {
  return searchSet?.provider_collections[0] ?? null;
}

function VariantSwitcher({ activeVariant }: { activeVariant: SidebarPrototypeVariant }) {
  return (
    <nav className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur">
      {Object.entries(variants).map(([variant, config]) => (
        <a
          className={cn(
            "flex h-9 min-w-32 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors hover:bg-muted",
            variant === activeVariant && "bg-foreground text-background hover:bg-foreground",
          )}
          href={`/prototype/sidebar?variant=${variant}`}
          key={variant}
        >
          {variant}
          <span className="ml-1 text-xs opacity-70">{config.title}</span>
        </a>
      ))}
    </nav>
  );
}

function BrandMenu({
  appVersionStamp,
}: {
  appVersionStamp: AppVersionStamp;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip="Anacronia">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-heading text-sidebar-primary-foreground">
            A
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 leading-none">
            <span className="font-medium">Anacronia</span>
            <span
              className="font-mono text-xs text-sidebar-foreground/60"
              title={appVersionStamp.title}
            >
              {appVersionStamp.display}
            </span>
          </div>
          <Settings className="ml-auto" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar({
  activeSearchSet,
  appVersionStamp,
  config,
  libraryImageCount,
  searchSets,
  workerStatus,
}: {
  activeSearchSet: PrototypeSearchSet | null;
  appVersionStamp: AppVersionStamp;
  config: VariantConfig;
  libraryImageCount: number;
  searchSets: PrototypeSearchSet[];
  workerStatus: string;
}) {
  return (
    <Sidebar
      collapsible={config.collapsible}
      variant={config.sidebarVariant}
    >
      <SidebarHeader>
        <BrandMenu appVersionStamp={appVersionStamp} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<a href="#" />} variant="outline">
              <Plus />
              <span>New Collection</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeSearchSet === null}
              render={<a href="#" />}
              tooltip="User Library"
            >
              <Library />
              <span>User Library</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>{libraryImageCount}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
            <SidebarInput className="pl-8" placeholder="Filter Collections" />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarGroupAction aria-label="New Collection">
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {searchSets.map((searchSet) => (
                <SidebarMenuItem key={searchSet.slug}>
                  <SidebarMenuButton
                    isActive={searchSet.slug === activeSearchSet?.slug}
                    render={<a href="#" />}
                    tooltip={searchSet.display_name}
                  >
                    <Database />
                    <span>{searchSet.display_name}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{importedImageCount(searchSet)}</SidebarMenuBadge>
                  <SidebarMenuAction aria-label={`More actions for ${searchSet.display_name}`} showOnHover>
                    <MoreHorizontal />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Local runtime">
              <HardDrive />
              <span>Local runtime</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>{workerStatus}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      {config.collapsible === "icon" ? <SidebarRail /> : null}
    </Sidebar>
  );
}

function TopBar({
  activeSearchSet,
  config,
  showTrigger,
  variant,
}: {
  activeSearchSet: PrototypeSearchSet | null;
  config: VariantConfig;
  showTrigger: boolean;
  variant: SidebarPrototypeVariant;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {showTrigger ? (
        <>
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="mr-1 data-vertical:h-4 data-vertical:self-auto"
            orientation="vertical"
          />
        </>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {variant} - {config.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {config.description}
        </p>
      </div>
      {activeSearchSet ? (
        <Badge variant="outline">
          {importedImageCount(activeSearchSet)} images
        </Badge>
      ) : null}
    </header>
  );
}

function WorkspaceContent({
  activeSearchSet,
  apiBaseUrl,
  objects,
}: {
  activeSearchSet: PrototypeSearchSet | null;
  apiBaseUrl: string;
  objects: CollectionObjectSummary[];
}) {
  const provider = primaryProvider(activeSearchSet);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-7">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-4xl font-semibold md:text-5xl">
            {activeSearchSet?.display_name ?? "User Library"}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {(activeSearchSet?.terms ?? []).map((term) => (
              <Badge key={term.term} variant={term.active ? "default" : "secondary"}>
                {term.term}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">Provider Source</span>
            <Badge variant="secondary">
              <Activity data-icon="inline-start" />
              {providerStatus(activeSearchSet ?? {
                display_name: "",
                provider_collections: [],
                slug: "",
                terms: [],
              })}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-muted-foreground">
            <div>
              <div className="text-xs uppercase">Provider</div>
              <div className="text-foreground">{providerLabel(provider?.provider ?? "met")}</div>
            </div>
            <div>
              <div className="text-xs uppercase">Objects</div>
              <div className="text-foreground">
                {activeSearchSet ? importedObjectCount(activeSearchSet) : 0}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={IMAGE_GRID_CLASS_NAME}>
        {objects.map((object) => (
          <div
            className={IMAGE_GRID_TILE_CLASS_NAME}
            key={`${object.provider}-${object.object_id}`}
          >
            <AspectRatio ratio={4 / 5}>
              {/* Prototype route: same local derivatives as the production grid. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={object.title || `${providerLabel(object.provider)} object ${object.object_id}`}
                className={IMAGE_GRID_IMAGE_CLASS_NAME}
                src={imageUrl(apiBaseUrl, object.cover_thumb_url)}
              />
              {object.has_sibling_images ? (
                <Badge
                  className={cn(
                    "absolute right-1.5 top-1.5 h-5 px-1.5",
                    IMAGE_GRID_BADGE_CLASS_NAME,
                  )}
                  variant="secondary"
                >
                  <Images data-icon="inline-start" />
                  {object.image_count}
                </Badge>
              ) : null}
              <div className={IMAGE_GRID_OVERLAY_CLASS_NAME}>
                <Badge className={IMAGE_GRID_BADGE_CLASS_NAME} variant="secondary">
                  {providerLabel(object.provider)}
                </Badge>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight">
                  {object.title || "Untitled object"}
                </p>
              </div>
            </AspectRatio>
          </div>
        ))}
      </section>
    </div>
  );
}

function MainShell({
  children,
  config,
}: {
  children: ReactNode;
  config: VariantConfig;
}) {
  if (config.main === "inset") {
    return <SidebarInset>{children}</SidebarInset>;
  }

  return (
    <main className="relative flex min-h-svh flex-1 flex-col bg-background">
      {children}
    </main>
  );
}

export function SidebarPrototype({
  activeSearchSet,
  apiBaseUrl,
  appVersionStamp,
  libraryImageCount,
  objects,
  searchSets,
  variant,
  workerStatus,
}: SidebarPrototypeProps) {
  const config = variants[variant];
  const providerStyle = {
    "--sidebar-width": "21rem",
    "--sidebar-width-mobile": "20rem",
  } as CSSProperties;

  return (
    <SidebarProvider
      defaultOpen={config.defaultOpen}
      style={providerStyle}
    >
      <AppSidebar
        activeSearchSet={activeSearchSet}
        appVersionStamp={appVersionStamp}
        config={config}
        libraryImageCount={libraryImageCount}
        searchSets={searchSets}
        workerStatus={workerStatus}
      />
      <MainShell config={config}>
        <TopBar
          activeSearchSet={activeSearchSet}
          config={config}
          showTrigger={config.collapsible !== "none"}
          variant={variant}
        />
        <WorkspaceContent
          activeSearchSet={activeSearchSet}
          apiBaseUrl={apiBaseUrl}
          objects={objects}
        />
      </MainShell>
      <VariantSwitcher activeVariant={variant} />
    </SidebarProvider>
  );
}
