"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DashboardAutoRefresh({
  enabled,
  intervalMs = 3000,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
