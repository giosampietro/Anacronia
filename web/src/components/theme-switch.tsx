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
import { cn } from "@/lib/utils";

const THEME_STORAGE_KEY = "anacronia-theme";

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeSwitch({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "rail";
}) {
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

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  if (variant === "rail") {
    const Icon = theme === "dark" ? Moon : Sun;
    const nextTheme = theme === "dark" ? "light" : "dark";

    return (
      <button
        aria-label={`Switch to ${nextTheme} theme`}
        className={cn(
          "flex size-10 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring",
          className,
        )}
        onClick={toggleTheme}
        title={`Switch to ${nextTheme} theme`}
        type="button"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
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
