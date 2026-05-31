# Anacronia Agent Notes

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `giosampietro/Anacronia`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage roles map to Anacronia's GitHub labels, with AFK work using `ready-for-agent` and human-needed work using `type:hitl`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` first and use `docs/adr/` for future ADRs. See `docs/agents/domain.md`.

### User test commands

When giving the user terminal commands for local checks or manual testing, also add or update a double-clickable Mac `.command` file under `batch-cmd/` and link it in the chat. The user prefers not to type terminal commands.

At the end of every issue implementation, include a direct browser URL the user can open to check the result in the app. Before presenting that link, verify that the required local services are running; if they are not, start them and keep them running so the link loads.
