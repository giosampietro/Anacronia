"use client";

import { useMemo, useState } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { parseSearchTerms, termDetectionLabel } from "@/lib/search-terms";

type TermsFieldProps = {
  id: string;
  name: string;
  placeholder?: string;
  required?: boolean;
};

export function TermsField({ id, name, placeholder, required }: TermsFieldProps) {
  const [termsText, setTermsText] = useState("");
  const terms = useMemo(() => parseSearchTerms(termsText), [termsText]);

  return (
    <Field>
      <FieldLabel htmlFor={id}>Terms</FieldLabel>
      <Textarea
        className="min-h-32 resize-y"
        id={id}
        name={name}
        onChange={(event) => setTermsText(event.currentTarget.value)}
        onInput={(event) => setTermsText(event.currentTarget.value)}
        placeholder={placeholder}
        required={required}
        value={termsText}
      />
      <FieldDescription>{termDetectionLabel(terms)}</FieldDescription>
    </Field>
  );
}
