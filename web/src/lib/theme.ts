export type ThemePreference = "dark" | "light";

export const DEFAULT_THEME: ThemePreference = "dark";

export function resolveThemePreference(
  storedTheme: string | null | undefined
): ThemePreference {
  return storedTheme === "light" ? "light" : DEFAULT_THEME;
}

export function themePreferenceFromChecked(checked: boolean): ThemePreference {
  return checked ? "dark" : "light";
}
