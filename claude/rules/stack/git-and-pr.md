---
paths:
---

# Git, commits and pull requests

Scope: branches, commits and PRs in dk-coding repos. Reaches sessions through the dk-coding skill. The repo's `CLAUDE.md` adds who may commit, push and merge; where it is stricter, it wins.

## Branches

- Branch from `develop`. Name it `feat/<area>-<short>`, `fix/<area>-<short>`, `chore/<area>-<short>` or `docs/<area>-<short>`.
- Every change goes through a feature branch and a PR, including one-line hotfixes. Never push to `develop` or `main` directly.
- Never promote `develop` to `main`. Who may merge into `develop` is set by the repo's `CLAUDE.md`; when it is silent, leave the merge to the owner.
- Before every push, run the repo's full local CI mirror and read its output (for example `bash scripts/ci-local.sh`). Never bypass hooks (`core/agent-conduct.md`).

## Commits (Conventional Commits)

- Format `type(scope): summary`, imperative, lower case, no trailing period. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`.
- Scope is `web`, `app`, `backend`, `terraform`, `contracts` or `docs`, optionally with `/<area>`.
- Name the unit and version when one is touched:

```
feat(web/budgets): add pace rule as compute-pace v2
fix(backend/sync): patch apply-sync-batch v2 clock clamp
chore(terraform): remove lambda-fn v1
```

- Squash merge, with the PR title as the commit subject, so the PR title follows the same format.

## What goes in one PR

- **A version bump is one PR:** the new `v<N+1>`, its test, the pointer flip (or switch) and the pointer-test update. Nothing else.
- **A version removal is its own PR**, after the conditions in `stack/versioning.md`.
- **Extracting a shared piece** that `v<N+1>` needs is its own PR, before the bump.
- **A refactor and a behaviour change never share a PR.** Why: a reviewer cannot tell a moved line from a changed one, and a revert takes both.
- A wire, key, route or error-code change edits the contract document and the `contracts/` fixtures in the same PR.

## The PR body

Use the template `references/templates/pull-request.md` in the dk-coding skill (`.github/pull_request_template.md` in the repo). It must state:

1. What changed, linking the contract or plan document it implements.
2. The **Versions** table: each unit added, flipped, patched or removed, with its rollback line.
3. **What ran:** each command with its pass line verbatim.
4. **What was only traced**, not executed, as a separate list (`core/agent-conduct.md`).
5. **Guards → tests:** each new or changed guard and the test that fails when it is removed (`stack/testing.md`).
6. Every suppression added, with its reason, and every quarantined test with its issue link.
7. Every new dependency with its justification (`stack/supply-chain.md`).
8. For UI: light-theme screenshots or golden diffs only.

## Hygiene

- Commit only files you changed for this task; never sweep in unrelated working-tree changes, generated output or local config.
- Never commit secrets, `.env*` files, Terraform state or plan files.
- Never rewrite history on a branch someone else has pulled; add a commit instead.
