"use client";

import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { FlaskConical, Images, Network } from "lucide-react";

import { cn } from "@/lib/utils";

export type AppSpace = "library" | "analysis" | "explorer";

type AppSpaceShellProps = {
  activeSpace: AppSpace;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  focusModeAvailable?: boolean;
};

type AppSpaceLink = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  id: AppSpace;
  label: string;
};

type FocusModeShortcutInput = {
  altKey: boolean;
  ctrlKey: boolean;
  isContentEditable: boolean;
  key: string;
  metaKey: boolean;
  targetTagName: string | null;
};

const APP_SPACE_LINKS: AppSpaceLink[] = [
  {
    href: "/",
    icon: Images,
    id: "library",
    label: "Library / Collections",
  },
  {
    href: "/analysis-results",
    icon: FlaskConical,
    id: "analysis",
    label: "Analysis Studio",
  },
  {
    href: "/latent-map",
    icon: Network,
    id: "explorer",
    label: "Latent Space Explorer",
  },
];

const EDITABLE_TARGETS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

export function shouldToggleAppSpaceFocusMode({
  altKey,
  ctrlKey,
  isContentEditable,
  key,
  metaKey,
  targetTagName,
}: FocusModeShortcutInput): boolean {
  if (key.toLowerCase() !== "f" || altKey || ctrlKey || metaKey) {
    return false;
  }

  if (isContentEditable) {
    return false;
  }

  return !targetTagName || !EDITABLE_TARGETS.has(targetTagName.toUpperCase());
}

function AppSpaceRail({ activeSpace }: { activeSpace: AppSpace }) {
  return (
    <nav
      aria-label="App spaces"
      className="sticky top-0 z-30 flex min-h-svh w-16 shrink-0 flex-col items-center border-r border-border bg-background px-2 py-3 text-foreground"
      data-app-space-rail="true"
    >
      <Link
        aria-label="Anacronia Library / Collections"
        className="mb-5 flex size-10 items-center justify-center rounded-md border border-border text-sm font-semibold"
        href="/"
      >
        A
      </Link>
      <div className="flex flex-1 flex-col items-center gap-2">
        {APP_SPACE_LINKS.map((space) => {
          const Icon = space.icon;
          const isActive = space.id === activeSpace;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              aria-label={space.label}
              className={cn(
                "group flex size-10 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring",
                isActive &&
                  "bg-accent text-accent-foreground ring-1 ring-border",
              )}
              data-active={isActive ? "true" : "false"}
              href={space.href}
              key={space.id}
              title={space.label}
            >
              <Icon className="size-4" />
              <span className="sr-only">{space.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppSpaceShell({
  activeSpace,
  children,
  className,
  contentClassName,
  focusModeAvailable = false,
}: AppSpaceShellProps) {
  const [focusModeActive, setFocusModeActive] = useState(false);

  useEffect(() => {
    if (!focusModeAvailable) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;

      if (
        !shouldToggleAppSpaceFocusMode({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          isContentEditable: target?.isContentEditable ?? false,
          key: event.key,
          metaKey: event.metaKey,
          targetTagName: target?.tagName ?? null,
        })
      ) {
        return;
      }

      event.preventDefault();
      setFocusModeActive((isActive) => !isActive);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusModeAvailable]);

  return (
    <div
      className={cn(
        "flex min-h-svh w-full bg-background text-foreground",
        className,
      )}
      data-active-space={activeSpace}
      data-app-space-shell="true"
      data-focus-mode-active={focusModeActive}
      data-focus-mode-available={focusModeAvailable}
    >
      {focusModeActive ? null : <AppSpaceRail activeSpace={activeSpace} />}
      <div className={cn("min-w-0 flex-1", contentClassName)}>{children}</div>
    </div>
  );
}
