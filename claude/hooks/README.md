# dk-coding hooks

These Claude Code hooks enforce the dk-coding rules in dk-coding repos. In older repos they do nothing.
They are dependency-free Node ESM scripts. Node 24 is current on this machine; anything from Node 20 up works.

## What each hook does

| Hook | Event / matcher | Does | Outcome |
|---|---|---|---|
| `h1-side-effects.mjs` | PreToolUse `Edit\|Write\|MultiEdit` | Checks a non-test file under a pure layer (`core/`, `domain/`, `usecases/`, `ports/`, `shared/` below `src/` or `lib/`). The redacting logger (`shared/log/`, `platform/log/`) is exempt. It scans only the incoming text, after stripping comments, strings and regex literals. TS: `Date.now(`, `new Date()`, `performance.now(`, `Math.random(`, `crypto.randomUUID(`/`getRandomValues(`, `setTimeout(`/`setInterval(`, `console.`, `process.env`, `import.meta.env`, and a global `fetch(` that no enclosing binding shadows. Dart: `DateTime.now(`/`timestamp(`, `Random(`, `Timer(`/`Timer.periodic(`/`Future.delayed(`, `print(`, `Platform.environment`. The message names the port to use. The banned list is defined in `rules/core/architecture-hexagonal.md`; this hook holds its regex form. Import rules stay with dependency-cruiser and `import_rules_test`. | Block (exit 2) |
| `h2-layout.mjs` | PreToolUse `Edit\|Write\|MultiEdit` | Blocks four layout problems: (a) a new `utils`/`helpers`/`misc`/`common` file anywhere except tests (a helper in `core/util/` or `shared/` gets a real name too), or a new stale copy (`*_old`, `*-backup`, `*.bak`, `* copy` always; `*_new`/`*-copy` only when the original file sits beside it, so `whats_new.dart` and `hero-copy.ts` pass); (b) a `v<N>` that imports a sibling version; (c) a direct `v<N>` import from anything other than its own test (same unit, or for Dart the mirrored `test/` tree), the pointer, a pointer test (same names as check-versions), the composition root (`allowedImporters`) or a migration (Dart `package:` imports included; import text inside a string literal is ignored); (d) a pointer with more than one export line (`export *` already re-exports types). | Block (exit 2) |
| `h3-post-edit.mjs` | PostToolUse `Edit\|Write\|MultiEdit` | Formats the file with a local formatter: prettier from `node_modules/.bin`, `dart format` (from the `.fvm` SDK when the repo has `.fvmrc`), or `terraform fmt`. It skips formatting silently when no formatter is installed. It then records the file for H4 and runs `check-versions` and `dry-gate --files <file>` in parallel. | Warn (additionalContext), never blocks |
| `h4-stop-gate.mjs` | Stop, SubagentStop | Runs only on the packages touched this session. For each one: `check-versions`, `dry-gate` on the touched files, dependency-cruiser (if the package has a config), `tsc --noEmit` (if it has a tsconfig) and eslint on the touched TS files. For Dart it reminds Claude to run `fvm flutter test test/architecture`. It never blocks when `stop_hook_active` is true: it runs the gates once more, and on a failure it tells the user and keeps the files recorded for the next stop. After the same failure blocks twice across turns, it lets the agent stop and tells the user. A passing run clears the touched list. A SubagentStop checks only that subagent's files. | Block once (decision `block`) |
| `h5-bash-guard.mjs` | PreToolUse `Bash` (applies everywhere, no marker needed) | Triggers on: a `git push` to `develop`/`main` (including `HEAD:main`, `refs/heads/develop`, `--all`/`--mirror`, or a bare push or a push of `HEAD`/`@` from those branches); `--no-verify`; `terraform`/`tofu` `apply`/`destroy`; `-backend-config`/`-reconfigure`; and adding a dependency (`npm i <pkg>`, `pnpm/yarn/bun add`, `flutter/dart pub add`). A bare `npm install`, `npm ci` or `pub get` passes. The line is tokenized like a shell: quoted text, heredoc bodies and `#` comments are data (a commit message that mentions `git push origin develop` passes); `$(...)`, backticks, `bash/sh/zsh -c '...'` and `eval` are scanned; wrappers (`sudo`, `env`, `timeout 30`, `xargs -n1`, `nice`, `if`/`{`) are skipped. | Ask (permission prompt) |
| `h6-frozen.mjs` | PreToolUse `Edit\|Write\|MultiEdit` | Checks edits to a `v<N>` file (or `modules/<m>/v<N>/*.tf`) that exists at `frozenRef` in `.dk-coding.json`. The edit must add a new `Patched:` line. The hook does nothing when there is no `frozenRef`, the ref doesn't resolve, or the file isn't at that ref. | Block (exit 2) |
| `h7-rules-frontmatter.mjs` | PostToolUse `Edit\|Write\|MultiEdit` on `**/.claude/rules/**.md` | Checks the YAML frontmatter: the closing `---`, `key: value` lines, `paths:` written as a list, globs quoted when they start with `*`/`{`/`[`, balanced `[]`/`{}`, and no absolute or `~` globs. A broken frontmatter makes a rule load unconditionally. | Warn |
| `h8-watch.mjs` | SessionStart, UserPromptSubmit, Pre/PostToolUse, PostToolUseFailure, SubagentStart/Stop, TaskCreated/Completed, TeammateIdle, Notification, Stop (no matcher; separate snippet `watch-settings-snippet.json`) | Posts a content-free summary (event, session, agent id/type, tool, file name or short description) to the dk-watch dashboard (`tools/dk-watch/`). 400 ms timeout. Applies everywhere, no marker needed. | Never blocks (always exit 0) |

## How a dk-coding repo is detected

`lib/dk-repo.mjs#dkRepo` walks up from the edited file. It finds the **package root** first: the nearest folder with `package.json` or `pubspec.yaml`, never above the git root. From there it checks each folder up to and including the git root for `.dk-coding.json` or `scripts/check-versions.mjs`. Without a git root it stops below `$HOME`. Files under any `node_modules/` folder, or under a `.claude/` folder, never count. That rule stops the skill's own `scripts/check-versions.mjs` from marking the skill folder as a repo. The one exception is a Claude Code agent worktree, `<repo>/.claude/worktrees/<name>/...`: it is a full checkout with its own git root, so a teammate's edits there are checked like edits in the main checkout.

With no marker the hook exits 0 and prints nothing. That covers every repo you haven't opted in. Two hooks don't check for a marker: H5 applies owner rulings everywhere, and H7 checks rule files.

**Multi-package repos:** one marker anywhere in the git repo (for example `backend/scripts/check-versions.mjs`) makes sibling packages strict too. Add `.dk-coding.json` at the repo root to be sure every package (web, Flutter, contracts) is covered.

`.dk-coding.json` (optional; its presence alone is a marker):

```json
{ "frozenRef": "prod-2026-11-01", "dartPackage": "myapp" }
```

`frozenRef` turns on H6. Point it at a **prod release tag**, never `origin/main`: merged code usually isn't shipped until prod is deployed. `dartPackage` overrides the `pubspec.yaml` name that H2 uses to resolve `package:` imports.

Hooks use the repo's own `scripts/check-versions.mjs`. They look from the package root up to the git root, then fall back to `@DK_HOME@/skills/dk-coding/scripts/check-versions.mjs`. They pass `--config check-versions.json` when that file sits in the package root. `dry-gate.mjs` always comes from the skill. When it is missing, that step is skipped.

## Enable

Run `dk-team install --hooks guard` (H1–H7), `--hooks watch` (H8, the dashboard feed) or `--hooks all`. The installer merges the right entries into `~/.claude/settings.json` (user level, so sub-repos and worktrees are covered) and keeps a backup. Then run `/hooks` in a Claude Code session to confirm. To do it by hand, merge `settings-snippet.json` / `watch-settings-snippet.json` into the `"hooks"` key yourself.

## Disable

- Everything: `DK_HOOKS_DISABLE=1` (or `all`) in the environment, or remove the block from `~/.claude/settings.json`.
- Some hooks: `DK_HOOKS_DISABLE=h1,h5`.
- One repo: remove its marker. Without a marker only H5 and H7 still run.

## Environment variables

| Variable | Effect |
|---|---|
| `DK_HOOKS_DISABLE` | `1`/`all` turns off every hook; a comma list (`h2,h6`) turns off only those hooks. |
| `DK_HOOKS_DRY_RUN=1` | H3 runs the formatter in check mode (it never writes). Use this for timing runs against real repos. |
| `DK_HOOKS_STATE_DIR` | Where session state is kept. The default is `$TMPDIR/dk-hooks/<session_id>/`: one `edited/<sha1>.json` marker per edited file (so parallel subagents never overwrite each other), plus `state.json` for H4's block counter. |
| `DK_HOOKS_STOP_GATE_MS` | Timeout for each H4 gate. The default is 120000. |

## Tests

```bash
cd @DK_TEAM@/hooks && node --test __tests__/*.test.mjs
```

The tests build throwaway git repos in `$TMPDIR`: a dk repo (marker plus a `check-versions` stub that fails while a `FAIL` file exists) and a legacy repo with no marker. They pipe hook-input JSON into each script. Setting `DK_HOOKS_DIR=<copy>` points the suite at a mutated copy, which is how each guard was mutation-checked. `parity.test.mjs` is a drift gate: the layout constants in `lib/dk-repo.mjs` (version file, test file, pointer and pointer-test names, default allowed importers) must equal those in `skills/dk-coding/scripts/check-versions.mjs`, which is copied into repos and so cannot import them.

## Measured cost (median of 6, Apple Silicon)

| Hook | A dk-coding file (`backend/src/usecases/get-me/v1.ts`) | An unmarked repo |
|---|---|---|
| H1, H2, H6, H7 | ~50 ms each (node startup) | ~50 ms |
| H3 (prettier check + check-versions + dry-gate) | ~290 ms | ~50 ms |
| H4 (check-versions, dry-gate, depcruise, tsc, eslint in parallel) | ~2.1 s, only at Stop and only after dk edits | 0 (nothing touched) |

## dk-watch (agent dashboard)

Run `dk-watch` (starts the server and opens http://127.0.0.1:4777). Enable the feed with `dk-team install --hooks watch`, then `/hooks`. Off: `DK_WATCH=0` or `DK_HOOKS_DISABLE=h8`. Details: `tools/dk-watch/README.md`.
