import { describe, expect, it } from "vitest";

import { getActionFormDataString, getActionFormDataValue } from "./action-form-data";

describe("action form data", () => {
  it("reads standard form field names", () => {
    const formData = new FormData();
    formData.set("display_name", "Money");

    expect(getActionFormDataString(formData, "display_name")).toBe("Money");
  });

  it("reads action-prefixed form field names from Next server actions", () => {
    const formData = new FormData();
    formData.set("_1_display_name", "Money");
    formData.set("_1_terms_text", "mani, mano");

    expect(getActionFormDataString(formData, "display_name")).toBe("Money");
    expect(getActionFormDataString(formData, "terms_text")).toBe("mani, mano");
  });

  it("does not read unrelated suffix matches", () => {
    const formData = new FormData();
    formData.set("archived_display_name", "Wrong");

    expect(getActionFormDataValue(formData, "display_name")).toBeNull();
  });
});
