---
name: dk-bump
description: Use when the owner runs /dk-bump to change the behaviour of a versioned unit whose current version already shipped to production. Creates v<N+1> beside v<N> with its doc block and copied test, flips the pointer and updates the pointer test. Refuses when v<N> never shipped.
argument-hint: "<unit-dir> \"<one-line behaviour change>\""
disable-model-invocation: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash(date *)
  - Bash(git rev-parse *)
  - Bash(git cat-file *)
  - Bash(node @DK_HOME@/skills/dk-coding/scripts/*)
  - Bash(npm run check:versions)
  - Bash(fvm flutter test *)
  - Bash(npx vitest run *)
  - Bash(npx jest *)
---

# dk-bump: add v<N+1> to a shipped unit

Scope: one unit directory (`$0`) in a dk-coding repo; `$1` is the one-line behaviour change. The rules are in `@DK_TEAM@/rules/stack/versioning.md` (read it if it is not in context); this skill only executes them.

## 1. Read the unit

Find the highest `v<N>` file (Terraform: `v<N>/` directory), its test, the pointer (`index.ts` / `current.dart`, or for Terraform the caller's `source` line) and the pointer test. Confirm the pointer exports `v<N>`. If it does not, stop and report what it exports.

## 2. Refuse when any of these hold

| Case | Answer |
|---|---|
| `$0` or `$1` missing | ask for both; the change line becomes `@change` |
| Not a dk-coding repo (`core/agent-conduct.md`, "Where these rules apply") | stop; older repos follow their own `CLAUDE.md` |
| The unit is a port, interface, value type, DTO or UI file | ruling C11 / C2: plain file, edit in place, never versioned |
| The unit already holds the maximum versions (ruling C4: two shipped plus one in development) | retire the oldest version first, in its own PR |
| `v<N>` never shipped (step 3) | ruling C10: edit `v<N>` in place with its test; a `v<N+1>` for an unshipped unit is dead code |
| The change is a crash, off-by-one or security fix that keeps the documented contract | not a bump: patch `v<N>` in place with a failing-first test and a `Patched:` line |

## 3. Did v<N> ship? (ruling C10)

1. Walk up from the unit to the repo root and read `.dk-coding.json`.
2. If it has `frozenRef`: `git rev-parse --verify --quiet <frozenRef>`. Then `git cat-file -e <frozenRef>:<repo-relative path of v<N>>`. Exit 0 means it shipped; continue. Non-zero means it did not ship; refuse.
3. If there is no `.dk-coding.json`, no `frozenRef`, or the ref does not resolve: ask the owner "Has `<unit>` v<N> shipped to production?" and wait. Never infer it from a merge to `develop` or `main`.

## 4. Create v<N+1>

- Copy `v<N>` to `v<N+1>` unchanged in behaviour. Update only the doc block: `@version` / `Version:` N+1, `@since` / `Since:` today from `date +%F` (date only, ruling C12), supersedes v<N>, `@change` = `$1`, `@rollback` = the exact one-line pointer change back to v<N>. Drop `Patched:` lines; they belong to v<N>.
- `v<N+1>` must not import `v<N>`. If it would need code from `v<N>`, stop: that code moves to a shared home first, in its own PR (placement table in `@DK_TEAM@/rules/core/dry.md`).
- Copy the test to `v<N+1>` (TS beside the file; Dart in the mirrored `test/` tree) and point its import and group name at v<N+1>. Leave `v<N>` and its test untouched.
- Flip the pointer to `v<N+1>`: one line. Terraform: the caller's `source` path; if resource addresses change, say that `moved {}` blocks are needed and do not guess them.
- Update the pointer test assertion to v<N+1>.

The copy between `v<N>` and `v<N+1>` is exempt from the DRY gate (exemption 2 in `core/dry.md`).

## 5. Verify, then hand back

- Run `npm run check:versions` (or the skill script with `--config check-versions.json`), the tests for both versions and the pointer test, and `dry-gate.mjs` to confirm the pair is exempt. Show each command, exit code and last lines.
- Then stop. The behaviour change itself goes into `v<N+1>` and its test next, in the same PR, which holds only these files (`@DK_TEAM@/rules/stack/git-and-pr.md`). Never commit.
- Report: files created and edited, what ran, what was only traced.
