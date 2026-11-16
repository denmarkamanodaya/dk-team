---
name: dk-agents
description: Use when the owner invokes /dk-agents or asks to run a task with a team of agents — any multi-part or parallelizable work worth splitting across named teammate agents (manager, implementers, tester, reviewer, auditor) with the lead running a goal loop until the acceptance criteria are met. Repos with a profile in dk-team/profiles get a one-line shortcut.
argument-hint: "[<profile> <phase> [fresh], e.g. myapp P0 fresh] or a free-text goal"
allowed-tools:
  - Read(@DK_TEAM@/rules/**)
  - Read(@DK_HOME@/skills/dk-agents/**)
  - Read(@DK_TEAM@/profiles/**)
  - Bash(cat @DK_TEAM@/rules/*)
---

# dk-agents — lead an agent team through a goal loop

Full lifecycle, always in this order: **goal → plan (manager) → spawn → build → test → review + audit → verdict (manager) → loop until ACCEPT → update brains → let them rest.** No step is optional.

## 0. The core rules (injected; they bind the lead and every teammate)

!`cat @DK_TEAM@/rules/core/agent-conduct.md`

!`cat @DK_TEAM@/rules/core/architecture-hexagonal.md`

!`cat @DK_TEAM@/rules/core/dry.md`

If any block above is empty, reads `[shell command execution disabled by policy]`, or shows a `cat:` error, Read `@DK_TEAM@/rules/core/agent-conduct.md`, `core/architecture-hexagonal.md` and `core/dry.md` before spawning. The `stack/` rules reach teammates through the dk-coding skill (preloaded in every role agent).

## 0.5 Local only (default; binds the lead and every teammate)

- **Nothing leaves the machine** until the owner says so: no `git push`, no `gh pr …`, no `gh workflow run`, nothing that triggers GitHub Actions, CI or a deploy. Private-repo Actions minutes are limited, and nothing should ship before the owner has looked.
- Commit **locally** on feature branches; that is fine and expected.
- A "PR" during a run is a **local review summary** in the goal file (what changed, what ran with exit codes, what was traced, open items), not a GitHub PR.
- All verification runs locally (the repo's local CI script, package checks, contract `--check`s).
- When the owner says "ship it", the lead pushes once and opens one PR; nothing before that.
- If a step seems to need the network to GitHub, stop and ask; never work around this rule.

## 0.6 Shortcut: `/dk-agents <profile> <phase> [fresh]`

A **profile** is a markdown file at `@DK_TEAM@/profiles/<profile>.md` (template: `@DK_TEAM@/profiles/example.md`). It names the repo path, the phase-file pattern, the files to read first, the local gates, the team template, the seams that break most often and the repo's non-negotiables.

When `$ARGUMENTS` is a profile and a phase (e.g. `myapp P1`):

1. Read the profile. If it does not exist, list the profiles that do and ask which one.
2. `fresh` restarts a phase cleanly after an aborted run: for the phase branch and any `.worktrees/<profile>-p<N>*` worktrees, save uncommitted work as a patch next to the goal file, remove those worktrees and delete those **local** branches (never remote ones), and move an old goal file aside as `…-aborted-<timestamp>.md`. Leave remote branches and PRs exactly as they are; mention them to the owner once.
3. Check `git status`. If the plan docs the profile names are uncommitted, commit **only** those files locally on the profile's plan branch (never other files, never push).
4. Create or switch to the local phase branch the profile names (default `feat/<profile>-p<N>`).
5. Write the goal file from `references/goal-template.md` using the phase file's tasks and exit criteria (default location: the profile's `goals` folder). Owner-only tasks (providing data, vendor accounts) become checklist items, not agent work.
6. Run §2–§7 with the profile's team template. Ask the owner only before: new dependencies, `terraform apply`, anything in §0.5.

## 1. Roles, agents and models

Roles are **agents** (`@DK_HOME@/agents/*.md`), each pinned to a model in its frontmatter (`model:`), with its own colour in Claude Code and icon in dk-watch. Role ≠ model: the role decides what an agent may do; the model is chosen for that job.

| Role | Agent | Model | Edits? | Job |
|---|---|---|---|---|
| Lead | main session (you) | Opus (owner's session) | Only to integrate, never instead of a teammate | Talks to the owner, writes the goal, runs the loop, commits/PRs after ACCEPT |
| Manager | `dk-manager` | Opus | No | Makes criteria testable, cuts tasks and seams (plan mode); judges each round ACCEPT / REWORK / ESCALATE (judge mode) |
| Implementer | `dk-implementer` (one per task/area, own worktree when sharing a repo) | Sonnet | Code + tests in its task's files | Builds one task, runs gates, reports evidence |
| Tester | `dk-tester` | Sonnet | Tests, fixtures, golden files only | Maps every criterion to a check, adds missing tests, runs suites and evals |
| Reviewer | `dk-reviewer` (or `/dk-review`) | Sonnet | No | dk-coding conventions + gates |
| Auditor | `dk-auditor` | Opus | No | Security, privacy/data residency, licences, cost, production safety |
| Explorer | built-in `Explore` | default | No | Broad read-only searches when the lead needs facts fast |

Override a model for one run with the Agent tool's `model` parameter (e.g. a hard task → implementer on Opus); never change a role's permissions to do it.

## 2. The goal (before anyone is spawned)

1. Write `GOAL.md` from `references/goal-template.md` (goal, acceptance criteria, exit metric, constraints, files to read, out of scope). Put it where the repo keeps plans (the profile's `goals` folder, or `docs/goals/`), not in chat only.
2. Spawn `dk-manager` in **plan mode** with the goal path. Take its acceptance criteria, task table, seams and risks back into `GOAL.md`.
3. Show the owner the criteria and task table in 10 lines or fewer when the work is expensive or ambiguous (repo `CLAUDE.md` rules on asking); otherwise proceed and say what you assumed.

## 3. Spawn the team (Anthropic Agent Teams only)

- Use the **Agent tool with a `name`** and the role's `subagent_type` (`dk-implementer`, `dk-tester`, …) + `run_in_background: true`. Named, addressable, persistent.
- **Never** use the superpowers plugin's `dispatching-parallel-agents` or `subagent-driven-development` skills for this, unless the owner names them explicitly.
- One teammate per task/area. Each spawn prompt contains: the `GOAL.md` path, its task row, the seam contracts it produces/consumes, the definition of done, and the standing rule *"report back to the lead when finished; do NOT commit, push, merge, or deploy."*
- **Every spawn prompt carries the tracing rule** (the tracing rule): *"Before reporting that a path works, trace EVERY hop against the real code — signature, payload, schema, storage, and the guard that reads it back. Read the signature of every function in the chain; a destructure silently drops anything it does not name. Assert the WIRE FORMAT, not the return shape. State plainly what you did not execute."*
- **Every spawn prompt for code work carries the rules line:** *"Before editing any code, invoke `Skill(dk-coding)` (preloaded in your agent). If it is unavailable, Read `@DK_TEAM@/rules/core/*.md`, the `stack/` files listed at the end of `@DK_HOME@/skills/dk-coding/SKILL.md`, and any `stack/` file its 'Read before touching' table names for the files you will edit. In an older repo without `.dk-coding.json` or `scripts/check-versions.mjs`, that repo's `CLAUDE.md` wins (`core/agent-conduct.md`)."*
- Repo profile: when the run uses one, add *"Read `@DK_TEAM@/profiles/<profile>.md` and the files it lists first."*
- Reuse a live teammate via `SendMessage({to: name})` — never respawn cold for a follow-up or a REWORK item.
- Two teammates sharing a repo → each works in its own git worktree (prefix every Bash command with `cd <worktree> &&`, absolute worktree paths for edits).
- Implementers on tasks with no shared files run in parallel; the tester starts when the first implementer reports (it can write tests against contracts before code lands).

## 4. Watch the team

**Browser (dk-watch).** If the `h8-watch` hook is enabled (`@DK_TEAM@/hooks/README.md` → "dk-watch"), start the dashboard before spawning and give the owner the link:

```bash
dk-watch start --no-open   # dashboard at http://127.0.0.1:4777 (no-op if already running)
```

Each agent gets a card with its role icon and colour (lead, manager, implementer, tester, reviewer, auditor), live status (working / idle / done / needs you), current tool and file, and counts; the right side is the activity feed. If the hook is not enabled, say so in one line and offer to enable it; do not stall.

**tmux panes (Agent Teams).** The panes are **not a link the Agent tool hands back** — it returns only internal agent IDs, which you must NEVER surface to the owner (nor the JSONL task-output paths, which contain those IDs). The panes are tmux panes on a **dedicated swarm socket** named `claude-swarm-<pid>` under `/private/tmp/tmux-$(id -u)/`.

⚠️ **Corrected 2026-09-28:** a swarm socket IS created even when `$TMUX` is unset. That session was not in tmux, yet it spawned `claude-swarm-32421` with every teammate in its own pane. I dismissed the socket as stale without checking, and the owner found it themselves — with all three teammates **frozen on a folder-trust prompt**. `$TMUX` is not the test; the socket's creation time and its pane list are.

Right after spawning, run this procedure before saying anything about panes:

1. Probe: `ls -lt /private/tmp/tmux-$(id -u)/claude-swarm-*`, then for each recent one
   `tmux -L <socket-name> list-panes -a -F '#{pane_index} #{pane_title} #{pane_current_path}'`.
   A socket is CURRENT when its session was created after this session started
   (`tmux -L <name> ls` prints the created time) **and** its pane titles match your teammate names.
2. If current, give the owner exactly: `tmux -L <socket-name> attach -t claude-swarm`.
3. **Check every teammate pane for a blocking prompt:**
   `tmux -L <name> capture-pane -p -t claude-swarm:1.<n> | tail -15`. A new repo or folder triggers
   Claude Code's "Is this a project you trust?" prompt in each pane; the teammate does nothing until
   it is answered. Never answer a trust prompt on your own. Tell the owner, and answer it
   (`send-keys Down` then `Enter`) only when the owner explicitly asks. dk-watch shows such a teammate as "Needs approval".
4. Only if no socket was created for this session, say plainly that no panes exist. Relay progress from the completion notifications instead.

## 5. The goal loop (until ACCEPT, max 3 rounds)

Each round:

1. **Build:** implementers report (shape in `dk-implementer`).
2. **Lead check:** read the actual diffs, re-run the repo's verification yourself (its local CI script or the profile's gates), and confirm each claim with one grep before forwarding. A report is a snapshot and may already be stale.
3. **Test:** `dk-tester` maps every criterion to a check and runs it.
4. **Review + audit in parallel:** `dk-reviewer` (conventions, gates) and `dk-auditor` (risk) on the same diff.
5. **Verdict:** `dk-manager` in judge mode with the goal, the diff, and the three reports. It traces at least one full path across every seam. ⭐⭐⭐ **Four production bugs in a row (2026-08-27) were all seams between individually-correct pieces, with every suite green.** No agent's own definition of done covers a seam; the manager and the lead do.
6. **ACCEPT** → go to §6. **REWORK** → `SendMessage` each numbered item to its owner role (live teammate), loop. **ESCALATE** (round 3, or the same item failed twice) → stop and bring the owner a short summary: what is met, what is not, the options.

Teammates never commit/push/merge/deploy. After ACCEPT the lead commits **locally** on the feature branch and writes the local review summary into the goal file (§0.5). Push and PR happen only when the owner says so, never direct to develop.

## 6. Update the brains (mandatory, before closing)

- Memory dir: write/update the relevant memory file + one-line pointer in `MEMORY.md`.
- `docs/STATUS.md` (or the project's equivalent status doc, e.g. the phase table the profile names) with what shipped/changed.
- `LEARNING.md` and any related project markdown when new lessons, gotchas, or contracts emerged. New pitfalls go into the repo's agent guide or the profile.

Do this proactively, without being asked — "the work is done" is not a reason to skip; undocumented lessons are the failure mode this step exists to prevent.

## 7. Let them rest

- `SendMessage` each teammate a wrap-up: work accepted, stand down.
- Stop any still-running teammate task (`TaskStop`) and confirm none remain.
- Remove any session git worktrees.
- Leave dk-watch running only if the owner wants it; it holds no state that matters.

Never leave idle agents running after the review is closed — they rest so they're fresh for the next task.

## Red flags

| Thought | Reality |
|---|---|
| "The report looks thorough, skip the diff" | Reports drift from code. Read the diff. |
| "Their tests passed on their side" | Re-run verification yourself. Always. |
| "The manager said ACCEPT, ship it" | The lead still re-runs the gates; pushing waits for the owner (§0.5). |
| "I'll just push so CI checks it" | No. Run the gates locally. Actions minutes are limited. |
| "One more round will fix it" | Round 3 or a repeat failure → ESCALATE to the owner. |
| "Give the implementer Opus to be safe" | Use Sonnet by default; override per task only with a reason. |
| "I'll update memory next session" | Next session won't remember. Update now. |
| "Leave the agents up in case we need them" | Close them. Respawning is cheap; idle agents aren't. |
