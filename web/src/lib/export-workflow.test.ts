import { describe, expect, it } from "vitest";

import { collectionExportAvailability } from "./export-workflow";

describe("collection export workflow", () => {
  it("is unavailable before a Collection has Image Assets", () => {
    expect(
      collectionExportAvailability({
        importedImageCount: 0,
        providerStatuses: ["idle"],
      })
    ).toEqual({
      available: false,
      reason: "Export is available after this Collection has Image Assets.",
    });
  });

  it("is unavailable while a Provider Search is running or stopping", () => {
    expect(
      collectionExportAvailability({
        importedImageCount: 10,
        providerStatuses: ["running"],
      }).available
    ).toBe(false);
    expect(
      collectionExportAvailability({
        importedImageCount: 10,
        providerStatuses: ["stopping"],
      }).available
    ).toBe(false);
  });

  it("is available for parked or ready Collections with Image Assets", () => {
    expect(
      collectionExportAvailability({
        importedImageCount: 10,
        providerStatuses: ["paused", "completed"],
      })
    ).toEqual({
      available: true,
      reason: "",
    });
  });
});
