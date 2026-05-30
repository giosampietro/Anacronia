"use client";

import { useFormStatus } from "react-dom";
import { Activity, Play, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

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

  return (
    <Button
      aria-busy={pending}
      disabled={disabled || pending}
      size="sm"
      type="submit"
      variant={variant}
    >
      {pending ? <Activity data-icon="inline-start" /> : idleIcon(actionKind, label)}
      {displayLabel}
    </Button>
  );
}
