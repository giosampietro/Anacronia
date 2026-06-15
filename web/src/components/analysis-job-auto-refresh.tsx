"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { startAnalysisJobFreshnessCoordinator } from "@/lib/analysis-job-refresh";

export function AnalysisJobAutoRefresh({
  enabled,
  intervalMs = 2500,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    return startAnalysisJobFreshnessCoordinator({
      autoRefreshActive: enabled,
      intervalMs,
      refresh: () => router.refresh(),
    });
  }, [enabled, intervalMs, router]);

  return null;
}
