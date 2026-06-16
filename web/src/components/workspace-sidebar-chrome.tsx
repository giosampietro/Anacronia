"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  ChevronRight,
  CircleAlert,
  CircleCheck,
} from "lucide-react";

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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AppVersionStamp } from "@/lib/app-version";
import { FOOTER_PROJECT_CREDIT } from "@/lib/project-attribution";
import type { StatusRow } from "@/lib/status";
import { cn } from "@/lib/utils";

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

export function WorkspaceRuntimeStatusFooter({
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

export function WorkspaceProjectAttributionFooter() {
  return (
    <p className="px-2 pb-1 text-[11px] leading-4 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
      {FOOTER_PROJECT_CREDIT}
    </p>
  );
}

export function WorkspaceBrandHeader({
  label = "Anacronia",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-12 min-w-0 items-center rounded-xl px-2 group-data-[collapsible=icon]:hidden">
      <span className="truncate text-lg font-semibold">{label}</span>
    </div>
  );
}

export function WorkspaceSidebarPreviewTrigger({
  children,
}: {
  children: ReactNode;
}) {
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
        <PopoverHeader className="sr-only">
          <PopoverTitle>Sidebar preview</PopoverTitle>
          <PopoverDescription>Preview the current workspace sidebar.</PopoverDescription>
        </PopoverHeader>
        <div
          className="flex max-h-[calc(100svh-1rem)] min-h-0 w-full flex-col"
          data-sidebar-preview="true"
        >
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
