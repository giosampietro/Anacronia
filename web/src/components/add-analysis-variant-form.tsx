"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type {
  AnalysisStudioCollectionChoice,
  AnalysisStudioRecipeChoice,
} from "@/lib/analysis-studio-read-model";

type AddAnalysisVariantFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  analysisId: string;
  disabledRecipeIds: string[];
  recipes: AnalysisStudioRecipeChoice[];
  sourceCollections: AnalysisStudioCollectionChoice[];
};

function recipeDetail(recipe: AnalysisStudioRecipeChoice): string {
  const size = recipe.inputSize ? `${recipe.inputSize}px` : "configured";
  return `${size} image embeddings, FAISS, UMAP, HDBSCAN, 32/64/96 atlases`;
}

function collectionNames(collections: AnalysisStudioCollectionChoice[]): string {
  const labels = collections.map((collection) => collection.label);
  return labels.length > 0 ? labels.join(", ") : "No source Collections";
}

export function initialSelectedVariantRecipeIds(): string[] {
  return [];
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} size="sm" type="submit">
      {pending ? (
        <Spinner className="size-3" data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      {pending ? "Starting..." : "Run variant"}
    </Button>
  );
}

export function AddAnalysisVariantForm({
  action,
  analysisId,
  disabledRecipeIds,
  recipes,
  sourceCollections,
}: AddAnalysisVariantFormProps) {
  const disabledRecipes = useMemo(
    () => new Set(disabledRecipeIds),
    [disabledRecipeIds],
  );
  const [selectedRecipeIds, setSelectedRecipeIds] = useState(
    initialSelectedVariantRecipeIds,
  );
  const canSubmit = selectedRecipeIds.length > 0;

  function toggleRecipe(recipeId: string, checked: boolean) {
    if (disabledRecipes.has(recipeId)) {
      return;
    }
    setSelectedRecipeIds((current) => {
      if (checked) {
        return current.includes(recipeId) ? current : [...current, recipeId];
      }
      return current.filter((id) => id !== recipeId);
    });
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus data-icon="inline-start" />
        Run variant
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Run variant</DialogTitle>
          <DialogDescription>
            Source Collections: {collectionNames(sourceCollections)}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input name="analysis_id" type="hidden" value={analysisId} />
          {selectedRecipeIds.map((recipeId) => (
            <input key={recipeId} name="recipe_ids" type="hidden" value={recipeId} />
          ))}
          <div className="grid gap-2">
            {recipes.map((recipe) => {
              const disabled = disabledRecipes.has(recipe.recipeId);
              const checked = selectedRecipeIds.includes(recipe.recipeId);
              return (
                <label
                  aria-disabled={disabled}
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-lg border bg-background p-3 hover:bg-muted/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                  key={recipe.recipeId}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
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
                  {disabled ? (
                    <span className="text-xs text-muted-foreground">
                      Already present
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <SubmitButton disabled={!canSubmit} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
