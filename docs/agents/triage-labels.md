# Triage Labels

## Status

- Role: current agent operating rules for translating triage roles to GitHub labels.
- Read through root `AGENTS.md`; do not treat as product contract.

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in Anacronia tracker | Meaning                                  |
| -------------------------- | -------------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`             | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`               | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`          | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `type:hitl`                | Requires human-in-the-loop work          |
| `wontfix`                  | `wontfix`                  | Will not be actioned                     |

When a skill mentions a role, use the corresponding label string from this table.

Existing implementation-plan issues also use `type:afk` to mark work that can be done without human input.
