"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  HardDrive,
  Library,
  Plus,
} from "lucide-react";

import { ThemeSwitch } from "@/components/theme-switch";
import { SidebarCollectionFilter } from "@/components/sidebar-collection-filter";
import { Badge } from "@/components/ui/badge";
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
    return "New Collection";
  }
  if (workspaceMode === "user-library") {
    return "User Library";
  }

  return dashboardView.activeSearchSet?.displayName ?? "Collection";
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

function AppSidebar({
  activeSearchSetSlug,
  appVersionStamp,
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
          <div className="flex h-8 items-center justify-between gap-3 px-2 text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:justify-center">
            <div className="flex min-w-0 items-center gap-2">
              <HardDrive />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                Local runtime
              </span>
            </div>
            <Badge
              className="h-5 shrink-0 px-1.5 font-mono text-[10px] text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden"
              title={appVersionStamp.title}
              variant="outline"
            >
              {appVersionStamp.display}
            </Badge>
          </div>
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
        dashboardView={dashboardView}
        filterText={filterText}
        rows={rows}
        workspaceMode={workspaceMode}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="data-vertical:h-4 data-vertical:self-auto"
            orientation="vertical"
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {workspaceLabel({ dashboardView, workspaceMode })}
            </span>
            {workspaceMode === "search-set" && dashboardView.activeSearchSet ? (
              <Badge className="shrink-0" variant="outline">
                {dashboardView.activeSearchSet.importedImageCount} images
              </Badge>
            ) : null}
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
