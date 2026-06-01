"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Library,
  Plus,
} from "lucide-react";

import { ThemeSwitch } from "@/components/theme-switch";
import { SidebarCollectionFilter } from "@/components/sidebar-collection-filter";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { AppVersionStamp } from "@/lib/app-version";
import type { OperationalDashboardView } from "@/lib/dashboard";
import type { StatusRow } from "@/lib/status";
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
  filterText: string;
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

function workspaceLabel({
  dashboardView,
  workspaceMode,
}: {
  dashboardView: OperationalDashboardView;
  workspaceMode: WorkspaceMode;
}) {
  if (workspaceMode === "new-search-set") {
    return "NEW COLLECTION";
  }
  if (workspaceMode === "user-library") {
    return "MY LIBRARY";
  }

  return (dashboardView.activeSearchSet?.displayName ?? "Collection").toUpperCase();
}

function shouldShowContentCounts(workspaceMode: WorkspaceMode): boolean {
  return workspaceMode === "search-set" || workspaceMode === "user-library";
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
            <SidebarMenuButton isActive={workspaceMode === "new-search-set"} />
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

function AppSidebar({
  activeSearchSetSlug,
  appVersionStamp,
  collectAvailable,
  dashboardView,
  filterText,
  rows,
  workspaceMode,
}: Omit<AppShellProps, "children">) {
  return (
    <Sidebar collapsible="icon" variant="inset">
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
              tooltip="User Library"
            >
              <Library />
              <span className="group-data-[collapsible=icon]:hidden">
                User Library
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
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="gap-3">
            <span className="truncate">Local runtime</span>
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function AppShell({
  activeSearchSetSlug,
  appVersionStamp,
  children,
  collectAvailable,
  contentHeaderImageCount = 0,
  contentHeaderObjectCount = 0,
  dashboardView,
  filterText,
  rows,
  workspaceMode,
}: AppShellProps) {
  const sidebarStyle = {
    "--sidebar-width": "21rem",
    "--sidebar-width-mobile": "20rem",
  } as CSSProperties;

  return (
    <SidebarProvider defaultOpen style={sidebarStyle}>
      <AppSidebar
        activeSearchSetSlug={activeSearchSetSlug}
        appVersionStamp={appVersionStamp}
        collectAvailable={collectAvailable}
        dashboardView={dashboardView}
        filterText={filterText}
        rows={rows}
        workspaceMode={workspaceMode}
      />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="data-vertical:h-4 data-vertical:self-auto"
            orientation="vertical"
          />
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="truncate text-sm font-semibold uppercase tracking-wide">
              {workspaceLabel({ dashboardView, workspaceMode })}
            </span>
          </div>
          {shouldShowContentCounts(workspaceMode) ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge className="shrink-0 tabular-nums" variant="outline">
                {contentHeaderObjectCount} objects
              </Badge>
              <Badge className="shrink-0 tabular-nums" variant="outline">
                {contentHeaderImageCount} images
              </Badge>
            </div>
          ) : null}
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
