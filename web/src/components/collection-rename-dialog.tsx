"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type CollectionRenameDialogProps = {
  collectionName: string;
  onOpenChange: (open: boolean) => void;
  onRename: (nextName: string) => Promise<string | null | undefined>;
  open: boolean;
};

type CollectionRenameDialogFormProps = {
  collectionName: string;
  onCancel: () => void;
  onRename: (nextName: string) => Promise<string | null | undefined>;
};

export function CollectionRenameDialogForm({
  collectionName,
  onCancel,
  onRename,
}: CollectionRenameDialogFormProps) {
  const [name, setName] = useState(collectionName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();

    if (nextName === "") {
      setError("Collection name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    const renameError = await onRename(nextName);
    setIsSaving(false);

    if (renameError) {
      setError(renameError);
      return;
    }

    onCancel();
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="text-2xl">Rename collection</DialogTitle>
        <DialogDescription className="text-lg">
          Keep it short and recognizable.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-3">
        <Field data-invalid={error !== null}>
          <FieldLabel className="sr-only" htmlFor="collection_rename_name">
            Collection name
          </FieldLabel>
          <Input
            aria-invalid={error !== null}
            data-select-on-focus="true"
            disabled={isSaving}
            id="collection_rename_name"
            name="collection_name"
            onChange={(event) => setName(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            ref={inputRef}
            value={name}
          />
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button disabled={isSaving} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isSaving} type="submit">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CollectionRenameDialog({
  collectionName,
  onOpenChange,
  onRename,
  open,
}: CollectionRenameDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <CollectionRenameDialogForm
          key={collectionName}
          collectionName={collectionName}
          onCancel={() => onOpenChange(false)}
          onRename={onRename}
        />
      </DialogContent>
    </Dialog>
  );
}
