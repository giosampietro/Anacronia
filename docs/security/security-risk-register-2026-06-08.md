# Security Risk Register: 2026-06-08 Codex Security Baseline

## Purpose

This document turns the June 8, 2026 Codex Security scan into a durable Git
reference. It is intentionally written for future triage, not immediate fixing.

The goal is to avoid forgetting the risks, avoid fixing them in a rushed order,
and make future reruns comparable.

## Status

- Status: tracked, not fixed.
- Original scan date: June 8, 2026.
- Original validated report checkout: `main@89ac831`.
- Tracking branch note: this register is intended to live on a standalone
  branch based on `origin/main@89ac831`, so it does not depend on the open V&A
  requirements branch. While the scan was running, the working tree moved
  between `codex/vna-requirements@3ec1489` and `main@89ac831`; the findings
  below are the earlier validated `main@89ac831` set. Because
  `codex/vna-requirements` includes V&A and local-folder code that was absent
  from `main`, the next full scan must recheck those surfaces before
  implementation issues are finalized.
- Original report artifacts: `/tmp/codex-security-scans/Anacronia/3ec1489_20260608T201634Z/`

## Plain-English Summary

No finding looked like an immediate public-internet compromise in the normal
single-user, loopback-only Anacronia setup. The meaningful risks are local app
hardening issues:

- Provider data and images should be treated as hostile.
- Destructive local web actions need request authenticity, not only UI confirmation.
- Local image processing needs strict resource limits.
- Exported CSV data must be safe for spreadsheet tools.
- Worker-only flows should not be bypassable by side endpoints.

## Security Principles For Anacronia

These are the rules we should preserve as the product grows:

1. Keep the app loopback-only unless there is a deliberate security design for remote access.
2. Treat provider metadata, provider URLs, image bytes, local upload names, and form data as untrusted.
3. Require server-side proof for destructive actions. UI confirmations are helpful, but they are not security controls.
4. Put byte, pixel, file-count, and job-size limits before expensive image or filesystem work.
5. Preserve source provenance without turning local source paths into broad file-serving capability.
6. Split security fixes into small, testable issues. Do not do a large security rewrite.

## Risk Register

| ID | Risk | Severity | Current decision | Suggested first fix | Tests to add |
| --- | --- | --- | --- | --- | --- |
| SEC-2026-06-08-01 | Provider image URLs can make the backend fetch unexpected destinations. | Medium | Revalidate, then fix before any non-local packaging. | Allow only expected schemes and hosts, reject `file://`, validate redirects, and block private or loopback targets unless explicitly trusted. | Unit tests for rejected schemes, hosts, redirects, and file URLs. |
| SEC-2026-06-08-02 | Provider or local images can be too large or hostile for safe decode. | Medium | Fix alongside provider URL restrictions. | Stream downloads with max bytes, enforce image pixel/dimension limits, set Pillow decompression policy, and reject oversized content before derivative generation. | Tests for oversized body, oversized dimensions, decompression warning, and bounded local-folder uploads. |
| SEC-2026-06-08-03 | Browser-facing POST routes can delete or remove local material without server-side request authenticity. | Medium | Highest app-boundary priority. | Add a server-validated action token or signed nonce, enforce Origin/Host checks, and consider a local shared secret between Next and FastAPI. | Direct route calls without the token must fail before FastAPI curation functions run. |
| SEC-2026-06-08-04 | The direct provider-run ingest endpoint bypasses worker controls. | Medium | Remove or protect. | Delete the endpoint if unused, or route it through the same worker lifecycle checks as normal collection search. | Endpoint tests for active-job lock, disk checks, stop/pause behavior, and progress updates. |
| SEC-2026-06-08-05 | CSV exports can contain provider-controlled spreadsheet formulas. | Medium | Fix before CSV exports are considered shareable. | Neutralize cells beginning with `=`, `+`, `-`, `@`, tab, carriage return, or leading whitespace before those characters. | Export tests proving CSV is neutralized and JSONL remains unchanged. |
| SEC-2026-06-08-06 | Remove from Collection can persist exclusions for objects/images that were not active members of that Collection. | Low | Fix when touching curation logic. | Only write exclusions after proving active target-Collection membership, or make non-member removals a pure no-op. | Tests for cross-Collection image IDs, non-member objects, and unknown identities. |
| SEC-2026-06-08-07 | Whole-Collection DELETE is unauthenticated if the UI route is exposed. | Low in local mode | Keep loopback-only and fold into request-authenticity work. | Apply the same destructive-action token and Origin/Host checks used for delete/remove. | Direct DELETE without authenticity proof must fail. |
| SEC-2026-06-08-08 | Malformed Met `objectIDs` entries can crash candidate discovery. | Low | Fix as provider robustness. | Validate each element, skip malformed values, and record a skipped-candidate reason. | Tests for nulls, strings, floats, empty values, and oversized values. |
| SEC-2026-06-08-09 | Current-branch local-folder upload and source-file serving need a fresh security pass. | Needs follow-up | Recheck before merging or packaging V&A/local-folder work. | Confirm upload staging cannot escape temp roots, add file-count/size limits, and decide whether source-file serving needs data-root or selected-folder provenance checks. | Tests for path traversal names, duplicate names, huge uploads, and source file access boundaries. |
| SEC-2026-06-08-10 | `npm audit` reports a moderate PostCSS advisory through Next with no fix available. | Needs follow-up | Track during dependency upgrades. | Upgrade when Next/PostCSS provides a fix and confirm no provider-controlled CSS stringify path exists. | `npm audit --omit=dev` and any relevant CSS rendering tests. |

## Suggested Fix Order

### Phase 1: Protect Local State Changes

Fix request authenticity first because it protects several destructive workflows
at once.

Scope:

- `web/src/app/api/curation/delete/route.ts`
- `web/src/app/api/search-sets/[slug]/remove-from-collection/route.ts`
- `web/src/app/api/search-sets/[slug]/route.ts`
- matching FastAPI handlers in `src/anacronia/api.py`

Definition of done:

- Direct forged requests fail.
- Normal UI requests still work.
- Tests cover delete, remove, and collection delete.
- The app still binds to `127.0.0.1` by default.

### Phase 2: Make Provider Downloads Safe

Provider responses are not trusted, even when the default provider is reputable.

Scope:

- `src/anacronia/met_provider.py`
- `src/anacronia/vam_provider.py`
- `src/anacronia/met_ingest.py`
- `src/anacronia/vam_adapter.py`
- `src/anacronia/image_pipeline.py`

Definition of done:

- Only expected HTTP(S) image destinations are allowed.
- Redirects are validated after following.
- Downloads have byte limits.
- Images have pixel/dimension/decompression limits.
- Tests cover Met and V&A image flows.

### Phase 3: Fix Export And Curation Integrity

These are lower urgency, but they are straightforward and should stay visible.

Scope:

- `src/anacronia/exports.py`
- `src/anacronia/curation.py`

Definition of done:

- CSV spreadsheet formulas are neutralized.
- Collection exclusions require real target membership or are no-ops.
- Tests prove the behavior.

### Phase 4: Remove Side Doors And Improve Provider Robustness

Scope:

- direct ingest endpoint in `src/anacronia/api.py`
- malformed provider response handling in `src/anacronia/met_provider.py`

Definition of done:

- Ingestion cannot bypass worker safety controls.
- Bad provider data is skipped or recorded without crashing the run.

## Rerun Checklist

Before creating fix issues, rerun the scan from the branch that will actually be
fixed:

```text
Run @codex-security repository-wide and compare it to docs/security/security-risk-register-2026-06-08.md
```

Also run the double-click baseline command:

```text
batch-cmd/security-baseline-check.command
```

Record the rerun result here:

| Date | Branch / commit | Result | Decision |
| --- | --- | --- | --- |
| 2026-06-08 | `main@89ac831` scan artifacts, tracking branch based on `origin/main@89ac831` | Baseline created. | Revalidate before fixing. |

## GitHub Issue Plan

Start with one umbrella issue:

```text
Security review follow-up: 2026-06-08 baseline
```

Suggested issue body:

```text
Track the June 8, 2026 Codex Security baseline and decide which items to fix.

Reference: docs/security/security-risk-register-2026-06-08.md

Checklist:
- Rerun @codex-security on the current branch.
- Compare rerun output to the baseline register.
- Decide whether Anacronia remains loopback-only for the next release.
- Split confirmed items into focused implementation issues.
- Mark each split issue ready-for-agent only when it has affected files, acceptance tests, and a target branch.
```

Use `needs-triage` and `type:hitl` until a human decides the fix sequence.
After triage, use `ready-for-agent` only for tightly scoped implementation
issues with clear acceptance tests.
