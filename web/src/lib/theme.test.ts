import { describe, expect, it } from "vitest";

import {
  resolveThemePreference,
  themePreferenceFromChecked,
} from "./theme";

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
