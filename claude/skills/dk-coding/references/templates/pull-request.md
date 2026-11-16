<!-- .github/pull_request_template.md · what each section must hold: @DK_TEAM@/rules/stack/git-and-pr.md ("The PR body") -->
## What changed
<!-- one paragraph; link the contract or plan document this implements -->

## Versions
| Unit | Action | Rollback |
|---|---|---|
| `<layer>/<unit>` | added v2 / flipped pointer v1→v2 / patched v2 / removed v1 | `index.ts → ./v1.js` / `PERIODS_VERSION=1` / n/a |

## What ran
```
<command>            → <pass line, verbatim>
```

## What was only traced (not executed)
-

## Guards → tests (mutation checks)
| Guard | Test that fails when the guard is removed |
|---|---|
| | |

## Suppressions, quarantined tests, new dependencies
<!-- each with its reason / issue link / justification; "none" if none -->
-

## UI (light only)
<!-- screenshots or golden diffs -->

## Checklist
- [ ] `/dk-review` run (or the dk-coding review checklist answered); every Issue row fixed or listed here
- [ ] gates ran with output above: format, lint, typecheck, tests, `check:versions`, `dry-gate.mjs`, import rules
- [ ] no second copy of code or knowledge (keys, codes, env keys, routes, wire types come from their one source)
- [ ] behaviour change to a shipped unit is a new `v<N>` file; the previous file is untouched
- [ ] nothing but domain types and typed errors crosses a port; handlers, hooks and Notifiers stay thin
- [ ] doc comments on every new public symbol, version block present
- [ ] Terraform: `moved {}` for address changes; saved plan read in full; no literal names outside the live root
