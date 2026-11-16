# DRY: one source per fact, one home per behaviour

Scope: code, config and docs in every repo. Strict in dk-coding repos; in older repos it applies to new modules when touched (definitions in `core/agent-conduct.md`). Owner ruling 2026-10-04: extract on the second occurrence, and DRY applies to knowledge as well as text.

## Knowledge first

Every fact has exactly one authoritative source. Everything else imports it, generates from it, or is tested against it. Never hand-copy a fact.
Why: jscpd sees only text. A sort key repeated as a literal in three files passes the clone gate with 0 clones.

| Fact | The one source | Everyone else |
|---|---|---|
| Storage keys, sort-key prefixes | one keys unit in the domain | calls its builders; never writes the literal (`'ENT#'`) |
| Error codes | the error-code list in `contracts/` | imports it (TS) or generates from it (Dart) |
| Env keys | the Zod schema in `app/env.ts` / `composition/env.ts` | reads the parsed object; never `process.env.X` elsewhere |
| Design tokens | the token source (`design/tokens.css` or a token file) | generated platform tokens; no literal colour, spacing or radius |
| Routes and API paths | one route table | typed route helpers |
| Plan limits, prices, features | the config owner (your admin console or config service) | read at runtime; never a literal |
| Wire shapes and their types | the one schema the contract document names for that shape: Zod in the backend's `src/contracts/` for requests and responses, `contracts/*.schema.json` for shared data files | TS: `z.infer`, never a hand-written twin; Dart types and any second schema are generated with a `--check` gate, or run against every fixture of that shape in top-level `contracts/` |
| Cross-language rules (money, periods) | golden tables in `contracts/` | every platform's tests iterate the same file |

- When a fact must exist in a second language or file, generate it with a script that has a `--check` mode, and run `--check` in CI (regenerate, fail on diff). A copy without a check gate counts as a hand copy.
- Before adding a literal key, code, route or env name, grep for it. If it exists, import it.

## Code: extract on the second occurrence

- When the same logic appears a second time, extract it in the same PR. There is no grace copy.
- Same-reason-to-change test: extract only when both copies would change together, for the same reason (same rule, same owner, same contract). Copies that look alike but encode different knowledge stay apart (exemption 1).
- Never merge two behaviours behind a boolean or mode parameter. That is the wrong abstraction; split along the real seam instead.
  `formatAmount(x, isReport)` -> `formatReportAmount(x)` + `formatLedgerAmount(x)`, both calling one shared rounding unit.
- When an extracted helper starts growing flags for different callers, inline it back and re-extract the part that is truly shared.

## Where extracted code goes (dk-coding layout)

| What | Home | Versioned |
|---|---|---|
| Business rule used by 2 or more callers | `core/<area>/<unit>/` (web, mobile); `domain/<area>/<unit>/` (backend) | yes |
| Pure helper with no business meaning | `core/util/<name>` (web, mobile); `shared/<name>` (backend) | no, until its behaviour changes (below) |
| Component or widget used by 2 or more features | a `design/` primitive | no (UI) |
| Adapter plumbing (interceptor, retry, marshalling) | `services/_shared/` (web); `adapters/<service>/_shared/` (backend) | no |
| Test builders, fixtures, fakes | the repo's test-support directory | no |

- Never create `utils.*`, `helpers.*`, `misc.*`, `common.*`, `*_old`, `*_new` or `*-copy` files. Never put business behaviour in a per-layer `_shared/`.
- Older repos: use the shared location that the repo's `CLAUDE.md` names.
- Rollback rule for shared helpers: an unversioned helper may be edited in place only for changes that keep its contract (refactor, crash fix), or before its first production ship. An observable behaviour change to a shipped helper first moves it into a versioned unit (`v1` = current behaviour, `v2` = new) and callers import the pointer.
  Why: if `v1` and `v2` both call an edited unversioned helper, flipping the pointer back no longer restores the old behaviour.

## The only three exemptions

1. **Different reasons to change.** Keep the copies, wrap the clone in `jscpd:ignore-start` / `jscpd:ignore-end`, and put a reason comment on the start line naming both reasons.
2. **`v<N>` and `v<N+1>` of the same unit.** Duplication by design, because rollback needs the whole old file. `dry-gate.mjs` drops these pairs; a copy across two different units still fails. `v<N+1>` never imports `v<N>` (`stack/versioning.md`).
3. **Tests (DAMP).** Repeat setup inline when that makes the test readable. Share builders, fixtures and fakes; never share assertions, and never hide the arrange step in a helper the reader must open.

## Docs are DRY too

- A rule lives in one file. Everywhere else, point to it by path; never paste it. Pasted rules drift.
- A repo's convention doc maps these rules onto that repo's names. It never restates them.
- Generated reference (terraform-docs, schema docs) comes from tooling with an output check, not by hand.

## The gate

dk-coding repos (older repos: run the repo's own gates):

- jscpd on production code only (TS and Dart; tests excluded) with `minTokens: 35`, `minLines: 3`, `exitCode: 1`: zero clones. Why 35: a 50-token minimum misses the short copies that small units produce.
- Run it through `@DK_HOME@/skills/dk-coding/scripts/dry-gate.mjs`. It wraps `jscpd --reporters json` and removes only version pairs inside one unit (exemption 2). Never treat a jscpd `threshold` percentage as an allowance.
- `jscpd:ignore` without a reason comment fails review. Suppression in general: `core/agent-conduct.md`.
