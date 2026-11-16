# Agent conduct while coding

Scope: every repo and every session, including teammates and subagents. This file also defines where the other core rules apply.

## Where these rules apply

- **dk-coding repo:** its root, or the root of any package in its git repo, has `.dk-coding.json` or `scripts/check-versions.mjs`. One marker makes the whole git repo a dk-coding repo. A marker in a package (for example `backend/scripts/`) makes sibling packages such as `app/` and `contracts/` strict too. Every file in `@DK_TEAM@/rules/` is strict there; rule paths such as `core/dry.md` or `stack/versioning.md` are relative to that directory.
- **Older repo:** any repo without that marker (any repo you have not opted in). Apply `core/dry.md` and `core/architecture-hexagonal.md` to new modules when you touch them. Never restructure existing code to match, and never contradict that repo's `CLAUDE.md`; where they disagree, the repo's `CLAUDE.md` wins.
- Trust order is unchanged: code in the repo > the repo's `CLAUDE.md` > these rules and the dk-coding skill > `references/conventions.md`. Code is the authority on what exists and how it behaves today. These rules govern how new and changed code is written. Treat an existing violation as drift to report as a follow-up, never as a precedent to copy.

## Before writing

- Read the unit, its test, the port it implements and, in dk-coding repos, its pointer before editing any of them.
- Search before you write: grep for the function name, the literal (key, error code, route, env key) and the shared homes listed in `core/dry.md`. Reuse or extend what exists; never add a second copy.
- Verify that every API, method, option and CLI flag exists before you call it: read the source, the type definition or `--help`. Never call from memory.
  Why: a plausible but non-existent IAM action once blocked a deploy.

## While writing

- Make the smallest diff that does the task. No unrequested refactors, renames, reformatting or "while I'm here" fixes; list them as follow-ups in your report instead.
- Never get to green by suppression. That means no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, Dart `// ignore:`, `jscpd:ignore`, `#trivy:ignore`, `--no-verify`, skipped or deleted tests, loosened assertions, expectations edited without a stated behaviour change (`stack/testing.md`), or lowered thresholds. Fix the cause. The only exception is a suppression with a reason comment naming the cause, also listed in the PR body.
- Ask the owner before you add a dependency, create a new top-level directory, deploy, or make a bootstrap/IAM change. One approval covers one action; it never carries over to the next.
- Never run `terraform apply`/`destroy` in a dk-coding repo (`stack/terraform.md`). In older repos, ask first, as above.
- Never delete, revert or overwrite work you did not create: other agents' files, uncommitted changes, branches, worktrees. Ask first.
- When two rules conflict, or a rule conflicts with the task, stop and ask. Never pick one silently.

## Before saying done

- Trace every hop of the changed path against the real code before claiming it works (the tracing rule: signature, payload, schema, storage, and the guard that reads it back).
- Done means the repo's gates ran and passed, with their output shown: format, lint, typecheck and tests, plus `check:versions`, `dry-gate.mjs` and the import-rules check in dk-coding repos.
- Report what ran and what was only traced, as two separate lists. "Traced, not executed" is an honest answer; "it works" with nothing run is not.
