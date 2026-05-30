import { describe, expect, it } from "vitest";

import {
  collectionExportAvailability,
  exportActionLabel,
  exportArtifactSummary,
  exportPendingLabel,
  exportSuccessLabel,
} from "./export-workflow";

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

describe("collection export labels", () => {
  it("uses format-specific action and pending labels", () => {
    expect(exportActionLabel("jsonl")).toBe("Export JSONL");
    expect(exportActionLabel("csv")).toBe("Export CSV");
    expect(exportActionLabel("package")).toBe("Build package");
    expect(exportPendingLabel("jsonl")).toBe("Exporting JSONL...");
    expect(exportPendingLabel("csv")).toBe("Exporting CSV...");
    expect(exportPendingLabel("package")).toBe("Building package...");
  });

  it("summarizes the completed export artifacts", () => {
    expect(exportSuccessLabel("jsonl")).toBe("JSONL export ready");
    expect(exportArtifactSummary({ format: "jsonl", rowCount: "155" })).toBe(
      "155 Image Assets written to manifest.jsonl."
    );
    expect(exportArtifactSummary({ format: "csv", rowCount: "155" })).toBe(
      "155 Image Assets written to metadata.csv."
    );
    expect(exportArtifactSummary({ format: "package", rowCount: "155" })).toBe(
      "155 Image Assets packaged with manifest.jsonl, metadata.csv, standard-1024 images, and thumb-256 images."
    );
  });
});
