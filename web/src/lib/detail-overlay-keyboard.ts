export type ObjectDetailOverlayKeyAction =
  | {
      kind: "close" | "next-image" | "none" | "previous-image";
      preventDefault: boolean;
    }
  | {
      href: string;
      kind: "next-object" | "previous-object";
      preventDefault: boolean;
    };

type ObjectDetailOverlayKeyContext = {
  hasMultipleImages: boolean;
  nextObjectHref?: string | null;
  previousObjectHref?: string | null;
};

export function getObjectDetailOverlayKeyAction(
  key: string,
  context: ObjectDetailOverlayKeyContext,
): ObjectDetailOverlayKeyAction | null {
  if (key === "Escape") {
    return { kind: "close", preventDefault: true };
  }

  if (key === "ArrowLeft") {
    return {
      kind: context.hasMultipleImages ? "previous-image" : "none",
      preventDefault: true,
    };
  }

  if (key === "ArrowRight") {
    return {
      kind: context.hasMultipleImages ? "next-image" : "none",
      preventDefault: true,
    };
  }

  if (key === "ArrowUp") {
    return context.previousObjectHref
      ? {
          href: context.previousObjectHref,
          kind: "previous-object",
          preventDefault: true,
        }
      : { kind: "none", preventDefault: true };
  }

  if (key === "ArrowDown") {
    return context.nextObjectHref
      ? {
          href: context.nextObjectHref,
          kind: "next-object",
          preventDefault: true,
        }
      : { kind: "none", preventDefault: true };
  }

  return null;
}
