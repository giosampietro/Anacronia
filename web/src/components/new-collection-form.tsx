"use client";

import { type ReactNode, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Play } from "lucide-react";

import { BatchTargetControl } from "@/components/batch-target-control";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  canStartNewCollectionSearch,
  isDuplicateCollectionName,
  type ExistingCollectionIdentity,
} from "@/lib/new-collection";

export type NewCollectionServerError = "duplicate_name";

type NewCollectionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  existingCollections?: ExistingCollectionIdentity[];
  serverError?: NewCollectionServerError | null;
};

const providerSources = [
  { label: "Met", value: "met", disabled: false },
  { label: "V&A", value: "vna", disabled: true },
  { label: "Europeana", value: "europeana", disabled: true },
] as const;

const selectedProviderSource = "met";

function StepNumber({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-7 items-center justify-center rounded-full border bg-muted text-sm font-medium">
      {children}
    </span>
  );
}

function StepCard({
  children,
  number,
  title,
}: {
  children: ReactNode;
  number: number;
  title: string;
}) {
  return (
    <Card className="gap-3" size="sm">
      <CardHeader className="gap-3">
        <StepNumber>{number}</StepNumber>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function ImageSourceControl() {
  return (
    <ToggleGroup
      aria-label="Image source"
      className="flex flex-wrap"
      size="sm"
      value={[selectedProviderSource]}
      variant="outline"
    >
      {providerSources.map((provider) => {
        const selected = provider.value === selectedProviderSource;

        return (
          <ToggleGroupItem
            disabled={provider.disabled}
            key={provider.value}
            size="sm"
            title={provider.disabled ? "Not available yet" : undefined}
            type="button"
            value={provider.value}
          >
            {selected ? <Check data-icon="inline-start" /> : null}
            {provider.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function StartSearchButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-busy={pending}
      disabled={disabled || pending}
      size="lg"
      type="submit"
    >
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      {pending ? "Starting..." : "Start search"}
    </Button>
  );
}

export function NewCollectionForm({
  action,
  existingCollections = [],
  serverError = null,
}: NewCollectionFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [termsText, setTermsText] = useState("");
  const duplicateName = isDuplicateCollectionName(displayName, existingCollections);
  const serverDuplicateName = serverError === "duplicate_name" && displayName.trim() === "";
  const nameError = duplicateName || serverDuplicateName
    ? "A Collection with this name already exists."
    : "";
  const canStart = canStartNewCollectionSearch(
    displayName,
    termsText,
    existingCollections,
  );

  return (
    <form
      action={action}
      autoComplete="off"
      className="mx-auto flex w-full max-w-4xl flex-col gap-4"
    >
      <input name="display_name" type="hidden" value={displayName} />
      <StepCard number={1} title="Name the Collection">
        <Field data-invalid={Boolean(nameError)}>
          <FieldLabel className="sr-only" htmlFor="collection_name_entry">
            Collection name
          </FieldLabel>
          <Input
            aria-describedby={nameError ? "collection_name_error" : undefined}
            aria-invalid={Boolean(nameError)}
            autoComplete="off"
            autoCorrect="off"
            id="collection_name_entry"
            name="collection_name_entry"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            placeholder="Snake studies"
            required
            spellCheck={false}
            value={displayName}
          />
          <FieldError id="collection_name_error">{nameError}</FieldError>
        </Field>
      </StepCard>

      <StepCard number={2} title="Add search terms">
        <Field>
          <FieldLabel className="sr-only" htmlFor="terms_text">
            Search terms
          </FieldLabel>
          <Textarea
            className="min-h-28 resize-y"
            id="terms_text"
            name="terms_text"
            onChange={(event) => setTermsText(event.currentTarget.value)}
            placeholder={"snake\nserpent\ncobra"}
            required
            value={termsText}
          />
          <FieldDescription>
            Use a new line for each term, or separate several terms with commas.
          </FieldDescription>
        </Field>
      </StepCard>

      <StepCard number={3} title="Search image source">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
          <Field className="gap-2">
            <ImageSourceControl />
          </Field>
          <BatchTargetControl idPrefix="new_collection" />
        </div>
      </StepCard>

      <div className="flex justify-end">
        <StartSearchButton disabled={!canStart} />
      </div>
    </form>
  );
}
