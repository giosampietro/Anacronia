"use client";

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "./ui/progress";

type ProviderCollectionProgressProps = {
  continueCandidateOffset: number | null;
  importedImageCount: number;
  progressLabel: string;
  progressPercent: number;
};

export function ProviderCollectionProgress({
  continueCandidateOffset,
  importedImageCount,
  progressLabel,
  progressPercent,
}: ProviderCollectionProgressProps) {
  return (
    <div className="flex flex-col gap-4">
      <Progress value={progressPercent}>
        <ProgressLabel>Candidate progress</ProgressLabel>
        <ProgressValue>{() => progressLabel}</ProgressValue>
      </Progress>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Image Assets</span>
          <span className="text-sm font-medium">{importedImageCount}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Progress</span>
          <span className="text-sm font-medium">{progressPercent}%</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Continue offset</span>
          <span className="text-sm font-medium">{continueCandidateOffset ?? "none"}</span>
        </div>
      </div>
    </div>
  );
}
