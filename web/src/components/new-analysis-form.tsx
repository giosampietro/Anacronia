"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { Plus, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type {
  AnalysisStudioCollectionChoice,
  AnalysisStudioRecipeChoice,
} from "@/lib/analysis-studio-read-model";

type NewAnalysisFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  collections: AnalysisStudioCollectionChoice[];
  recipes: AnalysisStudioRecipeChoice[];
};

type ScopePreview = {
  counts: {
    activeImages: number;
    duplicatesCollapsed: number;
  };
  itemCount: number;
};

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
      <CardHeader className="flex flex-row items-center gap-3">
        <StepNumber>{number}</StepNumber>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-busy={pending}
      className="self-start"
      disabled={disabled || pending}
      size="lg"
      type="submit"
    >
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      {pending ? "Starting..." : "Start analysis"}
    </Button>
  );
}

function recipeDetail(recipe: AnalysisStudioRecipeChoice): string {
  const size = recipe.inputSize ? `${recipe.inputSize}px` : "configured";
  return `${size} image embeddings, FAISS, UMAP, HDBSCAN, 32/64/96 atlases`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeScopePreview(payload: unknown): ScopePreview | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const preview = (payload as { scope_preview?: unknown }).scope_preview;
  if (!preview || typeof preview !== "object") {
    return null;
  }
  const counts = (preview as { counts?: unknown }).counts;
  if (!counts || typeof counts !== "object") {
    return null;
  }
  const countRecord = counts as Record<string, unknown>;
  return {
    counts: {
      activeImages: normalizeNumber(countRecord.active_images),
      duplicatesCollapsed: normalizeNumber(countRecord.duplicates_collapsed),
    },
    itemCount: normalizeNumber((preview as { item_count?: unknown }).item_count),
  };
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function NewAnalysisForm({
  action,
  collections,
  recipes,
}: NewAnalysisFormProps) {
  const defaultRecipeIds = useMemo(() => {
    const defaults = recipes.filter((recipe) => recipe.isDefault);
    return (defaults.length > 0 ? defaults : recipes.slice(0, 1)).map(
      (recipe) => recipe.recipeId,
    );
  }, [recipes]);
  const [title, setTitle] = useState("");
  const [collectionSlugs, setCollectionSlugs] = useState([""]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState(defaultRecipeIds);
  const [scopePreview, setScopePreview] = useState<ScopePreview | null>(null);
  const [scopePreviewStatus, setScopePreviewStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable"
  >("idle");
  const selectedCollectionSlugs = collectionSlugs.filter(Boolean);
  const selectedCollectionKey = selectedCollectionSlugs.join("\u0000");
  const canAddCollection = collectionSlugs.length < collections.length;
  const canStart =
    title.trim() !== "" &&
    selectedCollectionSlugs.length > 0 &&
    selectedRecipeIds.length > 0;

  useEffect(() => {
    if (selectedCollectionSlugs.length === 0) {
      setScopePreview(null);
      setScopePreviewStatus("idle");
      return;
    }

    const abortController = new AbortController();
    setScopePreviewStatus("loading");
    fetch("/api/analysis-scopes/preview", {
      body: JSON.stringify({ collection_slugs: selectedCollectionSlugs }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Scope preview unavailable.");
        }
        const preview = normalizeScopePreview(await response.json());
        if (preview === null) {
          throw new Error("Scope preview unavailable.");
        }
        setScopePreview(preview);
        setScopePreviewStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setScopePreview(null);
        setScopePreviewStatus("unavailable");
      });

    return () => abortController.abort();
  }, [selectedCollectionKey]);

  function setCollectionSlug(index: number, value: string) {
    setCollectionSlugs((current) =>
      current.map((slug, currentIndex) =>
        currentIndex === index ? value : slug,
      ),
    );
  }

  function addCollectionRow() {
    if (canAddCollection) {
      setCollectionSlugs((current) => [...current, ""]);
    }
  }

  function removeCollectionRow(index: number) {
    setCollectionSlugs((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function toggleRecipe(recipeId: string, checked: boolean) {
    setSelectedRecipeIds((current) => {
      if (checked) {
        return current.includes(recipeId) ? current : [...current, recipeId];
      }
      return current.filter((id) => id !== recipeId);
    });
  }

  return (
    <form
      action={action}
      autoComplete="off"
      className="mx-auto flex w-full max-w-4xl flex-col gap-4"
    >
      <StepCard number={1} title="Name the Analysis">
        <Field className="md:w-1/2">
          <FieldLabel className="sr-only" htmlFor="analysis_title">
            Analysis title
          </FieldLabel>
          <Input
            autoComplete="off"
            autoCorrect="off"
            id="analysis_title"
            name="title"
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="Bread visual study"
            required
            spellCheck={false}
            value={title}
          />
        </Field>
      </StepCard>

      <StepCard number={2} title="Choose Collections">
        <div className="grid gap-2 md:w-2/3">
          {collectionSlugs.map((slug, index) => {
            const selectedElsewhere = new Set(
              collectionSlugs.filter((_, currentIndex) => currentIndex !== index),
            );
            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
                key={index}
              >
                <Field>
                  <FieldLabel className="sr-only" htmlFor={`analysis_collection_${index}`}>
                    {`Collection ${index + 1}`}
                  </FieldLabel>
                  <NativeSelect
                    aria-label={`Collection ${index + 1}`}
                    className="w-full"
                    disabled={collections.length === 0}
                    id={`analysis_collection_${index}`}
                    name="collection_slugs"
                    onChange={(event) =>
                      setCollectionSlug(index, event.currentTarget.value)
                    }
                    required={index === 0}
                    value={slug}
                  >
                    <NativeSelectOption value="">Choose Collection</NativeSelectOption>
                    {collections.map((collection) => (
                      <NativeSelectOption
                        disabled={selectedElsewhere.has(collection.slug)}
                        key={collection.slug}
                        value={collection.slug}
                      >
                        {collection.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                {index > 0 ? (
                  <Button
                    aria-label={`Remove Collection ${index + 1}`}
                    onClick={() => removeCollectionRow(index)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                ) : (
                  <span aria-hidden="true" className="size-7" />
                )}
              </div>
            );
          })}
        </div>
        <Button
          disabled={!canAddCollection}
          onClick={addCollectionRow}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus data-icon="inline-start" />
          Add Collection
        </Button>
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <div className="font-medium">Scope preview</div>
          {scopePreviewStatus === "idle" ? (
            <div className="text-muted-foreground">Select at least one Collection.</div>
          ) : null}
          {scopePreviewStatus === "loading" ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-3" />
              Resolving scope
            </div>
          ) : null}
          {scopePreviewStatus === "ready" && scopePreview ? (
            <div className="text-muted-foreground">
              {formatCount(scopePreview.itemCount, "image")}
              {scopePreview.counts.duplicatesCollapsed > 0
                ? `, ${formatCount(scopePreview.counts.duplicatesCollapsed, "duplicate")} collapsed`
                : ", no duplicates collapsed"}
            </div>
          ) : null}
          {scopePreviewStatus === "unavailable" ? (
            <div className="text-muted-foreground">Scope unavailable.</div>
          ) : null}
        </div>
      </StepCard>

      <StepCard number={3} title="Choose Recipes">
        <div className="grid gap-2">
          {selectedRecipeIds.map((recipeId) => (
            <input key={recipeId} name="recipe_ids" type="hidden" value={recipeId} />
          ))}
          {recipes.map((recipe) => {
            const checked = selectedRecipeIds.includes(recipe.recipeId);
            return (
              <label
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border bg-background p-3 hover:bg-muted/50"
                key={recipe.recipeId}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    toggleRecipe(recipe.recipeId, value === true)
                  }
                />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">{recipe.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {recipeDetail(recipe)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <SubmitButton disabled={!canStart} />
      </StepCard>
    </form>
  );
}
