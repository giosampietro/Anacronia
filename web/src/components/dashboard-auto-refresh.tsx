"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { startProviderSearchFreshnessCoordinator } from "@/lib/dashboard-refresh";

export function DashboardAutoRefresh({
  enabled,
  intervalMs = 3000,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    return startProviderSearchFreshnessCoordinator({
      autoRefreshActive: enabled,
      intervalMs,
      refresh: () => router.refresh(),
    });
  }, [enabled, intervalMs, router]);

  return null;
}
