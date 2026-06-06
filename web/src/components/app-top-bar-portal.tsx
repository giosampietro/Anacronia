"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const APP_TOP_BAR_CONTROLS_ID = "app-shell-top-bar-controls";

export function AppTopBarPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTarget(document.getElementById(APP_TOP_BAR_CONTROLS_ID));
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return target === null ? null : createPortal(children, target);
}
