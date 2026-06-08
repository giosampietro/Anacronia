# Preserve SearchSet internal names until a safe Collection rename

The product language is Collection, but existing code, routes, query parameters, tests, and persisted tables still use `SearchSet`. Anacronia preserves those internal names for now to avoid broad compatibility churn while user-facing text and domain docs use Collection. This is temporary compatibility, not a competing domain term.

**Status:** accepted

**Considered Options:** A full immediate rename would align code with the domain vocabulary but risks breaking URLs, local data compatibility, tests, and active feature work. Leaving user-facing Search Set language would keep old terminology leaking into the product.

**Consequences:** Future rename work should be planned through the Collection-language assessment and migration policy, with route aliases or compatibility behavior for existing local links such as `search_set`. New user-facing surfaces must not introduce Search Set language. New internal modules should prefer Collection names when they do not need to preserve existing persisted schema, route, or API compatibility.
