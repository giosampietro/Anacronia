import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveThemePreference,
  themePreferenceFromChecked,
} from "./theme";

function readThemeToken(selector: ":root" | ".dark", token: string) {
  const globalsCss = readFileSync(
    join(process.cwd(), "src/app/globals.css"),
    "utf8"
  );
  const block = globalsCss.match(new RegExp(`${selector} \\{([\\s\\S]*?)\\}`));
  const tokenMatch = block?.[1]?.match(new RegExp(`${token}: ([^;]+);`));

  return tokenMatch?.[1];
}

describe("theme preference", () => {
  it("defaults to the shadcn dark reference theme", () => {
    expect(resolveThemePreference(null)).toBe("dark");
    expect(resolveThemePreference("system")).toBe("dark");
  });

  it("uses a saved light preference", () => {
    expect(resolveThemePreference("light")).toBe("light");
  });

  it("maps the switch state to a theme preference", () => {
    expect(themePreferenceFromChecked(true)).toBe("dark");
    expect(themePreferenceFromChecked(false)).toBe("light");
  });
});

describe("theme tokens", () => {
  it("uses a softer light background while keeping card separation", () => {
    expect(readThemeToken(":root", "--background")).toBe("oklch(0.985 0 0)");
    expect(readThemeToken(":root", "--card")).toBe("oklch(1 0 0)");
  });

  it("keeps the dark reference background unchanged", () => {
    expect(readThemeToken(".dark", "--background")).toBe("oklch(0.145 0 0)");
  });
});
