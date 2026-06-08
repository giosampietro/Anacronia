# Use Next.js, FastAPI, a Python worker, and SQLite as the local app shape

Anacronia uses a Next.js web interface, FastAPI backend, Python worker, and SQLite local store because the product needs a rich browser UI, Python image-processing and future OpenCV/ML paths, resumable background work, and a lightweight local database. This is a deliberate multi-process local app rather than a static site or a pure Python desktop UI. Next.js is the UI framework decision; it is not a permanent promise that a packaged app must always expose a standalone Node sidecar in exactly the current development shape.

**Status:** accepted

**Considered Options:** A static frontend would simplify packaging but conflicts with the current Server Actions and live local backend shape. A pure desktop shell would make browser-first UI iteration slower and move image/analysis work away from the Python ecosystem.

**Consequences:** Future desktop packaging must supervise sidecars, prebuild/bundle the UI, or revisit the frontend runtime through a new ADR. Runtime ports, process startup, local API proxying, and data-root handling are architectural details, not incidental implementation quirks.
