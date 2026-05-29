# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

- Read root `CONTEXT.md` before planning or changing code.
- Use the domain language from `CONTEXT.md` in issue titles, plans, tests, code comments, and UI copy.
- Read relevant ADRs from `docs/adr/` when that directory exists.
- If `docs/adr/` does not exist, proceed silently.

## Domain Rules

- Do not redesign the product scope while implementing issues.
- MVP is local-first, Mac-first, and Met provider first.
- Use Next.js and shadcn/ui for the UI.
- Use FastAPI and a Python worker for backend and processing work.
- Keep generated data under `./data` and out of git.
- Prefer user-facing "collect" language over "import" when describing the research workflow.

## ADR Conflicts

If work would contradict an existing ADR, surface the conflict explicitly before changing code.
