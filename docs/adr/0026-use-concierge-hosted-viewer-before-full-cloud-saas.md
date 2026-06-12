# Use concierge hosted viewers before full cloud SaaS

Anacronia should validate commercial value through a concierge hosted-viewer workflow before attempting a full multi-user SaaS refactor. The local app remains the private processing and research environment. For early client work, Giorgio can receive or collect project images, run analysis locally or on a controlled worker, publish a private hosted latent-map viewer for that project, and invoice the work as a consultancy/project engagement.

**Status:** accepted

**Context:** Anacronia is currently a local-first, single-user app with SQLite, local filesystem artifacts, a Python worker, and a Next.js/FastAPI UI. The latent-map prototype now makes the product direction clearer: creative users may value private visual exploration of their own image sets. A full hosted SaaS would require authentication, tenant isolation, object storage permissions, zip-upload security, job queues, quotas, GPU compute controls, billing, deletion policy, and abuse handling before the product value is proven. A distributed local client would require packaging, updates, licensing, support, and machine-specific GPU troubleshooting.

**Decision:** Keep Anacronia Local as the production-grade private analysis environment for now. Build cloud-compatible foundations locally by making Analysis Results durable, introducing stable artifact keys, separating viewer artifacts from processing internals, and creating a portable Project Viewer Export. The first hosted commercial workflow is not client self-service upload; it is a controlled project flow where analysis is processed by Giorgio and the resulting viewer is made available online under controlled access.

**Considered Options:**

- Full multi-user SaaS now: maximizes control and future monetization, but creates the largest security, cost, and engineering burden before product validation.
- Distributed local app now: preserves client privacy, but creates packaging, licensing, update, support, and expiry-control problems.
- Concierge hosted viewer: validates value with the least infrastructure while keeping access control online and compute under operator control.
- Local-only continuation: keeps development fast but does not test whether external creative clients will pay for the experience.

**Consequences:** Anacronia needs a first-class Project Viewer Export contract: a local Analysis Result can be packaged with only the artifacts needed by the viewer, then hosted independently. The local codebase should add cloud-shaped boundaries without adding real multi-user complexity yet: `AnalysisJob`, `AnalysisResult`, `ArtifactStore`, stable artifact keys, project/workspace vocabulary, quota/accounting fields, and deletion lifecycle. Cloud hosting should initially serve private viewer outputs, not accept arbitrary client uploads.

**Security Consequences:** Early hosted viewers still require access control, non-public object URLs, an expiry or takedown mechanism, a deletion/retention rule, and a clear statement that uploaded/client images are not used for model training. Public sharing, client self-service upload, team collaboration, and billing must wait until authorization, object storage access, abuse controls, and deletion behavior are mature.

**Business Consequences:** The first monetizable shape is project consulting: client sends or grants access to a dataset, Giorgio processes it, hosts the private result, and invoices the engagement. This avoids building subscription billing too early while still testing whether studios, designers, and art directors find the latent explorer useful enough to pay for.

**Implementation Direction:** The immediate architecture sequence is durable local Analysis Results, an Artifact Store boundary, Project Viewer Export, manual private hosted viewer, then optional authenticated project portal. Client upload, external GPU automation, teams, Stripe, and self-service SaaS come later.
