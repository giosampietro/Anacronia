# Browser Tooling

## Status

- Role: current agent operating rules for rendered local UI QA.
- Read through root `AGENTS.md`; do not treat as product contract.

Use one stable browser context for local UI QA. Do not improvise a new browser automation path when the app is already open.

## Default Local UI QA Path

For Anacronia local UI checks, use the Browser plugin's in-app browser (`iab`) first.

Recommended order:

1. Verify the real app service is healthy on the expected port.
2. Connect to the Browser plugin in-app browser.
3. Reuse the selected in-app browser tab when available; create one if none is active.
4. Navigate that tab to the exact real-app, real-data URL.
5. Wait for `domcontentloaded` plus a targeted UI element such as `data-testid="latent-map-canvas"`.
6. Use targeted DOM reads and `tab.dev.logs({ levels: ["error", "warn", "warning"] })` for console checks.

For the latent-map worktree, the expected port is `http://localhost:18661`. Keep the main app port `http://localhost:18660` separate.

## Known Dead Ends

Do not launch the user's installed macOS Chrome through standalone Playwright from Codex just to inspect localhost. In this desktop sandbox, that path can fail on Chrome Crashpad/profile permissions and can make Chrome appear to crash.

Do not keep using Chrome DevTools MCP if it reports only `about:blank` or a different browser context from the user's real page. Switch to the Browser plugin in-app browser instead of opening or automating a separate Chrome process.

Do not use `macOS open` as a substitute for browser QA. It can put the page in front of the user, but it does not give DOM, console, network, or state inspection.

Do not use `curl` as the primary rendered UI check. `curl` is acceptable for service health, route status, and server-rendered smoke checks, but it cannot prove WebGL runtime behavior or client-side console health.

## Playwright Scope

Use standalone Playwright only when the task needs repeatable automated regression coverage, multi-viewport screenshot checks, or CI-style testing, and only when its browser runtime is known to be installed and working.

Inside the Browser plugin, references to Playwright mean the in-app browser tab's `tab.playwright` API. That API uses the existing in-app browser context and avoids launching another Chrome process.
