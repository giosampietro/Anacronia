# New Search Set UX Notes

Use this with `docs/ux/new-search-set-mockup.html`.

## Sources Reviewed

- `docs/prd/anacronia-mvp-prd.md`
- `CONTEXT.md`
- GitHub issues #1-#15 in `giosampietro/Anacronia`
- Current `web/src/app/page.tsx` operational dashboard

## Design Intent

Clicking `+ New Search Set` should select a creation workspace in the main panel, not expand a large form inside the sidebar. The sidebar remains navigation; the main panel owns the task.

Keep the form compact. This is repeated operational UI, not onboarding copy.

The flow needs to satisfy both the already-built Search Set behavior and future collect behavior:

- create a Search Set with display name and stable slug
- parse comma-separated and newline-separated terms
- preserve multi-word terms without requiring quotes
- trim and deduplicate terms case-insensitively
- continue an existing Search Set when the slug already exists
- append new terms rather than replacing old terms
- start a provider collect without requiring manual candidate review
- expose candidate offset, candidate limit, and max images per object as common controls
- default the first collect example to `Start at candidate: 0` and `Candidate limit: 1000`
- make continuation explicit with the next proposed offset, for example `Start at candidate: 1000`
- prevent starting a collect when another collect is running or paused

## Recommended Primary Flow

1. User clicks `+ New Search Set`.
2. Main panel opens `New Search Set`.
3. User enters display name and terms.
4. UI previews the generated slug and a quiet parsed-term summary.
5. User reviews the candidate batch: start offset, limit, and max images per object.
6. Primary action: `Create and collect from Met`.
7. Secondary action: `Save only`.

Do not show provider selection in the MVP creation flow. Met is the only usable provider, and the action label already makes that explicit. Add provider selection later when V&A/Europeana are actually available.

## Continuation Behavior

If the display name resolves to an existing slug, the UI should not pretend this is a new Search Set. It should switch copy to expansion.

There are two distinct expansion modes:

- `Add terms`: append new terms, then collect from the expanded term list.
- `Continue same terms`: keep the active terms unchanged and collect the next candidate batch.

For `Add terms`:

- title changes to `Expand Snake Studies`
- existing terms and new terms are shown separately as quiet text summaries
- copy states that new terms append and collected Image Assets remain unchanged
- primary action: `Add terms and collect from Met`

For `Continue same terms`:

- terms are shown as unchanged
- suggested offset is the next candidate batch, for example `Start at candidate: 1000`
- primary action: `Continue collecting from Met`

This supports the documented rule that matching slugs continue or expand an existing Search Set.

## Labels

- Use `Collect from Met`, not `Run Met collection`.
- Avoid `Provider Collection` in main creation copy.
- Do not include a provider-choice section while Met is the only available provider.
- Use `Candidate limit` only where the numeric setting is needed; otherwise describe it as provider records to process.
- Use `Start at candidate` for candidate offset.
- Use `Max images per object` for the `max_images_per_object` setting.

## Empty/Blocked States

If a collect job is already running or paused:

- keep `Save only` enabled
- disable `Create and collect from Met`
- show a concise message: `Another collect is active. Resume, cancel, or wait before starting a new collect.`

If the user creates without collecting:

- select the new Search Set in the sidebar
- show the Search Set workspace empty state
- primary contextual action can be `Collect from Met`
