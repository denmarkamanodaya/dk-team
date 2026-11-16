---
name: dk-coding
description: Use when writing, reviewing or scaffolding code in any codebase that opts into dk-coding — web SPAs (React + Vite + TypeScript), mobile apps (Flutter/Dart), Rust desktop cores and Tauri shells, serverless TypeScript backends and their Terraform — including when asked to "change how X behaves", add a function/service/hook/module, extract duplicated code or a shared helper (DRY), decide where a port, adapter or use case belongs (hexagonal, ports and adapters), bump or roll back a version, set up lint/CI for a new repo, or review a PR against the house conventions
allowed-tools:
  - Read(@DK_TEAM@/rules/**)
  - Bash(cat @DK_TEAM@/rules/*)
---

# dk-coding: the owner's coding conventions

Applies to every codebase marked with `.dk-coding.json` (or `scripts/check-versions.mjs`). Older repos adopt it per module when touched; read them as prior art, never copy their structure.

The rule files in `@DK_TEAM@/rules/` are the single source of truth (ruling C16). This skill injects the ones every change needs (end of this file), indexes the rest, and holds the templates, scripts and review checklist. Rationale and every ruling: `references/conventions.md`. Where the rules apply, how strict they are, and the trust order: `core/agent-conduct.md`. Rule paths below (`core/...`, `stack/...`) are relative to `@DK_TEAM@/rules/`.

## Read before touching

The injected files cover every change. The `stack/` files below are not injected: Read the one for the kind of file you edit before you edit it.

| You are touching | Read first |
|---|---|
| Rust / Tauri: `crates/**/*.rs`, `app/src-tauri/**`, `Cargo.toml`, `clippy.toml`, `deny.toml` | `stack/rust.md` |
| Web SPA: `src/**/*.{ts,tsx,css}`, `index.html`, web `package.json` | `stack/web-react.md` |
| Flutter: `lib/**`, `test/**`, `integration_test/**`, `pubspec.yaml`, `analysis_options.yaml`, `Info.plist`, `AndroidManifest.xml` | `stack/mobile-flutter.md` |
| Lambda backend: `handlers/`, `adapters/`, `composition/`, `tsconfig`, the ESLint config, the bundler script | `stack/backend-lambda.md` |
| Terraform: `*.tf`, `*.tftest.hcl`, the plan guard, Terraform CI and deploy workflows | `stack/terraform.md` |
| Wire contracts: `contracts/**`, routes, request and response shapes, the error envelope, list endpoints | `stack/api-design.md` |
| Stored data: keys, items, drift schema, migrations, backfills | `stack/data-and-migrations.md` |
| Identity, authorisation, input validation, secrets, CORS, SSRF-prone fetches | `stack/security.md` |
| Dependencies, lockfiles, `.npmrc`, `.github/**` workflows | `stack/supply-chain.md` |
| Logging, metrics, alarms, request ids | `stack/observability.md` |
| Model calls, prompts, tool use, model output | `stack/ai-features.md` |
| Feature flags, plan or limit gating, runtime version switches | `stack/feature-flags.md` |
| Instants, calendar dates, money, currency, user-facing strings | `stack/time-money-i18n.md` |

## Layer map

Owned by `core/architecture-hexagonal.md` ("Layer map", injected below), including Terraform. Shared-code homes: the placement table in `core/dry.md`.

## Toolchain

Pin every tool version at project start. Each codebase's tool list lives in its stack file: web `stack/web-react.md`, mobile `stack/mobile-flutter.md`, backend `stack/backend-lambda.md`, Terraform `stack/terraform.md` (Gates, CI order). Formatter and size limits: `stack/code-style.md`. Coverage and mutation gates: `stack/testing.md`. Which tool enforces which rule: the enforcement matrix in `references/conventions.md`.

## Templates, scripts, hooks and commands

- `references/templates/unit-typescript.md`: TS unit (web core, service or hook; backend use case, adapter or handler) with doc block, test and pointer test.
- `references/templates/unit-dart.md`: Dart unit with the `current.dart` pointer, mirrored test and `pointers_<layer>_test.dart` line.
- `references/templates/unit-terraform.md`: module `v<N>/` skeleton, README head, `tftest`, caller line.
- `references/templates/pull-request.md`: PR body with the Versions table, what ran, what was traced, guards to tests.
- `scripts/check-versions.mjs`: the version-layout gate. Run it from the package root: `node @DK_HOME@/skills/dk-coding/scripts/check-versions.mjs [--config check-versions.json]`; repos wire their copy as `npm run check:versions`. Flags and exit codes: its header.
- `scripts/dry-gate.mjs`: the zero-clone gate with the version-pair exemption: `node @DK_HOME@/skills/dk-coding/scripts/dry-gate.mjs --root <pkg> [--files a,b] [--json]`. Usage and defaults: its header.
- Script tests: `cd @DK_HOME@/skills/dk-coding/scripts && node --test`.
- Hooks (side-effect guard, layout guard, post-edit gates, stop gate, Bash guard, frozen-version guard, rule-frontmatter check): `@DK_TEAM@/hooks/README.md`. As of 2026-10-04 they are **not enabled**: they run only after `hooks/settings-snippet.json` is merged into `~/.claude/settings.json` with owner approval (README "Enable"). Until `/hooks` lists them, run the gates yourself.
- Command skills: `/dk-new-unit` scaffolds a `v1` unit; `/dk-bump` adds `v<N+1>` to a shipped unit (owner-invoked only); `/dk-review` reviews the branch diff; `/dk-dry` audits duplication. Agent `dk-reviewer` (`@DK_HOME@/agents/dk-reviewer.md`) backs `/dk-review`, `/dk-dry` and the dk-agents review loop.

## Review checklist (answer each, or block)

Cite the rule file for every "no".

1. **Layers:** is business logic in `core/` / `domain/` / `usecases/`, framework-free, with every dependency pointing inward? (`core/architecture-hexagonal.md`)
2. **Boundary:** are DTOs, rows, vendor models and SDK exceptions mapped inside the adapter, so nothing but domain types and typed errors crosses a port? Does any use case import a wire schema or a row type?
3. **Thin driving adapters:** does each handler, hook or Notifier only parse, call one use case and shape the result, with no business `if`, key lookup, limit choice or flag read?
4. **Ports:** is each port declared in the core, typed in domain terms, with an in-memory fake and one contract suite run against the fake and the real adapter?
5. **Composition root:** is it the only place that reads env, builds clients and selects versions, with no service locator and no inner layer importing it?
6. **Side effects:** is every banned call (time, randomness, env, console/print, IO) absent from pure layers and injected through a port instead?
7. **Code DRY:** is `dry-gate.mjs` clean, with every exemption one of the three in `core/dry.md` and carrying a reason? Are there no boolean or mode parameters that merge two behaviours, and no `utils` / `helpers` / `misc` files?
8. **Knowledge DRY:** does every key, error code, env key, route, token, limit and wire type in the diff come from its one source in `core/dry.md`? Grep each new literal. Is every second-language copy generated, with a `--check` gate?
9. **Versions:** is a behaviour change to a shipped unit a new `v<N+1>`, with the previous file untouched, the pointer flipped and a rollback line? Is an unshipped unit edited in place? Are ports, value types and UI unversioned, and does nothing import across versions? (`stack/versioning.md`)
10. **Docs and names:** are doc comments more than the name, with a version block where required? Are names the right case, in the glossary, with the version in the path? (`stack/code-style.md`)
11. **Errors:** are errors typed with an `UPPER_SNAKE` code, expected failures returned as `Result<T, E>`, nothing swallowed, and timeouts and retries within the rules? (`stack/errors-and-resilience.md`)
12. **Tests:** is there a wire test per contract, a recorded mutation check per guard, a test per version file and a pointer test, with no expectation edited without a stated behaviour change? (`stack/testing.md`)
13. **Terraform:** are literals only in the live root, with no `terraform.tfvars`, no `*` IAM, `moved {}` for address changes, the stage chosen by directory, no apply by the agent, and no `.tf` outside `v<N>/`? (`stack/terraform.md`)
14. **Suppressions:** were any added (`eslint-disable`, `// ignore:`, `jscpd:ignore`, a lowered threshold, a skipped test)? Each needs a reason and a PR line (`core/agent-conduct.md`).
15. **PR:** does it list what ran (with pass lines) and what was only traced, plus the Versions table and guards to tests? (`stack/git-and-pr.md`)

## The rules every change needs (injected)

!`cat @DK_TEAM@/rules/core/agent-conduct.md`

!`cat @DK_TEAM@/rules/core/architecture-hexagonal.md`

!`cat @DK_TEAM@/rules/core/dry.md`

!`cat @DK_TEAM@/rules/stack/versioning.md`

!`cat @DK_TEAM@/rules/stack/code-style.md`

!`cat @DK_TEAM@/rules/stack/errors-and-resilience.md`

!`cat @DK_TEAM@/rules/stack/testing.md`

!`cat @DK_TEAM@/rules/stack/git-and-pr.md`

If any block above is empty, reads `[shell command execution disabled by policy]`, or shows a `cat:` error, Read these files before writing code: `@DK_TEAM@/rules/core/agent-conduct.md`, `core/architecture-hexagonal.md`, `core/dry.md`, `stack/versioning.md`, `stack/code-style.md`, `stack/errors-and-resilience.md`, `stack/testing.md`, `stack/git-and-pr.md`.
