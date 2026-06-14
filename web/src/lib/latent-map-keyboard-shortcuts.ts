export type LatentMapShortcutHelpItem = {
  description: string;
  keys: string[];
  label: string;
};

export const LATENT_MAP_SHORTCUT_HELP_ITEMS = [
  {
    description: "Neighborhood grid",
    keys: ["N"],
    label: "Grid",
  },
  {
    description: "Close pane or leave grid",
    keys: ["Esc"],
    label: "Exit",
  },
  {
    description: "Recenter view",
    keys: ["H"],
    label: "Home",
  },
  {
    description: "Points or thumbnails",
    keys: ["P"],
    label: "Mode",
  },
  {
    description: "Show or hide UI",
    keys: ["F"],
    label: "Focus",
  },
  {
    description: "Thumbnail size",
    keys: ["←", "→"],
    label: "Size",
  },
  {
    description: "Image detail",
    keys: ["↑", "↓"],
    label: "Detail",
  },
  {
    description: "Sidebar",
    keys: ["⌘/Ctrl", "B"],
    label: "Panel",
  },
] as const satisfies readonly LatentMapShortcutHelpItem[];

export function shouldYieldLatentMapShortcutToFocusedTarget({
  isOpenCompositeTarget,
  isTextEditingTarget,
}: {
  isOpenCompositeTarget: boolean;
  isTextEditingTarget: boolean;
}) {
  return isTextEditingTarget || isOpenCompositeTarget;
}
