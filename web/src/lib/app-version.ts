import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export type ExecGitCommand = (args: string[], cwd: string) => string;

type AppVersionStampInput = {
  fallbackVersion?: string | null;
  isDirty?: boolean;
  shortCommit?: string | null;
};

type AppVersionStampOptions = {
  cwd?: string;
  execGit?: ExecGitCommand;
  fallbackVersion?: string;
  gitRoot?: string | null;
};

const LOCAL_FALLBACK_STAMP = "local";

function defaultExecGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function formatFallbackVersion(version: string | null | undefined): string {
  const fallback = version?.trim();

  if (!fallback) {
    return LOCAL_FALLBACK_STAMP;
  }
  if (/^v?\d/.test(fallback)) {
    return fallback.startsWith("v") ? fallback : `v${fallback}`;
  }

  return fallback;
}

export function formatAppVersionStamp({
  fallbackVersion,
  isDirty = false,
  shortCommit,
}: AppVersionStampInput): string {
  const commit = shortCommit?.trim();

  if (commit) {
    return isDirty ? `${commit}+dirty` : commit;
  }

  return formatFallbackVersion(fallbackVersion);
}

function findFileUpward(startPath: string, fileName: string): string | null {
  let currentPath = startPath;
  const rootPath = parse(currentPath).root;

  while (true) {
    const candidate = join(currentPath, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (currentPath === rootPath) {
      return null;
    }
    currentPath = dirname(currentPath);
  }
}

function findGitRoot(startPath: string): string | null {
  const gitPath = findFileUpward(startPath, ".git");
  return gitPath === null ? null : dirname(gitPath);
}

function readPackageVersion(startPath: string): string | undefined {
  const packagePath = findFileUpward(startPath, "package.json");
  if (packagePath === null) {
    return undefined;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      version?: string;
    };
    return packageJson.version;
  } catch {
    return undefined;
  }
}

export function readAppVersionStamp({
  cwd = process.cwd(),
  execGit = defaultExecGit,
  fallbackVersion,
  gitRoot = findGitRoot(cwd),
}: AppVersionStampOptions = {}): string {
  const fallback = fallbackVersion ?? readPackageVersion(cwd);

  if (gitRoot === null) {
    return formatAppVersionStamp({ fallbackVersion: fallback });
  }

  try {
    const shortCommit = execGit(["rev-parse", "--short", "HEAD"], gitRoot);
    const status = execGit(
      ["status", "--porcelain", "--untracked-files=no"],
      gitRoot
    );

    return formatAppVersionStamp({
      fallbackVersion: fallback,
      isDirty: status.trim().length > 0,
      shortCommit,
    });
  } catch {
    return formatAppVersionStamp({ fallbackVersion: fallback });
  }
}
