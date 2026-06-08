# Default Provider Search batch target is 10

The Provider Search batch dropdown includes `5`, `10`, `20`, `30`, `100`, `500`, and `1000`, and defaults to `10`. This keeps the first search small and reviewable while still allowing deliberate larger batches for established Collections or long-running work.

**Status:** accepted

**Considered Options:** `100` was previously the default and remains a useful explicit choice, but it can create too much local material before the user has verified terms, Provider behavior, rights display, and image quality. Lower defaults such as `5` are useful for smoke checks but too small as the normal starting point.

**Consequences:** Documentation, tests, API defaults, worker defaults, and UI controls should treat `10` as the durable default. Changing it later should require a new ADR or a superseding ADR.
