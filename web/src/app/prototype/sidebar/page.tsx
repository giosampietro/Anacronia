import { readAppVersionStamp } from "@/lib/app-version";
import type { CollectionObjectSummary } from "@/lib/collection-objects";

import { SidebarPrototype } from "./sidebar-prototype";

const DEFAULT_API_PORT = 18670;
const variants = ["A", "B", "C"] as const;

export type SidebarPrototypeVariant = (typeof variants)[number];

type SidebarPrototypePageProps = {
  searchParams?: Promise<{
    variant?: string | string[];
  }>;
};

export type PrototypeSearchTerm = {
  active: boolean;
  term: string;
};

export type PrototypeProviderCollection = {
  collect_status: string;
  imported_image_count: number;
  imported_object_count: number;
  provider: string;
};

export type PrototypeSearchSet = {
  display_name: string;
  provider_collections: PrototypeProviderCollection[];
  slug: string;
  terms: PrototypeSearchTerm[];
};

type PrototypeDashboard = {
  provider_focus: Array<{
    imported_image_count: number;
    provider: string;
    search_set_count: number;
  }>;
  search_sets: PrototypeSearchSet[];
  worker_status: {
    active_collect_job_id: number | null;
    service: string;
    status: string;
  };
};

function getPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeVariant(value: string | undefined): SidebarPrototypeVariant {
  return variants.includes(value as SidebarPrototypeVariant)
    ? (value as SidebarPrototypeVariant)
    : "B";
}

async function getDashboard(apiPort: number): Promise<PrototypeDashboard | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/dashboard`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PrototypeDashboard;
  } catch {
    return null;
  }
}

async function getObjects(
  apiPort: number,
  slug: string,
): Promise<CollectionObjectSummary[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/search-sets/${slug}/objects`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { objects: CollectionObjectSummary[] };
    return payload.objects.slice(0, 28);
  } catch {
    return [];
  }
}

export default async function SidebarPrototypePage({
  searchParams,
}: SidebarPrototypePageProps) {
  const resolvedSearchParams = await searchParams;
  const variant = normalizeVariant(firstParam(resolvedSearchParams?.variant));
  const apiPort = getPort("ANACRONIA_API_PORT", DEFAULT_API_PORT);
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const dashboard = await getDashboard(apiPort);
  const searchSets = dashboard?.search_sets ?? [];
  const activeSearchSet =
    searchSets.find((searchSet) => searchSet.slug === "snake") ??
    searchSets[0] ??
    null;
  const appVersionStamp = readAppVersionStamp();
  const objects =
    activeSearchSet === null ? [] : await getObjects(apiPort, activeSearchSet.slug);

  return (
    <SidebarPrototype
      activeSearchSet={activeSearchSet}
      apiBaseUrl={apiBaseUrl}
      appVersionStamp={appVersionStamp}
      libraryImageCount={
        dashboard?.provider_focus.reduce(
          (total, provider) => total + provider.imported_image_count,
          0,
        ) ?? 0
      }
      objects={objects}
      searchSets={searchSets}
      variant={variant}
      workerStatus={dashboard?.worker_status.status ?? "offline"}
    />
  );
}
