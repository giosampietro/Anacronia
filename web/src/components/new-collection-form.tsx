"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";

import { BatchTargetControl } from "@/components/batch-target-control";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canStartNewCollectionSearch } from "@/lib/new-collection";
import { parseSearchTerms, termDetectionLabel } from "@/lib/search-terms";

type NewCollectionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  collectAvailable: boolean;
};

export function NewCollectionForm({
  action,
  collectAvailable,
}: NewCollectionFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [termsText, setTermsText] = useState("");
  const terms = useMemo(() => parseSearchTerms(termsText), [termsText]);
  const canStart = canStartNewCollectionSearch(displayName, termsText);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Collection</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="display_name">Display name</FieldLabel>
              <Input
                id="display_name"
                name="display_name"
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                required
                value={displayName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="terms_text">Terms</FieldLabel>
              <Textarea
                className="min-h-32 resize-y"
                id="terms_text"
                name="terms_text"
                onChange={(event) => setTermsText(event.currentTarget.value)}
                placeholder="snake, anaconda, serpent"
                required
                value={termsText}
              />
              <FieldDescription>{termDetectionLabel(terms)}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {collectAvailable ? (
        <Card>
          <CardHeader>
            <CardTitle>Met</CardTitle>
          </CardHeader>
          <CardContent>
            <BatchTargetControl idPrefix="new_collection" />
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t bg-muted/50">
            <Button disabled={!canStart} type="submit">
              <Play data-icon="inline-start" />
              Start search
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Search unavailable</CardTitle>
            <CardDescription>
              Another search is already active. New Collections can start after the current
              search finishes.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </form>
  );
}
