# Domain Docs

## Status

- Role: current agent operating rules for domain-doc consumption.
- Read through root `AGENTS.md`; do not treat as product contract.

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

- Read root `CONTEXT.md` before planning or changing code.
- Read `docs/README.md` after `CONTEXT.md` for the current doc map, active contracts, and historical-doc status.
- Use the domain language from `CONTEXT.md` in issue titles, plans, tests, code comments, and UI copy.
- Read relevant ADRs from `docs/adr/` when that directory exists.
- For architecture review or beyond-MVP planning, read the latest note in `docs/architecture/` after `CONTEXT.md` and relevant ADRs.
- Do not read every PRD or research note by default. Use `docs/README.md` to choose the smallest relevant set.
- If `docs/adr/` does not exist, proceed silently.

## Domain Rules

- Do not redesign the product scope while implementing issues.
- MVP is local-first and Apple Silicon Mac-first. Met is the first permanent online Provider; V&A is current multi-provider scaffolding test work.
- Intel Mac support is outside the MVP.
- Use Next.js and shadcn/ui for the UI.
- Use FastAPI and a Python worker for backend and processing work.
- Keep generated data under `./data` and out of git.
- Prefer user-facing Provider Search language for online provider workflows: `Start search`, `Stop search`, `Resume search`, and `Keep searching`.
- Keep `collect` only as an internal technical term where existing code, CLI commands, or worker concepts use it.
- Treat local folder import as User-Imported Local Material, not as Provider Search.

## ADR Conflicts

If work would contradict an existing ADR, surface the conflict explicitly before changing code.
