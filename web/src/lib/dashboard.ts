import type { SearchSetTerm } from "./search-sets";

export type DashboardProviderCollection = {
  provider: string;
  latest_run_id: number | null;
  collect_status: string;
  candidate_offset: number;
  candidate_limit: number;
  candidate_progress_processed: number;
  candidate_progress_total: number;
  imported_image_count: number;
  continue_candidate_offset: number | null;
};

export type DashboardSearchSet = {
  display_name: string;
  slug: string;
  terms: SearchSetTerm[];
  provider_collections: DashboardProviderCollection[];
};

export type DashboardProviderFocus = {
  provider: string;
  search_set_count: number;
  imported_image_count: number;
};

export type DashboardWorkerStatus = {
  service: "worker";
  status: "idle" | "running" | "paused" | "canceled" | "completed" | "error";
  active_collect_job_id: number | null;
};

export type OperationalDashboard = {
  worker_status: DashboardWorkerStatus;
  search_sets: DashboardSearchSet[];
  provider_focus: DashboardProviderFocus[];
};

export type DashboardProviderCollectionView = {
  providerLabel: string;
  status: string;
  progressLabel: string;
  progressPercent: number;
  importedImageCount: number;
  continueCandidateOffset: number | null;
  latestRunLabel: string;
};

export type DashboardSearchSetView = {
  displayName: string;
  slug: string;
  activeTerms: string[];
  inactiveTerms: string[];
  providerCollections: DashboardProviderCollectionView[];
};

export type DashboardProviderFocusView = {
  providerLabel: string;
  searchSetCount: number;
  importedImageCount: number;
};

export type OperationalDashboardView = {
  workerStatus: string;
  searchSets: DashboardSearchSetView[];
  providerFocus: DashboardProviderFocusView[];
};

export function createOperationalDashboardView(
  dashboard: OperationalDashboard,
): OperationalDashboardView {
  return {
    workerStatus: dashboard.worker_status.status,
    searchSets: dashboard.search_sets.map((searchSet) => ({
      displayName: searchSet.display_name,
      slug: searchSet.slug,
      activeTerms: searchSet.terms.filter((term) => term.active).map((term) => term.term),
      inactiveTerms: searchSet.terms.filter((term) => !term.active).map((term) => term.term),
      providerCollections: searchSet.provider_collections.map((providerCollection) => ({
        providerLabel: providerLabel(providerCollection.provider),
        status: providerCollection.collect_status,
        progressLabel: `${providerCollection.candidate_progress_processed}/${providerCollection.candidate_progress_total} candidates`,
        progressPercent: progressPercent(
          providerCollection.candidate_progress_processed,
          providerCollection.candidate_progress_total,
        ),
        importedImageCount: providerCollection.imported_image_count,
        continueCandidateOffset: providerCollection.continue_candidate_offset,
        latestRunLabel:
          providerCollection.latest_run_id === null
            ? "No Run yet"
            : `Run ${providerCollection.latest_run_id}`,
      })),
    })),
    providerFocus: dashboard.provider_focus.map((provider) => ({
      providerLabel: providerLabel(provider.provider),
      searchSetCount: provider.search_set_count,
      importedImageCount: provider.imported_image_count,
    })),
  };
}

export function providerLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider;
}

export function progressPercent(processed: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((processed / total) * 100);
}
