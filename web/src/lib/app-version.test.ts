import { describe, expect, it } from "vitest";

import {
  formatAppVersionStamp,
  readAppVersionStamp,
  type ExecGitCommand,
} from "./app-version";

describe("app version stamp", () => {
  it("formats clean Git metadata as a human-readable development version", () => {
    expect(
      formatAppVersionStamp({
        commitCount: "58",
        fallbackVersion: "0.1.0",
        isDirty: false,
        shortCommit: "abc1234",
      })
    ).toEqual({
      display: "v0.1.58",
      title: "App version v0.1.58; package v0.1.0; commit abc1234; clean",
    });
  });

  it("keeps the human-readable version visible when tracked local edits are present", () => {
    expect(
      formatAppVersionStamp({
        commitCount: "58",
        fallbackVersion: "0.1.0",
        isDirty: true,
        shortCommit: "abc1234",
      })
    ).toEqual({
      display: "v0.1.58",
      title: "App version v0.1.58; package v0.1.0; commit abc1234; dirty",
    });
  });

  it("falls back to the configured package version when Git is unavailable", () => {
    expect(
      formatAppVersionStamp({ fallbackVersion: "0.1.0" })
    ).toEqual({
      display: "v0.1.0",
      title: "App version v0.1.0; package v0.1.0; Git metadata unavailable",
    });
  });

  it("reads clean and dirty state from one Git root", () => {
    const execGit: ExecGitCommand = (args, cwd) => {
      expect(cwd).toBe("/repo");
      if (args[0] === "rev-parse") {
        return "abc1234\n";
      }
      if (args[0] === "rev-list") {
        return "58\n";
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
    ).toEqual({
      display: "v0.1.58",
      title: "App version v0.1.58; package v0.1.0; commit abc1234; dirty",
    });
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
    ).toEqual({
      display: "v0.1.0",
      title: "App version v0.1.0; package v0.1.0; Git metadata unavailable",
    });
  });
});
