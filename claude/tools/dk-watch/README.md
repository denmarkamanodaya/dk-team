# dk-watch — see your agent team work, in the browser

A local dashboard for dk-agents runs: one card per agent with its role icon and colour (lead, manager, implementer, tester, reviewer, auditor, explorer), live status (working / idle / done / needs you), the tool and file it is on, and counts; plus an activity feed. Dependency-free Node (≥ 20), binds to `127.0.0.1` only.

```
Claude Code hook events ──► hooks/h8-watch.mjs ──POST /events──► server.mjs ──SSE──► http://127.0.0.1:4777
```

## Run

```bash
dk-watch                # start in the background and open the page
dk-watch status | stop | restart | logs | autostart | no-autostart
node @DK_TEAM@/tools/dk-watch/server.mjs --port 4800   # foreground, custom port
```

Open http://127.0.0.1:4777, or just run `dk-watch` (installed to ~/.local/bin by `dk-team install`) to start it in the background and open the page. Events are also appended to `$TMPDIR/dk-watch/events-<date>.jsonl` (`DK_WATCH_DIR` to change).

## Enable the hook (owner approval)

Run `dk-team install --hooks watch` (or `all`), then run `/hooks` in a Claude Code session to confirm. By hand: merge `@DK_TEAM@/hooks/watch-settings-snippet.json` into the `"hooks"` key of `~/.claude/settings.json`. It registers `h8-watch.mjs` on SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, TeammateIdle, Notification and Stop.

The hook never blocks and never fails a tool call: it posts a summary with a 400 ms timeout and always exits 0, so a closed dashboard costs ~50 ms of node start-up per event. Turn it off with `DK_WATCH=0`, or `DK_HOOKS_DISABLE=h8` (or `1`/`all`).

## What is sent (privacy)

Only: event name, session id, agent id and type, tool name, a short detail (file **name** only, Bash description or first command line clipped to 100 chars, Grep pattern, Agent description), success flag, working-folder name, task subject, notification text. Never file contents, prompts, model output or full tool input. Local only.

## How roles are recognised

The card's role comes from the agent type name: contains `manager`, `implementer`, `tester`, `auditor`, `reviewer` → that role; `Explore`/`Plan` → explorer; the main session (no agent id) → lead. Name new agents `dk-<role>` to get the right icon. Models shown on cards follow `skills/dk-agents/SKILL.md` §1.

## Files

| File | What |
|---|---|
| `server.mjs` | HTTP + SSE server, ring buffer of 5000 events, JSONL log |
| `index.html` | the dashboard (no build step, no external requests) |
| `../../hooks/h8-watch.mjs` | the hook that sends summaries |
| `../../hooks/watch-settings-snippet.json` | settings to merge |
| `../../hooks/__tests__/h8-watch.test.mjs` | tests: no content leaks, exits 0 with no server, disable flag |

## Ideas for later

- Per-agent token/cost counters from the transcript file at `SubagentStop`.
- A "round" timeline from the manager's verdicts (ACCEPT / REWORK / ESCALATE).
- macOS notification when a card turns "Needs you".
