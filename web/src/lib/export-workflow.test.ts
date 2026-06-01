import { describe, expect, it } from "vitest";

import {
  collectionExportAvailability,
  createSelectedCollectionExportRequest,
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
    expect(exportActionLabel("jsonl")).toBe("Export metadata JSONL");
    expect(exportActionLabel("csv")).toBe("Export spreadsheet CSV");
    expect(exportActionLabel("package")).toBe("Export images + metadata");
    expect(exportPendingLabel("jsonl")).toBe("Exporting metadata JSONL...");
    expect(exportPendingLabel("csv")).toBe("Exporting spreadsheet CSV...");
    expect(exportPendingLabel("package")).toBe("Exporting images + metadata...");
  });

  it("summarizes the completed export artifacts", () => {
    expect(exportSuccessLabel("jsonl")).toBe("Metadata JSONL export ready");
    expect(exportSuccessLabel("csv")).toBe("Spreadsheet CSV export ready");
    expect(exportSuccessLabel("package")).toBe("Images + metadata export ready");
    expect(exportArtifactSummary({ format: "jsonl", rowCount: "155" })).toBe(
      "155 Image Assets written to manifest.jsonl."
    );
    expect(exportArtifactSummary({ format: "csv", rowCount: "155" })).toBe(
      "155 Image Assets written to metadata.csv."
    );
    expect(exportArtifactSummary({ format: "package", rowCount: "155" })).toBe(
      "155 Image Assets exported with metadata, 1024 images, and thumbnails."
    );
  });
});

describe("selected collection export request", () => {
  it("uses all selected Image Asset identities for Image view export", () => {
    expect(
      createSelectedCollectionExportRequest({
        format: "csv",
        selectedIds: ["image:9", "image:12", "object:met:40"],
        viewMode: "images",
      }),
    ).toEqual({
      format: "csv",
      selection: {
        image_asset_ids: [9, 12],
        objects: [],
      },
    });
  });

  it("uses all selected Object identities for Object view export", () => {
    expect(
      createSelectedCollectionExportRequest({
        format: "jsonl",
        selectedIds: ["object:met:40", "object:va:100", "image:9"],
        viewMode: "objects",
      }),
    ).toEqual({
      format: "jsonl",
      selection: {
        image_asset_ids: [],
        objects: [
          { provider: "met", object_id: 40 },
          { provider: "va", object_id: 100 },
        ],
      },
    });
  });
});
