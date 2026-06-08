import { describe, expect, it } from "vitest";

import {
  getActionFormDataString,
  getActionFormDataValue,
  getActionFormDataValues,
  getRequiredActionFormDataString,
} from "./action-form-data";

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

  it("reads multiple action-prefixed values from Next server actions", () => {
    const formData = new FormData();
    formData.append("_1_folder_files", "first");
    formData.append("_1_folder_files", "second");

    expect(getActionFormDataValues(formData, "folder_files")).toEqual([
      "first",
      "second",
    ]);
  });

  it("returns null for missing or blank required string values", () => {
    const formData = new FormData();
    formData.set("provider", "   ");

    expect(getRequiredActionFormDataString(formData, "provider")).toBeNull();
    expect(getRequiredActionFormDataString(formData, "slug")).toBeNull();
  });

  it("trims required string values from action-prefixed fields", () => {
    const formData = new FormData();
    formData.set("_1_provider", " vam ");

    expect(getRequiredActionFormDataString(formData, "provider")).toBe("vam");
  });
});
