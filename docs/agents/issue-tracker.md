# Issue tracker: GitHub

## Status

- Role: current agent operating rules for GitHub issue operations.
- Read through root `AGENTS.md`; do not treat as product contract.

Issues and PRDs for this repo live in GitHub Issues for `giosampietro/Anacronia`. Use the `gh` CLI for issue operations.

## Conventions

- **Create an issue**: `gh issue create --repo giosampietro/Anacronia --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --repo giosampietro/Anacronia --comments`
- **List issues**: `gh issue list --repo giosampietro/Anacronia --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> --repo giosampietro/Anacronia --body "..."`
- **Apply labels**: `gh issue edit <number> --repo giosampietro/Anacronia --add-label "..."`
- **Remove labels**: `gh issue edit <number> --repo giosampietro/Anacronia --remove-label "..."`
- **Close an issue**: `gh issue close <number> --repo giosampietro/Anacronia --comment "..."`

When a skill says "publish to the issue tracker", create a GitHub issue in `giosampietro/Anacronia`.

When a skill says "fetch the relevant ticket", run `gh issue view <number> --repo giosampietro/Anacronia --comments`.
