# Security Review Tracking

This folder tracks security review results that are not ready to fix immediately.
Use it as the durable reference before creating implementation issues.

## Current Baseline

- Baseline register: `docs/security/security-risk-register-2026-06-08.md`
- Original generated scan artifacts: `/tmp/codex-security-scans/Anacronia/3ec1489_20260608T201634Z/`
- Original report source: `/tmp/codex-security-scans/Anacronia/3ec1489_20260608T201634Z/report.md`
- Original HTML report: `/tmp/codex-security-scans/Anacronia/3ec1489_20260608T201634Z/report.html`

The `/tmp` scan artifacts are useful evidence, but they are not durable Git
history. The risk register is the Git-tracked reference.

## How To Track This In Git And GitHub

Use a two-level workflow:

1. Keep the risk register in Git.
2. Keep one umbrella GitHub issue for the next security review pass.
3. Split into focused implementation issues only after a fresh rerun confirms
   which risks still apply.

Recommended umbrella issue title:

```text
Security review follow-up: 2026-06-08 baseline
```

Recommended labels:

```text
needs-triage, type:hitl
```

Once triaged, split fixes by engineering boundary, not by scan wording:

- Local request authenticity for browser-to-Next-to-FastAPI state changes.
- Provider download safety for URL destinations, byte limits, and image decode limits.
- Export and local data integrity for CSV formula escaping and collection exclusions.
- Worker/API lifecycle cleanup for direct ingest and job control bypasses.
- Current-branch local-folder surfaces, including uploads and source-file serving.

## Rerun Cadence

Rerun a full Codex Security scan:

- before packaging or distributing Anacronia to other users
- before binding either service outside `127.0.0.1`
- after provider ingestion, local-folder import, export, delete, or worker code changes
- after dependency upgrades involving Next.js, PostCSS, FastAPI, Pillow, or image processing

## Local Baseline Check

Double-click:

```text
batch-cmd/security-baseline-check.command
```

That command runs the local tests and npm audit. It does not replace the full
Codex Security scan.

For the full rerun, ask Codex:

```text
Run @codex-security repository-wide and compare it to docs/security/security-risk-register-2026-06-08.md
```
