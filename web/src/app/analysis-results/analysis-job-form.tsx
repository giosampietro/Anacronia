"use client";

import { useState } from "react";

export type AnalysisJobFormCollection = {
  display_name?: string;
  slug: string;
};

type AnalysisJobFormProps = {
  collectionApiUnavailable: boolean;
  collections: AnalysisJobFormCollection[];
};

export function AnalysisJobForm({
  collectionApiUnavailable,
  collections,
}: AnalysisJobFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      action="/api/analysis-jobs"
      className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
      method="post"
      onSubmit={() => setIsSubmitting(true)}
    >
      {collections.length > 0 ? (
        <label className="grid gap-2 text-sm text-neutral-300">
          Collection
          <select
            className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none transition focus:border-neutral-500"
            name="collection_slugs"
          >
            {collections.map((collection) => (
              <option key={collection.slug} value={collection.slug}>
                {collection.display_name ?? collection.slug}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="grid gap-2 text-sm text-neutral-300">
          Collection slugs
          <input
            className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none transition focus:border-neutral-500"
            name="collection_slugs"
            placeholder={
              collectionApiUnavailable
                ? "Collection API unavailable"
                : "j-shoot, mood-board"
            }
            type="text"
          />
        </label>
      )}
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="sr-only">Recipe IDs</legend>
        {[
          ["dinov3_vits_256", "256"],
          ["dinov3_vits_384", "384"],
          ["dinov3_vits_512", "512"],
        ].map(([recipeId, label]) => (
          <label
            className="flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200"
            key={recipeId}
          >
            <input
              defaultChecked={recipeId === "dinov3_vits_384"}
              name="recipe_ids"
              type="checkbox"
              value={recipeId}
            />
            {label}
          </label>
        ))}
        <button
          className="h-10 rounded-md border border-neutral-600 px-4 text-sm font-medium text-neutral-100 transition hover:border-neutral-400 hover:bg-neutral-800 disabled:cursor-wait disabled:border-neutral-800 disabled:text-neutral-500"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Running..." : "Run Analysis"}
        </button>
        {isSubmitting ? (
          <p aria-live="polite" className="basis-full text-sm text-neutral-400">
            Running analysis. This can take a while for DINO recipes.
          </p>
        ) : null}
      </fieldset>
    </form>
  );
}
