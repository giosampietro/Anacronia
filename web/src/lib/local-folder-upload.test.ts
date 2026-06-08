import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isUploadedFile,
  parseFolderUploadManifest,
  removeUploadedLocalFolder,
  writeUploadedLocalFolderFiles,
} from "./local-folder-upload";

describe("local folder upload", () => {
  it("writes uploaded files using manifest relative paths", async () => {
    const uploadRoot = await writeUploadedLocalFolderFiles(
      [
        new File(["first"], "one.jpg", { type: "image/jpeg" }),
        new File(["second"], "two.png", { type: "image/png" }),
      ],
      {
        files: [
          { name: "one.jpg", relativePath: "references/one.jpg" },
          { name: "two.png", relativePath: "references/nested/two.png" },
        ],
      },
    );

    try {
      await expect(stat(uploadRoot)).resolves.toBeTruthy();
      await expect(readFile(join(uploadRoot, "references/one.jpg"), "utf8"))
        .resolves.toBe("first");
      await expect(readFile(join(uploadRoot, "references/nested/two.png"), "utf8"))
        .resolves.toBe("second");
    } finally {
      await removeUploadedLocalFolder(uploadRoot);
    }
  });

  it("sanitizes unsafe manifest paths", async () => {
    const uploadRoot = await writeUploadedLocalFolderFiles(
      [new File(["image"], "fallback.jpg", { type: "image/jpeg" })],
      {
        files: [
          { name: "fallback.jpg", relativePath: "../bad:name/fallback.jpg" },
        ],
      },
    );

    try {
      await expect(readFile(join(uploadRoot, "folder/bad-name/fallback.jpg"), "utf8"))
        .resolves.toBe("image");
    } finally {
      await removeUploadedLocalFolder(uploadRoot);
    }
  });

  it("parses manifests and recognizes uploaded files", () => {
    const file = new File(["image"], "image.jpg", { type: "image/jpeg" });

    expect(isUploadedFile(file)).toBe(true);
    expect(isUploadedFile("not a file")).toBe(false);
    expect(
      parseFolderUploadManifest(
        '{"files":[{"name":"image.jpg","relativePath":"folder/image.jpg"}]}',
      ),
    ).toEqual({
      files: [{ name: "image.jpg", relativePath: "folder/image.jpg" }],
    });
    expect(parseFolderUploadManifest("not json")).toEqual({});
  });
});
