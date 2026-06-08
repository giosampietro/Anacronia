"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Library,
  Plus,
} from "lucide-react";

import { APP_TOP_BAR_CONTROLS_ID } from "@/components/app-top-bar-portal";
import { ThemeSwitch } from "@/components/theme-switch";
import { SidebarCollectionFilter } from "@/components/sidebar-collection-filter";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AppVersionStamp } from "@/lib/app-version";
import type { OperationalDashboardView } from "@/lib/dashboard";
import type { GridViewMode } from "@/lib/grid-view";
import { FOOTER_PROJECT_CREDIT } from "@/lib/project-attribution";
import type { StatusRow } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "@/lib/workspace";
import {
  createNewSearchSetHref,
  createUserLibraryHref,
} from "@/lib/workspace";

type AppShellProps = {
  activeSearchSetSlug: string | null;
  appVersionStamp: AppVersionStamp;
  children: ReactNode;
  collectAvailable: boolean;
  contentHeaderImageCount?: number;
  contentHeaderObjectCount?: number;
  dashboardView: OperationalDashboardView;
  defaultSidebarOpen?: boolean;
  filterText: string;
  gridViewImageHref?: string;
  gridViewMode?: GridViewMode;
  gridViewObjectHref?: string;
  rows: StatusRow[];
  workspaceMode: WorkspaceMode;
};

function runtimeStatusIcon(state: string) {
  if (state === "ok" || state === "completed") {
    return <CircleCheck />;
  }
  if (state === "error") {
    return <CircleAlert />;
  }
  if (state === "running" || state === "stopping") {
    return <Spinner />;
  }
  return <Activity />;
}

function runtimeSummaryRow(rows: StatusRow[]): StatusRow | null {
  return (
    rows.find((row) => row.name.toLowerCase().includes("python")) ??
    rows.find((row) => row.name.toLowerCase().includes("worker")) ??
    rows[0] ??
    null
  );
}

function RuntimeStatusFooter({
  appVersionStamp,
  rows,
}: {
  appVersionStamp: AppVersionStamp;
  rows: StatusRow[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const summaryRow = runtimeSummaryRow(rows);
  const summaryState = summaryRow?.displayState ?? "unknown";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <CollapsibleTrigger
            aria-label={isOpen ? "Collapse runtime status" : "Expand runtime status"}
            render={<SidebarMenuButton tooltip="Runtime status" />}
          >
            {runtimeStatusIcon(summaryRow?.state ?? "idle")}
            <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
              Runtime status
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
              {summaryState}
            </span>
            <ChevronRight
              className={cn(
                "ml-1 text-sidebar-foreground/45 transition-transform group-data-[collapsible=icon]:hidden",
                isOpen && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
        </SidebarMenuItem>
      </SidebarMenu>

      <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
        <SidebarGroup className="px-0 pb-0 pt-2">
          <SidebarGroupLabel className="gap-3 px-3">
            <span className="truncate">Runtime details</span>
            <Badge
              className="ml-auto h-5 shrink-0 px-1.5 font-mono text-[10px] text-sidebar-foreground/70"
              title={appVersionStamp.title}
              variant="outline"
            >
              {appVersionStamp.display}
            </Badge>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {rows.map((row) => (
                <SidebarMenuItem key={row.name}>
                  <SidebarMenuButton tooltip={row.detail}>
                    {runtimeStatusIcon(row.state)}
                    <span className="group-data-[collapsible=icon]:hidden">
                      {row.name}
                    </span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{row.displayState}</SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProjectAttributionFooter() {
  return (
    <p className="px-2 pb-1 text-[11px] leading-4 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
      {FOOTER_PROJECT_CREDIT}
    </p>
  );
}

function BrandHeader() {
  return (
    <div className="flex h-12 min-w-0 items-center gap-3 rounded-xl px-2 group-data-[collapsible=icon]:hidden">
      <span className="truncate text-lg font-semibold">Anacronia</span>
      <div className="ml-auto shrink-0">
        <ThemeSwitch />
      </div>
    </div>
  );
}

function NewCollectionSidebarItem({
  collectAvailable,
  filterText,
  workspaceMode,
}: {
  collectAvailable: boolean;
  filterText: string;
  workspaceMode: WorkspaceMode;
}) {
  if (collectAvailable) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={workspaceMode === "new-search-set"}
          render={<Link href={createNewSearchSetHref(filterText)} />}
          tooltip="New Collection"
        >
          <Plus />
          <span className="group-data-[collapsible=icon]:hidden">
            New Collection
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Popover>
        <PopoverTrigger
          nativeButton
          render={
            <SidebarMenuButton
              aria-disabled="true"
              className="cursor-not-allowed text-sidebar-foreground/60 hover:bg-transparent hover:text-sidebar-foreground/60 active:bg-transparent active:text-sidebar-foreground/60 data-open:bg-sidebar-accent/40 data-open:text-sidebar-foreground/75"
              data-disabled="true"
              isActive={false}
              title="New Collection unavailable"
            />
          }
        >
          <Plus />
          <span className="group-data-[collapsible=icon]:hidden">
            New Collection
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80" side="right">
          <PopoverHeader>
            <PopoverTitle>A search is already running</PopoverTitle>
            <PopoverDescription>
              Let this one finish or stop it before starting a new Collection.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}

type AppSidebarContentProps = Pick<
  AppShellProps,
  | "activeSearchSetSlug"
  | "appVersionStamp"
  | "collectAvailable"
  | "dashboardView"
  | "filterText"
  | "rows"
  | "workspaceMode"
>;

function AppSidebarContent({
  activeSearchSetSlug,
  appVersionStamp,
  collectAvailable,
  dashboardView,
  filterText,
  rows,
  workspaceMode,
}: AppSidebarContentProps) {
  return (
    <>
      <SidebarHeader>
        <BrandHeader />
        <SidebarMenu className="gap-3">
          <NewCollectionSidebarItem
            collectAvailable={collectAvailable}
            filterText={filterText}
            workspaceMode={workspaceMode}
          />
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={workspaceMode === "user-library"}
              render={<Link href={createUserLibraryHref(filterText)} />}
              tooltip="My Library"
            >
              <Library />
              <span className="group-data-[collapsible=icon]:hidden">
                My Library
              </span>
            </SidebarMenuButton>
            <SidebarMenuBadge>{dashboardView.libraryImageCount}</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarCollectionFilter
              key={`${workspaceMode}:${activeSearchSetSlug ?? "none"}`}
              activeSearchSetSlug={activeSearchSetSlug}
              initialFilterText={filterText}
              searchSets={dashboardView.searchSets}
              workspaceMode={workspaceMode}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <RuntimeStatusFooter appVersionStamp={appVersionStamp} rows={rows} />
        <ProjectAttributionFooter />
      </SidebarFooter>
    </>
  );
}

function AppSidebar(props: AppSidebarContentProps) {
  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <AppSidebarContent {...props} />
    </Sidebar>
  );
}

function SidebarPreviewTrigger(props: AppSidebarContentProps) {
  const { isMobile, state } = useSidebar();
  const previewEnabled = !isMobile && state === "collapsed";

  if (!previewEnabled) {
    return <SidebarTrigger className="-ml-1" />;
  }

  return (
    <Popover modal={false}>
      <PopoverTrigger
        closeDelay={140}
        data-sidebar-preview-trigger="true"
        delay={100}
        openOnHover
        render={
          <SidebarTrigger
            aria-label="Open sidebar"
            className="-ml-1"
            data-sidebar-preview-trigger="true"
          />
        }
      />
      <PopoverContent
        align="start"
        alignOffset={-10}
        className="z-50 flex max-h-[calc(100svh-1rem)] w-(--sidebar-width) overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-2xl ring-1 ring-sidebar-border/70 duration-150 data-closed:fade-out-0 data-open:fade-in-0 motion-reduce:duration-75"
        finalFocus={false}
        initialFocus={false}
        side="right"
        sideOffset={10}
      >
        <div
          className="flex max-h-[calc(100svh-1rem)] min-h-0 w-full flex-col"
          data-sidebar-preview="true"
        >
          <AppSidebarContent {...props} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({
  activeSearchSetSlug,
  appVersionStamp,
  children,
  collectAvailable,
  dashboardView,
  defaultSidebarOpen = true,
  filterText,
  rows,
  workspaceMode,
}: AppShellProps) {
  const sidebarStyle = {
    "--sidebar-width": "21rem",
    "--sidebar-width-mobile": "20rem",
  } as CSSProperties;
  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} style={sidebarStyle}>
      <AppSidebar
        activeSearchSetSlug={activeSearchSetSlug}
        appVersionStamp={appVersionStamp}
        collectAvailable={collectAvailable}
        dashboardView={dashboardView}
        filterText={filterText}
        rows={rows}
        workspaceMode={workspaceMode}
      />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-40 flex min-h-12 shrink-0 items-center gap-1 border-b bg-background px-3 py-3">
          <div
            aria-label="Workspace"
            className="flex shrink-0 items-center gap-3"
          >
            <SidebarPreviewTrigger
              activeSearchSetSlug={activeSearchSetSlug}
              appVersionStamp={appVersionStamp}
              collectAvailable={collectAvailable}
              dashboardView={dashboardView}
              filterText={filterText}
              rows={rows}
              workspaceMode={workspaceMode}
            />
          </div>
          <div
            className="@container/topbar flex min-w-0 flex-1 items-center"
            id={APP_TOP_BAR_CONTROLS_ID}
          />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
