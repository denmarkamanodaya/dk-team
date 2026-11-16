---
name: dk-review
description: Use when the owner runs /dk-review, before opening a PR, or in step 3 of the dk-agents review loop, to review the current branch's changes against the dk-coding conventions. It checks code and knowledge DRY, hexagonal boundaries, versioned units, errors and tests, and runs the repo's gates. Read-only; returns an Issue / Impact / Resolution table.
argument-hint: "[base-ref, default origin/develop]"
context: fork
agent: dk-reviewer
background: false
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff *)
  - Bash(git status *)
  - Bash(git log *)
  - Bash(git merge-base *)
  - Bash(git rev-parse *)
  - Bash(node @DK_HOME@/skills/dk-coding/scripts/*)
  - Bash(npm run check:*)
  - Bash(npm run lint)
  - Bash(npm run typecheck)
  - Bash(npx tsc --noEmit*)
  - Bash(fvm flutter test *)
  - Bash(fvm flutter analyze*)
  - Bash(terraform fmt -check *)
  - Bash(cargo test *)
  - Bash(cargo clippy *)
  - Bash(cargo fmt --check*)
  - Bash(cargo fmt --all --check*)
  - Bash(cargo deny check *)
  - Bash(bash scripts/ci-local.sh *)
---

# dk-review: review the current diff against dk-coding

Scope: the changes on the current branch, committed and uncommitted, in the repo where this session runs. Read-only: follow the "Read-only means" section of your agent definition.

## 1. Find the diff

- Base = `$ARGUMENTS` if given, otherwise the first of `origin/develop`, `develop`, `origin/main` that `git rev-parse --verify --quiet` resolves. Do not fetch; if the base may be stale, say so in the report.
- Run `git merge-base <base> HEAD` to get `<mb>`, then `git diff --stat <mb>`, `git diff <mb>` (working tree against the merge base, so uncommitted edits are included) and `git status --short` for untracked files. Read each untracked file in full.
- An empty diff: answer `PASS (empty diff against <base>)` and stop.

## 2. Decide how strict to be

For each touched package, apply "Where these rules apply" in `@DK_TEAM@/rules/core/agent-conduct.md`. In a dk-coding repo every rule file is strict. In an older repo, review only new modules against `core/` and that repo's `CLAUDE.md` wins.

## 3. Run the gates per touched package

Prefer the package's own script (look in `package.json` scripts, `scripts/ci-local.sh`, CI workflows); use the skill script only when the package has none. Run every gate even after one fails.

| Gate | TypeScript package | Flutter package |
|---|---|---|
| Versions | `npm run check:versions`, else `node @DK_HOME@/skills/dk-coding/scripts/check-versions.mjs --config check-versions.json` | `fvm flutter test test/architecture/` (versions and pointer tests) |
| DRY | `node @DK_HOME@/skills/dk-coding/scripts/dry-gate.mjs --root <pkg> --files <changed files>` | same command |
| Boundaries | `npm run check:deps` (dependency-cruiser) | the import-rules test in `test/architecture/` |
| Lint | `npm run lint` | `fvm flutter analyze` |
| Typecheck | `npm run typecheck`, else `npx tsc --noEmit` | covered by analyze |

- Rust touched: prefer the repo's own local CI script if it has one (e.g. `bash scripts/ci-local.sh`); otherwise `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cargo deny check licenses advisories`, and the repo's contract generator `--check` when generated contracts changed. Rules: `stack/rust.md`.
- Terraform touched: `terraform fmt -check -recursive <touched-root>` (pass the directory; do not `cd`), for the touched root only. Never `init`, `plan` or `apply`.
- `dry-gate: jscpd not found — skipped` on stderr exits 0 but means the DRY gate did not run; report it as not run.
- If `dry-gate.mjs` is missing, run the repo's jscpd script and classify any clone between `v<N>` and `v<M>` of the same unit as exempt (exemption 2 in `core/dry.md`). A raw jscpd failure on such a pair is a repo follow-up, not an issue in this diff.
- A gate that cannot run (no `node_modules`, no fvm, missing script) is reported as not run with the reason. Never install anything to make it run.

## 4. Walk the checklist against the diff

1. The "Review checklist" section of `@DK_HOME@/skills/dk-coding/SKILL.md`, every item. A forked skill does not receive the agent's preloaded skills, so Read that section unless its 15 items are already in your context.
2. Every rule in `@DK_TEAM@/rules/core/dry.md`, asked as a yes/no question of the diff. Hunt knowledge copies that jscpd cannot see: for each new literal key, error code, env name, route, limit, regex or token value, grep the repo for the same value and for its authoritative source.
3. Every rule in `@DK_TEAM@/rules/core/architecture-hexagonal.md`, asked the same way. At minimum: does a DTO, vendor model or SDK exception cross a port; does a driving adapter hold a business `if`; does a use case return HTTP or UI types; does an inner layer import the composition root; does a module bypass another module's public pointer; does a new port lack its fake and contract suite.
4. The `stack/` rule files for each layer the diff touches (the "Read before touching" table in dk-coding names them).

Read every file named in steps 1-4 that is not already in your context; never review from memory.

## 5. Report

Use the output format in your agent definition: verdict line, then the Issue / Impact / Resolution table with the rule file or checklist item named per row, the gates table, then **Ran** and **Traced only**. Every row cites `file:line`. Do not repeat rule text in the table; name the rule file and section.
