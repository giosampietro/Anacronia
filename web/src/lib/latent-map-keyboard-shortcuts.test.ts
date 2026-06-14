import { describe, expect, it } from "vitest";

import {
  LATENT_MAP_SHORTCUT_HELP_ITEMS,
  shouldYieldLatentMapShortcutToFocusedTarget,
} from "@/lib/latent-map-keyboard-shortcuts";

describe("latent map keyboard shortcuts", () => {
  it("documents the current canvas shortcut surface", () => {
    expect(LATENT_MAP_SHORTCUT_HELP_ITEMS.map((item) => item.keys)).toEqual([
      ["N"],
      ["Esc"],
      ["H"],
      ["P"],
      ["F"],
      ["←", "→"],
      ["↑", "↓"],
      ["⌘/Ctrl", "B"],
    ]);
  });

  it("yields shortcuts only to active text editing or open composite controls", () => {
    expect(
      shouldYieldLatentMapShortcutToFocusedTarget({
        isOpenCompositeTarget: false,
        isTextEditingTarget: true,
      }),
    ).toBe(true);
    expect(
      shouldYieldLatentMapShortcutToFocusedTarget({
        isOpenCompositeTarget: true,
        isTextEditingTarget: false,
      }),
    ).toBe(true);
    expect(
      shouldYieldLatentMapShortcutToFocusedTarget({
        isOpenCompositeTarget: false,
        isTextEditingTarget: false,
      }),
    ).toBe(false);
  });
});
