import { LocalResultSetPrototype } from "./local-result-set-prototype";
import type {
  PrototypeProvider,
  PrototypeScenario,
  PrototypeScope,
  PrototypeVariant,
  PrototypeView,
} from "./local-result-set-fixtures";

type LocalResultSetPrototypePageProps = {
  searchParams?: Promise<{
    collection_filter?: string | string[];
    detail?: string | string[];
    provider?: string | string[];
    q?: string | string[];
    scenario?: string | string[];
    scope?: string | string[];
    search_set?: string | string[];
    variant?: string | string[];
    view?: string | string[];
  }>;
};

const providers: PrototypeProvider[] = ["all", "met", "vam"];
const scenarios: PrototypeScenario[] = ["normal", "empty", "error"];
const scopes: PrototypeScope[] = ["collection", "library"];
const variants: PrototypeVariant[] = ["A", "B"];
const views: PrototypeView[] = ["objects", "images"];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function memberOrDefault<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export default async function LocalResultSetPrototypePage({
  searchParams,
}: LocalResultSetPrototypePageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <LocalResultSetPrototype
      initialState={{
        collectionFilter: firstParam(resolvedSearchParams?.collection_filter) ?? "",
        detail: firstParam(resolvedSearchParams?.detail) ?? "",
        provider: memberOrDefault(
          firstParam(resolvedSearchParams?.provider),
          providers,
          "all",
        ),
        q: firstParam(resolvedSearchParams?.q) ?? "",
        scenario: memberOrDefault(
          firstParam(resolvedSearchParams?.scenario),
          scenarios,
          "normal",
        ),
        scope: memberOrDefault(
          firstParam(resolvedSearchParams?.scope),
          scopes,
          "collection",
        ),
        searchSet: firstParam(resolvedSearchParams?.search_set) ?? "snake-study",
        variant: memberOrDefault(
          firstParam(resolvedSearchParams?.variant),
          variants,
          "A",
        ),
        view: memberOrDefault(
          firstParam(resolvedSearchParams?.view),
          views,
          "objects",
        ),
      }}
    />
  );
}
