---
paths:
---

# Versioned units

Scope: every behavioural unit in a dk-coding repo (web, mobile, backend, Terraform, contracts). Reaches sessions through the dk-coding skill; it never applies to the legacy platform repos.

## What is versioned (rulings C1, C2, C11)

- **Versioned:** web `core/` modules, services, hooks, reducers/store slices; mobile use cases, domain rules, adapters (`data/`, `services/`, `platform/`), Notifiers; backend handlers, use cases, domain rules, adapters; every contract schema and fixture set; every Terraform module. Hooks, Notifiers and store slices hold behaviour, so they are versioned (C1).
- **Edited in place:** widgets, components, pages, screens, CSS, tokens (C2: screenshots and goldens cover them); composition roots (`app/`, `composition/`, `bootstrap.dart`, `main.dart`); generated files; test support; build scripts; pure helpers in `core/util/` / `shared/` (their rollback rule, which replaces the old 20-line allowance: `core/dry.md`); Terraform stacks, `roots/`, `env/`, `bootstrap/`; data files that carry a `schemaVersion`.
- **Never versioned:** ports (interfaces), value types, DTOs. Plain files, no pointer, no runtime test (C11). Why: an interface rollback cannot compile against its implementers, and its only runtime test exercises a fake.

## Layout

```
web/backend: src/core/periods/compute-period-window/{v1.ts, v1.test.ts, v2.ts, v2.test.ts, index.ts}
mobile:      lib/core/periods/compute_period_window/{v1.dart, v2.dart, current.dart}
terraform:   modules/lambda-fn/{v1/, v2/}      caller: source = "../../modules/lambda-fn/v2"
contracts:   contracts/sync/{v1/, v2/}         each with fixtures/ (which schema is authoritative: core/dry.md)
```

- File name `v<N>`, `N` a positive integer. Never `v1.1`, `v2-beta`, `_old`, `_new`, `_final`, `_copy`, `_fixed`. A unit starts at `v1` in its first commit.
- The pointer is exactly one export line: TS `export * from './v2.js';`, Dart `export 'v2.dart';`. No logic in it. Barrels exist only as version pointers and in `contracts/`.
- The symbol keeps its plain name (`computePeriodWindow`); the version lives in the path, never the identifier (no `computeXV2`). Alias when two coexist: `import * as v1 from './v1.js'` / `import 'v1.dart' as v1;`.
- Callers import the pointer. The only legal direct importers of a `v<N>` file: its own test, the pointer, the pointer test, the composition root (runtime switch), a data migration.
- `v<N+1>` never imports `v<N>`. Copy the piece into `v<N+1>` (exempt: `core/dry.md` exemption 2), or extract it first in its own PR per the `core/dry.md` placement table (a business rule becomes its own versioned unit).

## Versioning — the part agents get wrong

| Situation | Do | Never |
|---|---|---|
| The unit never shipped to production (dev-only, or merged but not yet in prod) | edit `v1` in place, with its test | create `v2` — it only leaves a dead `v1` and its tests behind |
| Port / interface / value type | plain file (`ports/<name>.ts`, Dart `core/<area>/ports/<name>.dart`), no pointer, no runtime test | versioning it — an interface rollback cannot compile, and a test of a fake written inside the test proves nothing |
| "Change how `computeX` behaves" (unit already in production) | create `v<N+1>` beside `v<N>` with `@version`, `@since`, `@change`, `@rollback`; copy the test file to `v<N+1>.test`; flip the pointer; update the pointer test | edit `v<N>` in place, even "minimal", even "we ship today" |
| Crash / off-by-one / security fix that keeps the documented contract | patch `v<N>` in place with a failing-first test and a `Patched:` line | call an observable behaviour change a "patch" |
| New function/service/hook/use case/module | create the unit directory with `v1` + test + pointer (templates in the dk-coding skill) | a loose `helpers.ts` or `utils.dart` |
| Need to test the new version on dev only, or revert without a deploy | integer runtime switch (`X_VERSION=2`) read only in the composition root, fail-fast on unknown; delete after two releases | a boolean flag, or `if (version === 2)` inside a use case |
| New validation or a new error code in a bump | put it in `v<N+1>` (it is observable behaviour); never patch it into `v<N>` | widening `v<N>`'s contract "while you're there" |
| `v2` needs something from `v1` | copy it into `v2`, or extract it first (Layout above); switching `v1` to the extracted piece is a refactor patch (Lifecycle) | `v2` importing `v1` |
| Retiring `v1` | own PR after two releases, zero importers (`knip` / analyzer output pasted), no stored data depends on it | deleting in the same PR as the bump |
| Widgets, components, pages, CSS, tokens | edit in place (screenshots/goldens cover them) | versioning UI files |

Pressure phrases that do not change the rule: "quick one", "before standup", "keep it minimal", "we ship today", "just a param with a default", "it's backward compatible". A new parameter with a default is still a new observable behaviour, so it goes in `v<N+1>`.

## Lifecycle (rulings C4, C10)

| State | Meaning | Allowed edits |
|---|---|---|
| active | selected by the pointer in prod; stays active while `v<N+1>` is in development | behaviour-preserving patches only |
| previous | superseded, still in the tree, its tests still run (they prove the rollback target) | none |
| removed | deleted in its own PR | — |

- **Shipped = in production, recorded by a prod tag.** The repo names that tag ref as `frozenRef` in `.dk-coding.json` at its root; `git cat-file -e <frozenRef>:<path>` succeeding means the file shipped. Merged to `develop` or `main` is not shipped (`main` deploys prod only by manual dispatch). No prod release yet means nothing is frozen. If the repo has deployed to prod but records no `frozenRef`, stop and ask the owner which ref is prod.
- **Freeze** at the first prod ship (C10). Before it, edit `v1` in place; a `v2` for a unit that never shipped is dead code.
- **Patch:** a fix that keeps the documented contract may edit the active file, with a failing-first test and a dated `Patched:` line. A behaviour-preserving refactor (such as switching to an extracted piece) may too: existing tests unchanged and green, plus a dated `Patched: refactor, <what>` line, in its own PR. A change callers can observe on valid input is a new version.
- **Remove:** the current version has been active in prod for two releases, nothing imports the old one, no stored data depends on it. PR title `chore(<scope>): remove <unit> v<N>`.
- **Cap (C4):** two shipped versions plus one in development per unit; `check:versions` fails at more than three `v<N>` files.

## Selecting the active version (ruling C3)

- **Pointer flip** is the default; rollback is a one-line PR on the pointer.
- **Runtime switch** only for a stage or cohort test, or when reversal must not wait for a deploy. Integer, never boolean. Backend: a value in the stage's `env/<stage>.<stack>.tfvars` passed to the Lambda env (`stack/terraform.md`). Clients: a build-time define and a server-driven value; the server value wins when present. Only the composition root reads it, maps integer to file, fails fast with `UNKNOWN_VERSION`, and logs the chosen value once per start. A switch lives at most two releases, then the pointer flips and the switch is deleted.

## Doc block and tests

- Every `v<N>` carries `@version`, `@since`, `@change`, `@rollback` (TS) or `Version: · Since: · Supersedes: · Change: · Rollback:` (Dart), plus `Patched:` lines. `@since` / `Since:` is the date only, no PR number (C12). Full blocks: `references/templates/unit-*.md` in the dk-coding skill; general doc rules: `stack/code-style.md`.
- Test placement: TS `v<N>.test.ts` beside the version file; Dart `v<N>_test.dart` in the mirrored tree `test/<layer>/<area>/<unit>/`; Terraform `tests/v<N>.tftest.hcl` inside `modules/<name>/v<N>/`.
- Pointer tests assert the pointer exports the intended version, one assertion per unit: TS `src/<layer>/__tests__/pointers.test.ts`; Dart `test/architecture/pointers_test.dart`, which may split per layer as `pointers_<layer>_test.dart`. Other test rules: `stack/testing.md`.
- Wire versions (`/v1/sync`, `contracts/sync/v2`) are separate from code versions; code `v2` may serve wire `/v1` (`stack/api-design.md`).

## Enforcement

Run `node scripts/check-versions.mjs` (`npm run check:versions`). It fails on: a stray file in a unit (only `v<N>`, its test, the pointer, `README.md`); a direct `v<N>` import from an illegal importer; `v<N+1>` importing `v<N>`; a missing `@version` / `Version:`; more than three versions; `.tf` files in `modules/<name>/` outside `v<N>/`. Terraform module specifics (`moved {}`, the `live` alias): `stack/terraform.md`.
