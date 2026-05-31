import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export type ExecGitCommand = (args: string[], cwd: string) => string;

type AppVersionStampInput = {
  commitCount?: string | null;
  fallbackVersion?: string | null;
  isDirty?: boolean;
  shortCommit?: string | null;
};

export type AppVersionStamp = {
  display: string;
  title: string;
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

function formatHumanVersion({
  commitCount,
  fallbackVersion,
}: {
  commitCount?: string | null;
  fallbackVersion?: string | null;
}): string {
  const fallback = formatFallbackVersion(fallbackVersion);
  const match = /^v?(\d+)\.(\d+)/.exec(fallback);
  const normalizedCount = Number.parseInt(commitCount?.trim() ?? "", 10);

  if (match && Number.isFinite(normalizedCount) && normalizedCount >= 0) {
    return `v${match[1]}.${match[2]}.${normalizedCount}`;
  }

  return fallback;
}

export function formatAppVersionStamp({
  commitCount,
  fallbackVersion,
  isDirty = false,
  shortCommit,
}: AppVersionStampInput): AppVersionStamp {
  const commit = shortCommit?.trim();
  const packageVersion = formatFallbackVersion(fallbackVersion);
  const display = formatHumanVersion({ commitCount, fallbackVersion });

  if (commit) {
    return {
      display,
      title: `App version ${display}; package ${packageVersion}; commit ${commit}; ${
        isDirty ? "dirty" : "clean"
      }`,
    };
  }

  return {
    display,
    title: `App version ${display}; package ${packageVersion}; Git metadata unavailable`,
  };
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
}: AppVersionStampOptions = {}): AppVersionStamp {
  const fallback = fallbackVersion ?? readPackageVersion(cwd);

  if (gitRoot === null) {
    return formatAppVersionStamp({ fallbackVersion: fallback });
  }

  try {
    const shortCommit = execGit(["rev-parse", "--short", "HEAD"], gitRoot);
    const commitCount = execGit(["rev-list", "--count", "HEAD"], gitRoot);
    const status = execGit(
      ["status", "--porcelain", "--untracked-files=no"],
      gitRoot
    );

    return formatAppVersionStamp({
      commitCount,
      fallbackVersion: fallback,
      isDirty: status.trim().length > 0,
      shortCommit,
    });
  } catch {
    return formatAppVersionStamp({ fallbackVersion: fallback });
  }
}
