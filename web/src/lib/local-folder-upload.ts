import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";

const LOCAL_FOLDER_UPLOAD_PREFIX = "anacronia-local-folder-upload-";

export type FolderUploadManifest = {
  files?: Array<{
    name?: unknown;
    relativePath?: unknown;
  }>;
};

export function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

export function parseFolderUploadManifest(value: string): FolderUploadManifest {
  if (value.trim() === "") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as FolderUploadManifest;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizedPathSegment(value: string, fallback: string): string {
  const sanitized = value
    .replaceAll("\0", "")
    .replace(/[<>:"|?*]/g, "-")
    .trim();
  if (sanitized === "" || sanitized === "." || sanitized === "..") {
    return fallback;
  }
  return sanitized;
}

function createSafeUploadRelativePath({
  fallbackName,
  index,
  relativePath,
}: {
  fallbackName: string;
  index: number;
  relativePath: string;
}): string {
  const sourcePath = relativePath.trim() || fallbackName.trim() || `file-${index}`;
  const segments = sourcePath
    .split(/[\\/]+/)
    .map((segment, segmentIndex) =>
      sanitizedPathSegment(segment, segmentIndex === 0 ? "folder" : `file-${index}`),
    )
    .filter((segment) => segment !== "");

  if (segments.length === 0) {
    return `file-${index}`;
  }

  return segments.join("/");
}

function createUniqueUploadRelativePath(
  relativePath: string,
  usedPaths: Set<string>,
  index: number,
): string {
  if (!usedPaths.has(relativePath)) {
    usedPaths.add(relativePath);
    return relativePath;
  }

  const extension = extname(relativePath);
  const basePath = extension === ""
    ? relativePath
    : relativePath.slice(0, -extension.length);
  let candidate = `${basePath}-${index}${extension}`;
  let suffix = 1;
  while (usedPaths.has(candidate)) {
    candidate = `${basePath}-${index}-${suffix}${extension}`;
    suffix += 1;
  }
  usedPaths.add(candidate);
  return candidate;
}

export async function writeUploadedLocalFolderFiles(
  files: File[],
  manifest: FolderUploadManifest,
): Promise<string> {
  const uploadRoot = join(tmpdir(), `${LOCAL_FOLDER_UPLOAD_PREFIX}${randomUUID()}`);
  const usedPaths = new Set<string>();
  await mkdir(uploadRoot, { recursive: true });

  await Promise.all(
    files.map(async (file, index) => {
      const manifestFile = manifest.files?.[index];
      const relativePath = createUniqueUploadRelativePath(
        createSafeUploadRelativePath({
          fallbackName: file.name,
          index,
          relativePath:
            typeof manifestFile?.relativePath === "string"
              ? manifestFile.relativePath
              : "",
        }),
        usedPaths,
        index,
      );
      const destination = join(uploadRoot, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await file.arrayBuffer()));
    }),
  );

  return uploadRoot;
}

export async function removeUploadedLocalFolder(uploadRoot: string): Promise<void> {
  await rm(uploadRoot, { force: true, recursive: true });
}
