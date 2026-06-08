# Treat user-imported local material as private local material

Images imported from the user's computer are User-Imported Local Material, not online Provider material. Anacronia does not require metadata, manifests, source URLs, provider records, public-domain checks, or rights declarations for the first local folder workflow, because the material is private local input supplied by the user.

**Status:** accepted

**Consequences:** Local folder import must still create stable local identity, derivatives, Collection Membership, User Library visibility, curation support, export support, and future Analysis Results. It must not use Provider Search candidates, provider rights filters, provider API backoff, or Provider Search batch targets. Absolute source-file references can exist as private local provenance and source-preview links, but exports and shared package outputs must not leak the user's local filesystem paths unless the user intentionally chooses that output.
