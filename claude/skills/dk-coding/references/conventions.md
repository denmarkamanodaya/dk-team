# dk-coding: rationale, rulings and enforcement

**Status:** v1 approved by the owner 2026-10-03 (C1–C9). v2 2026-10-04: every rule moved into `@DK_TEAM@/rules/` (C16), DRY made strict and knowledge-wide (C13), delivery fixed (C14), Terraform `terraform.tfvars` dropped (C15).
**What this file holds:** why the convention looks the way it does, the decisions table, the enforcement matrix and the toolchain index. It holds no rules. Each former section is now a one-line pointer to the rule file that owns it. Rule paths (`core/...`, `stack/...`) are relative to `@DK_TEAM@/rules/`.
**Where rules apply, how strict, and the trust order:** `core/agent-conduct.md`. The trust order is unchanged from v1.

Each app maps these rules onto its own layer names in its own docs. Per `core/dry.md` ("Docs are DRY too"), that file should map and point, never restate. Today it is a 547-line fork; reducing it is a follow-up in that app.

---

## Why

- **Independence.** These rules are written on their own merits. Older repositories are prior art to read, never a pattern to copy. Platform-wide owner rulings (feature branch + PR, never promote to `main`, trace every hop, Terraform picks the stage by directory) are restated as rules because a new repo must hold them without depending on the platform docs.
- **Hexagonal.** The core (entities, value objects, use cases) knows nothing about React, Flutter, dio, axios, drift, Firebase, AWS SDKs or Lambda events. It declares ports; adapters implement them. The payoff: money, period, validation and state rules run as plain unit tests on every platform against shared golden tables, and a vendor change touches one adapter.
- **Side-by-side versions.** Editing `sum()` in place means the only way back is a `git revert` across whatever else shipped. With `v1` and `v2` as separate files, both exist, both are tested, one is active, and rollback is a pointer flip. UI is excluded because screenshots and goldens verify it, and versioning it doubles the tree for no rollback value.
- **Strict DRY (C13).** The owner chose second-occurrence extraction over rule-of-three. The guard against premature abstraction is the same-reason-to-change test and the ban on mode flags, not a grace copy. DRY covers knowledge as well as text, because the clone gate passed the first app with 0 clones while one sort key existed as a literal in three files.
- **Rules as files (C16).** The convention lived in one 489-line reference that loaded only when the skill triggered, and repos forked it. Rule files load on their own (core) or through skill injection (stack), and every other document points at them, so there is one copy to keep right.

## Sections moved to rule files

0. The twelve rules: hexagonal and side effects `core/architecture-hexagonal.md`; versioning `stack/versioning.md`; doc comments, naming, unit size, formatter `stack/code-style.md`; DRY `core/dry.md`; typed errors `stack/errors-and-resilience.md`; wire tests and mutation checks `stack/testing.md`; Terraform `stack/terraform.md`; ran vs traced `core/agent-conduct.md`.
1. Hexagonal architecture per codebase: `core/architecture-hexagonal.md` (layer map, ports, adapters, composition root); per-platform rules in `stack/web-react.md`, `stack/mobile-flutter.md`, `stack/backend-lambda.md`.
2. Code versioning: `stack/versioning.md`. Terraform specifics (old §2.6): `stack/terraform.md`. Doc blocks (old §2.7): `references/templates/unit-*.md`. Wire versions (old §2.9): `stack/api-design.md`. `check:versions` (old §2.10): `stack/versioning.md` "Enforcement" and the script header.
3. Naming: `stack/code-style.md`. Test names `stack/testing.md`; branch names `stack/git-and-pr.md`.
4. Documentation comments: `stack/code-style.md`.
5. Web: `stack/web-react.md`. Shared-code placement (old §5.3): `core/dry.md`.
6. Mobile: `stack/mobile-flutter.md`. Errors and `Result` (old §6.2): `stack/errors-and-resilience.md`.
7. Backend: `stack/backend-lambda.md`. Errors, `Result`, logging (old §7.2): `stack/errors-and-resilience.md`, `stack/observability.md`.
8. Terraform: `stack/terraform.md`.
9. Testing: `stack/testing.md`.
10. Git, commits, PRs: `stack/git-and-pr.md`.
11. Review checklist: `SKILL.md` "Review checklist".

New in v2, with no v1 section: `stack/security.md`, `stack/supply-chain.md`, `stack/data-and-migrations.md`, `stack/observability.md`, `stack/ai-features.md`, `stack/feature-flags.md`, `stack/time-money-i18n.md`.

---

## Decisions

| # | Question | Ruling | Owned by |
|---|---|---|---|
| C1 | Version controllers (Notifiers, hooks, store slices)? | Yes: they hold behaviour | `stack/versioning.md` |
| C2 | Version widgets, components, screens? | No: screenshots and goldens cover them | `stack/versioning.md` |
| C3 | Runtime switch source | Clients: build-time define **and** a server-driven value; the server wins when present. Backend: a literal in the live root (C15) | `stack/versioning.md` |
| C4 | Shipped versions per unit | Two, plus one in development | `stack/versioning.md` |
| C5 | `Result` type | Hand-rolled, no dependency; one `Result<T, E>` in both languages (single-parameter `Result<T>` removed 2026-10-04) | `stack/errors-and-resilience.md` |
| C6 | Terraform security scanner | `trivy config` | `stack/terraform.md` |
| C7 | Dart duplication tool | jscpd with the Dart format, same thresholds as TypeScript (revised 2026-10-04: `dart_code_linter` has no duplication metric); run through `dry-gate.mjs` | `core/dry.md` |
| C8 | Line length | 100 everywhere | `stack/code-style.md` |
| C9 | `infracost` PR comments | Off by default | this table (no rule needed while off) |
| C10 | When is a version frozen? (2026-10-04) | At the first production ship, recorded by a prod tag named as `frozenRef` in `.dk-coding.json`; merged is not shipped. Before that, edit `v1` in place | `stack/versioning.md` |
| C11 | Version type-only units (ports, value types, DTOs)? (2026-10-04) | No: plain files, no pointer, no runtime test | `stack/versioning.md` |
| C12 | PR number in `@since`? (2026-10-04) | No: date only | `stack/versioning.md` |
| C13 | How strict is DRY? (2026-10-04) | Extract on the second occurrence; knowledge-DRY (one source per fact, generated copies behind a `--check` gate). The only exemptions: copies that change for different reasons, `v<N>`/`v<N+1>` pairs inside one unit, DAMP tests. A behaviour change to a shipped shared helper first moves it into a versioned unit | `core/dry.md` |
| C14 | How do the rules reach a session? (2026-10-04) | `core/` is always on in every repo through the dk-agents and dk-coding skills, which inject `@DK_TEAM@/rules/core`, so its wording is legacy-safe: strict in dk-coding repos, applied to new modules when touched elsewhere, never contradicting a repo's `CLAUDE.md`. `stack/` reaches sessions through dk-coding / dk-agents injection, and through `paths:` scoped only to the app's own folder, never a glob that can match the platform repos | `core/agent-conduct.md` |
| C15 | `terraform.tfvars` in live roots? (2026-10-04, audit A6) | No. The first app's ruling is adopted: a live root holds a literal `backend.tf` and a `main.tf` whose stage values are literals passed straight to the stack module; no `terraform.tfvars` anywhere, no re-declared variables, never `-var` / `-var-file` (audit D7) | `stack/terraform.md` |
| C16 | Where do rules live? (2026-10-04) | In the rule files only. `SKILL.md` indexes and injects them; this file holds rationale, rulings and enforcement; repo docs map and point. A conflict is fixed in the rule file, never by a second copy | `core/dry.md` |

### Contradictions fixed in v2 (audit 2026-10-04)

| Id | Was | Now |
|---|---|---|
| A1 | The zero-clone gate failed every non-trivial `v2` | `dry-gate.mjs` drops version pairs inside one unit (`core/dry.md`) |
| A2 | Unversioned shared helpers broke rollback | Rollback rule for shared helpers (`core/dry.md`) |
| A3 | "Third copy blocks review" contradicted the zero-clone gate | Removed; second occurrence extracts |
| A4, A5 | `Result<T>` vs `Result<T, E>`; a `sealed` Dart root that cannot compile | One `Result<T, E>`; `abstract` root with sealed families per area (`stack/errors-and-resilience.md`) |
| A6 | `terraform.tfvars` required here, banned in the first app | C15 |
| A7, A8 | Dart test placement; a single pointer-test file | Mirrored `test/` tree; `pointers_<layer>_test.dart` allowed (`stack/versioning.md`) |
| A9, A10 | `src/ports` a default root; `CHANGES.md` allowed in a unit | Both removed from `check-versions.mjs` |
| A12 | Dead pointer to an app-specific docs folder | Points into that app's repo |
| A13 | "Shipped" undetectable | C10 `frozenRef` |
| A15 | "Lines" undefined | Non-blank, non-comment lines (`stack/code-style.md`) |
| A16 | dk-agents never loaded dk-coding | dk-agents injects `core/` and requires `Skill(dk-coding)` in every spawn prompt |

A14 (trust order puts code above the convention) was not changed: it needs an owner ruling.

---

## Enforcement matrix

| Rule | Dart | TypeScript (web + backend) | Terraform |
|---|---|---|---|
| Format | `dart format --set-exit-if-changed` | `prettier --check` | `terraform fmt -check` |
| Lint | `flutter analyze` | `eslint` (+ `stylelint` on web) | `tflint` |
| Doc comments | `public_member_api_docs` | `jsdoc/require-jsdoc` | `terraform_documented_*` |
| Layering | `import_rules_test.dart` | `dependency-cruiser` + `no-restricted-imports` | module contract + plan guard |
| Side effects in pure layers | hook H1 + `avoid_print` | hook H1 + ESLint (`process.env` ban; backend `no-console`) | n/a |
| Versioning | `versions_test.dart` + `check:versions` + hooks H2, H6 | `check:versions` + `no-restricted-imports` + hooks H2, H6 | `check:versions` |
| Complexity / size | metrics lint | `complexity`, `max-lines-per-function`, `max-params` | n/a |
| Code duplication | `dry-gate.mjs` (jscpd, Dart format) | `dry-gate.mjs` (jscpd) | review |
| Knowledge duplication | generators with `--check` in CI + review | generators with `--check` in CI + review | review |
| Dead code | analyzer `unused_*` | `knip` | `terraform_unused_declarations` |
| Secrets | redaction test + `gitleaks` | redaction test + `gitleaks` | `trivy` + `gitleaks` |
| Tests | `flutter test` + coverage | `vitest`/`jest` + thresholds + Stryker incremental (+ Playwright on web) | `terraform test` + plan-guard fixture |
| Dependencies | `pub get --enforce-lockfile` | `npm ci`, `npm audit signatures` | lock file committed |
| Security | design + import tests | `npm audit --omit=dev` | `trivy config`, `check:iam-scope` |
| Agent session | hooks H3 (post-edit), H4 (stop gate), H5 (Bash guard) | same | H3 formats; H5 asks before `apply` / `destroy` |

Hooks: `@DK_TEAM@/hooks/README.md`. Hooks H1-H7 are opt-in: every "hook" cell above is inactive until you install with `dk-team install --hooks guard` (or `all`). Until then the CI and gate columns are the only enforcement. Gate details per stack: the rule files in the toolchain index below.

## Toolchain index

Pin every tool version at project start. The tool lists live in the rule files; this table only says where.

| Codebase | Tools and settings | Gates and CI order |
|---|---|---|
| Web (React + Vite + TS) | `stack/web-react.md` "Toolchain" | `stack/testing.md` "Gates" |
| Mobile (Flutter) | `stack/mobile-flutter.md` "Toolchain" | `stack/testing.md` "Gates" |
| Backend (TS on Lambda) | `stack/backend-lambda.md` "Toolchain" | `stack/testing.md` "Gates" |
| Terraform | `stack/terraform.md` "Gates" | `stack/terraform.md` "CI order" |
| All | formatter and size limits `stack/code-style.md`; DRY gate `core/dry.md`; dependencies `stack/supply-chain.md` | `core/agent-conduct.md` "Before saying done" |
