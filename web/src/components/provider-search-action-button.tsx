"use client";

import { useFormStatus } from "react-dom";
import { Play, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { announceProviderSearchRefresh } from "@/lib/dashboard-refresh";
import { cn } from "@/lib/utils";

type ProviderSearchActionButtonProps = {
  actionKind: "start" | "stop" | "resume";
  disabled: boolean;
  label: string;
  variant?: "default" | "outline";
};

function pendingLabel(actionKind: ProviderSearchActionButtonProps["actionKind"], label: string): string {
  if (actionKind === "stop") {
    return "Stopping...";
  }
  if (actionKind === "resume") {
    return "Resuming...";
  }
  if (label === "Keep searching") {
    return "Searching...";
  }

  return "Starting...";
}

function idleIcon(actionKind: ProviderSearchActionButtonProps["actionKind"], label: string) {
  if (actionKind === "stop") {
    return <Square data-icon="inline-start" />;
  }
  if (actionKind === "resume" || label === "Keep searching") {
    return <RotateCcw data-icon="inline-start" />;
  }

  return <Play data-icon="inline-start" />;
}

export function ProviderSearchActionButton({
  actionKind,
  disabled,
  label,
  variant = "default",
}: ProviderSearchActionButtonProps) {
  const { pending } = useFormStatus();
  const displayLabel = pending ? pendingLabel(actionKind, label) : label;

  if (disabled) {
    return (
      <Popover>
        <PopoverTrigger
          nativeButton
          render={
            <Button
              aria-busy={false}
              aria-disabled="true"
              className={cn(
                "cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground",
                variant === "outline" && "border-border bg-background",
              )}
              data-disabled="true"
              size="sm"
              title={`${label} unavailable`}
              type="button"
              variant={variant}
            />
          }
        >
          {idleIcon(actionKind, label)}
          {label}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80" side="top">
          <PopoverHeader>
            <PopoverTitle>A search is already running</PopoverTitle>
            <PopoverDescription>
              Let this one finish or stop it before searching this Collection.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button
      aria-busy={pending}
      disabled={disabled || pending}
      onClick={() => announceProviderSearchRefresh()}
      size="sm"
      type="submit"
      variant={variant}
    >
      {pending ? <Spinner data-icon="inline-start" /> : idleIcon(actionKind, label)}
      {displayLabel}
    </Button>
  );
}
