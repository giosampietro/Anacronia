import { describe, expect, it } from "vitest";

import {
  formatAppVersionStamp,
  readAppVersionStamp,
  type ExecGitCommand,
} from "./app-version";

describe("app version stamp", () => {
  it("formats a clean Git commit as a compact short hash", () => {
    expect(
      formatAppVersionStamp({ shortCommit: "abc1234", isDirty: false })
    ).toBe("abc1234");
  });

  it("adds a dirty marker when tracked local edits are present", () => {
    expect(
      formatAppVersionStamp({ shortCommit: "abc1234", isDirty: true })
    ).toBe("abc1234+dirty");
  });

  it("falls back to the configured package version when Git is unavailable", () => {
    expect(
      formatAppVersionStamp({ fallbackVersion: "0.1.0" })
    ).toBe("v0.1.0");
  });

  it("reads clean and dirty state from one Git root", () => {
    const execGit: ExecGitCommand = (args, cwd) => {
      expect(cwd).toBe("/repo");
      if (args[0] === "rev-parse") {
        return "abc1234\n";
      }
      if (args[0] === "status") {
        return " M web/src/app/page.tsx\n";
      }
      throw new Error(`Unexpected git args: ${args.join(" ")}`);
    };

    expect(
      readAppVersionStamp({
        execGit,
        fallbackVersion: "0.1.0",
        gitRoot: "/repo",
      })
    ).toBe("abc1234+dirty");
  });

  it("does not fail rendering when Git metadata cannot be read", () => {
    expect(
      readAppVersionStamp({
        execGit: () => {
          throw new Error("git unavailable");
        },
        fallbackVersion: "0.1.0",
        gitRoot: "/repo",
      })
    ).toBe("v0.1.0");
  });
});
