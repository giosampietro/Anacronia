"use client";

import { type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Library, Plus } from "lucide-react";

import { AppSpaceShell } from "@/components/app-space-shell";
import { APP_TOP_BAR_CONTROLS_ID } from "@/components/app-top-bar-portal";
import { SidebarCollectionFilter } from "@/components/sidebar-collection-filter";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
} from "@/components/ui/sidebar";
import {
  WorkspaceBrandHeader,
  WorkspaceProjectAttributionFooter,
  WorkspaceRuntimeStatusFooter,
  WorkspaceSidebarPreviewTrigger,
} from "@/components/workspace-sidebar-chrome";
import type { AppVersionStamp } from "@/lib/app-version";
import type { OperationalDashboardView } from "@/lib/dashboard";
import type { GridViewMode } from "@/lib/grid-view";
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
  defaultSidebarOpen?: boolean;
  filterText: string;
  gridViewImageHref?: string;
  gridViewMode?: GridViewMode;
  gridViewObjectHref?: string;
  rows: StatusRow[];
  workspaceMode: WorkspaceMode;
};

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
        <WorkspaceBrandHeader />
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
        <WorkspaceRuntimeStatusFooter appVersionStamp={appVersionStamp} rows={rows} />
        <WorkspaceProjectAttributionFooter />
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
    <AppSpaceShell activeSpace="library" contentClassName="min-w-0">
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
              <WorkspaceSidebarPreviewTrigger>
                <AppSidebarContent
                  activeSearchSetSlug={activeSearchSetSlug}
                  appVersionStamp={appVersionStamp}
                  collectAvailable={collectAvailable}
                  dashboardView={dashboardView}
                  filterText={filterText}
                  rows={rows}
                  workspaceMode={workspaceMode}
                />
              </WorkspaceSidebarPreviewTrigger>
            </div>
            <div
              className="@container/topbar flex min-w-0 flex-1 items-center"
              id={APP_TOP_BAR_CONTROLS_ID}
            />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </AppSpaceShell>
  );
}
