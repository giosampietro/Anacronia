# Query large libraries server-side

Collection and User Library views should move toward server-side query, filtering, ordering, and pagination or infinite loading as the library grows. Client-side filtering over all local material is acceptable only as prototype behavior or for small interim screens.

**Status:** accepted

**Considered Options:** Loading everything into the browser is easy to build and useful while data is tiny, but it will break down for thousands of Image Assets and mixed-source Collections. A fully faceted search engine is more than the MVP needs.

**Consequences:** Storage and API modules should expose indexed, paginated queries for Collection scope, User Library scope, Provider/source filters, favorite filters, `No Collection`, Object/Image view modes, and search text over canonical fields plus Descriptors. Selection state should be scoped to the visible loaded result set.
