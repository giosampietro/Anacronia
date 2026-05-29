"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_THEME,
  resolveThemePreference,
  themePreferenceFromChecked,
  type ThemePreference,
} from "@/lib/theme";

const THEME_STORAGE_KEY = "anacronia-theme";

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_THEME;
    }

    return resolveThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function updateTheme(isChecked: boolean) {
    const nextTheme = themePreferenceFromChecked(isChecked);

    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Sun className="size-4" aria-hidden="true" />
      <Switch
        aria-label="Toggle dark theme"
        checked={theme === "dark"}
        onCheckedChange={updateTheme}
        size="sm"
      />
      <Moon className="size-4" aria-hidden="true" />
    </div>
  );
}
