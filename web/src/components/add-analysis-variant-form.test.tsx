import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AddAnalysisVariantForm,
  initialSelectedVariantRecipeIds,
} from "./add-analysis-variant-form";

const formStatus = vi.hoisted(() => ({
  pending: false,
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: () => ({ pending: formStatus.pending }),
  };
});

describe("AddAnalysisVariantForm", () => {
  it("does not preselect an available recipe when adding a Variant", () => {
    expect(initialSelectedVariantRecipeIds()).toEqual([]);
  });

  it("renders the closed Run Variant trigger", () => {
    formStatus.pending = false;

    const html = renderToString(
      <AddAnalysisVariantForm
        action={() => undefined}
        analysisId="analysis-bread"
        disabledRecipeIds={["dinov3_vits_384"]}
        recipes={[
          {
            inputSize: 384,
            isDefault: true,
            label: "DINOv3 ViT-S 384px",
            recipeId: "dinov3_vits_384",
          },
          {
            inputSize: 256,
            isDefault: false,
            label: "DINOv3 ViT-S 256px",
            recipeId: "dinov3_vits_256",
          },
          {
            inputSize: 512,
            isDefault: false,
            label: "DINOv3 ViT-S 512px",
            recipeId: "dinov3_vits_512",
          },
        ]}
        sourceCollections={[{ label: "Bread", slug: "bread" }]}
      />,
    );

    expect(html).toContain("Run variant");
    expect(html).not.toContain("name=\"recipe_ids\"");
  });
});
