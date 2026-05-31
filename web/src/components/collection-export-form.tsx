"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import {
  exportActionLabel,
  exportPendingLabel,
  type CollectionExportFormat,
} from "@/lib/export-workflow";
import { cn } from "@/lib/utils";

const EXPORT_FORMAT_OPTIONS: Array<{
  format: CollectionExportFormat;
  title: string;
  description: string;
}> = [
  {
    format: "jsonl",
    title: "JSONL",
    description: "Metadata manifest for Python and AI workflows.",
  },
  {
    format: "csv",
    title: "CSV",
    description: "Spreadsheet-friendly metadata.",
  },
  {
    format: "package",
    title: "Package",
    description: "Metadata plus copied image derivatives.",
  },
];

function isCollectionExportFormat(value: string): value is CollectionExportFormat {
  return value === "jsonl" || value === "csv" || value === "package";
}

function ExportSubmitButton({
  available,
  format,
}: {
  available: boolean;
  format: CollectionExportFormat;
}) {
  const { pending } = useFormStatus();
  const label = pending ? exportPendingLabel(format) : exportActionLabel(format);

  return (
    <Button aria-busy={pending} disabled={!available || pending} size="sm" type="submit">
      {pending ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
      {label}
    </Button>
  );
}

export function CollectionExportForm({
  action,
  available,
  initialOpen,
  searchSetSlug,
}: {
  action: (formData: FormData) => Promise<void>;
  available: boolean;
  initialOpen: boolean;
  searchSetSlug: string;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [format, setFormat] = useState<CollectionExportFormat>("jsonl");

  if (!open) {
    return (
      <div className="flex w-full justify-end">
        <Button disabled={!available} size="sm" type="button" onClick={() => setOpen(true)}>
          <Download data-icon="inline-start" />
          Export...
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <input name="slug" type="hidden" value={searchSetSlug} />
      <input name="export_format" type="hidden" value={format} />
      <RadioGroup
        aria-label="Export format"
        className="grid gap-2 md:grid-cols-3"
        value={format}
        onValueChange={(value) => {
          if (isCollectionExportFormat(value)) {
            setFormat(value);
          }
        }}
      >
        {EXPORT_FORMAT_OPTIONS.map((option) => {
          const id = `${searchSetSlug}-export-${option.format}`;
          const selected = format === option.format;

          return (
            <Item
              className={cn(
                "cursor-pointer items-start",
                "hover:bg-muted/50 has-disabled:cursor-not-allowed has-disabled:opacity-50",
                selected && "border-ring shadow-xs"
              )}
              key={option.format}
              render={<label htmlFor={id} />}
              variant={selected ? "muted" : "outline"}
            >
              <ItemMedia>
                <RadioGroupItem disabled={!available} id={id} value={option.format} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{option.title}</ItemTitle>
                <ItemDescription>{option.description}</ItemDescription>
              </ItemContent>
            </Item>
          );
        })}
      </RadioGroup>
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <ExportSubmitButton available={available} format={format} />
      </div>
    </form>
  );
}
