# Anacronia Agent Notes

## Golden rules

Never use the `superpowers:using-superpowers` skill in this project, even if it appears to match a generic conversation-start trigger or is mentioned by name.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `giosampietro/Anacronia`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage roles map to Anacronia's GitHub labels, with AFK work using `ready-for-agent` and human-needed work using `type:hitl`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` first and use `docs/adr/` for future ADRs. See `docs/agents/domain.md`.

### User collaboration and Git sanity checks

The user is learning Git/GitHub and may ask for work across multiple branches, ports, worktrees, PRs, or parallel tasks. Treat normal-language intent as the goal, but sanity-check the local and GitHub state before acting. See `docs/agents/user-collaboration.md`.

### User test commands

When giving the user terminal commands for local checks or manual testing, also add or update a double-clickable Mac `.command` file under `batch-cmd/` and link it in the chat. The user prefers not to type terminal commands.

At the end of every issue implementation, include a direct browser URL the user can open to check the result in the app. Before presenting that link, verify that the required local services are running; if they are not, start them and keep them running so the link loads.

Final handoff links must be real-app, real-data links: before reporting completion, run the implemented branch against the user's actual app data on the expected app port, open that exact URL, verify the changed UI is visible there, and never present prototype, fixture, or alternate-port QA instances as the user check link unless explicitly labeled as such.
