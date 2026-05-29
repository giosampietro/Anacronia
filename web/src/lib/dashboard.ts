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
  provider: string;
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
  termSummary: string;
  isActive: boolean;
  providerCollections: DashboardProviderCollectionView[];
  importedImageCount: number;
};

export type DashboardProviderFocusView = {
  providerLabel: string;
  searchSetCount: number;
  importedImageCount: number;
};

export type OperationalDashboardView = {
  workerStatus: string;
  libraryImageCount: number;
  activeSearchSet: DashboardSearchSetView | null;
  searchSets: DashboardSearchSetView[];
  providerFocus: DashboardProviderFocusView[];
};

export function createOperationalDashboardView(
  dashboard: OperationalDashboard,
  activeSearchSetSlug?: string,
): OperationalDashboardView {
  const libraryImageCount = dashboard.provider_focus.reduce(
    (total, provider) => total + provider.imported_image_count,
    0,
  );
  const selectedSlug =
    activeSearchSetSlug ??
    (dashboard.search_sets.length > 0 ? dashboard.search_sets[0].slug : undefined);
  const searchSets = dashboard.search_sets.map((searchSet) => {
    const activeTerms = searchSet.terms.filter((term) => term.active).map((term) => term.term);
    const inactiveTerms = searchSet.terms.filter((term) => !term.active).map((term) => term.term);
    const providerCollections = searchSet.provider_collections.map((providerCollection) => ({
      provider: providerCollection.provider,
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
    }));

    return {
      displayName: searchSet.display_name,
      slug: searchSet.slug,
      activeTerms,
      inactiveTerms,
      termSummary: activeTerms.join(", "),
      isActive: searchSet.slug === selectedSlug,
      providerCollections,
      importedImageCount: providerCollections.reduce(
        (total, providerCollection) => total + providerCollection.importedImageCount,
        0,
      ),
    };
  });

  return {
    workerStatus: dashboard.worker_status.status,
    libraryImageCount,
    activeSearchSet: searchSets.find((searchSet) => searchSet.isActive) ?? searchSets[0] ?? null,
    searchSets,
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
