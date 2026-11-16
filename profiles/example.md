# dk-team profile: example

Copy this file to `@DK_TEAM@/profiles/<name>.md` (e.g. `myapp.md`), fill it in, then run
`/dk-agents myapp P0` in Claude Code. The lead reads this file first.

## Repo
- Path: `~/code/myapp`
- Plan folder: `docs/plan/` (phase files: `docs/plan/phase-p<N>-*.md`)
- Read first: `docs/plan/README.md`, `docs/plan/AGENT-GUIDE.md`, the phase file, any reference pages it names
- Goal files: `docs/plan/goals/p<N>.md`
- Plan branch: `docs/plan` · phase branches: `feat/myapp-p<N>` (local only)

## Local gates (what "green" means)
| Area | Command |
|---|---|
| Everything, CI order | `bash scripts/ci-local.sh` |
| Backend | `npm --prefix backend run check:all` |
| Web | `npm --prefix web test` |

## Team template
| Teammate name | Agent | Typical scope |
|---|---|---|
| `manager` | `dk-manager` | goal, tasks, seams, verdicts |
| `backend` | `dk-implementer` (worktree) | `backend/` |
| `web` | `dk-implementer` (worktree) | `web/` |
| `tester` | `dk-tester` | tests, fixtures, e2e |
| `reviewer` | `dk-reviewer` | conventions + gates |
| `auditor` | `dk-auditor` | security, privacy, cost |

## Seams that break most often
1. API contract ↔ client types (regenerate, `--check` in the gates).
2. Database migration ↔ store ↔ the code that reads it back.

## Non-negotiables
- Local only until the owner says ship (dk-agents §0.5).
- <your data-residency, licence or architecture rules>
