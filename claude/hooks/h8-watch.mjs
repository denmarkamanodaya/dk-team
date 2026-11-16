#!/usr/bin/env node
// h8-watch — forwards a short summary of each Claude Code hook event to the dk-watch dashboard
// (tools/dk-watch/server.mjs). Never blocks, never fails a tool call: any error, a slow or absent
// server, or DK_HOOKS_DISABLE containing h8 → exit 0 silently.
// Sends only a summary (event, session, agent id/type, tool name, a file name, a short command or
// description). Never sends file contents, prompts, model output or full tool input.
// Env: DK_WATCH_URL (default http://127.0.0.1:4777/events), DK_WATCH=0 to turn off,
//      DK_HOOKS_DISABLE=1|all|…,h8 (shared with the other dk hooks).
import { basename } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const disabled = () => {
  if (process.env.DK_WATCH === '0') return true;
  const d = (process.env.DK_HOOKS_DISABLE ?? '').toLowerCase();
  return d === '1' || d === 'all' || d.split(',').map((s) => s.trim()).includes('h8');
};

const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n - 1) + '…' : s) : undefined);

/** The safe summary of one hook input. Exported for tests. */
export function summarise(input) {
  const ti = input.tool_input ?? {};
  const file = ti.file_path ?? ti.path ?? ti.notebook_path;
  let detail;
  if (input.tool_name === 'Bash') detail = clip(ti.description, 100) ?? clip(String(ti.command ?? '').split('\n')[0], 100);
  else if (input.tool_name === 'Agent' || input.tool_name === 'Task') detail = clip(ti.description, 100) ?? clip(ti.name, 60);
  else if (input.tool_name === 'SendMessage') detail = ti.to ? `to ${clip(String(ti.to), 40)}` : undefined;
  else if (input.tool_name === 'Grep' || input.tool_name === 'Glob') detail = clip(ti.pattern, 80);
  else if (file) detail = basename(String(file));
  const ok = input.tool_response && typeof input.tool_response === 'object' && 'is_error' in input.tool_response
    ? !input.tool_response.is_error : undefined;
  return {
    event: String(input.hook_event_name ?? 'Unknown'),
    session: clip(String(input.session_id ?? ''), 64),
    agentId: input.agent_id ? clip(String(input.agent_id), 64) : undefined,
    agentType: input.agent_type ? clip(String(input.agent_type), 64)
      : (input.hook_event_name === 'SubagentStart' || input.hook_event_name === 'SubagentStop') ? clip(String(input.subagent_type ?? input.agent_name ?? ''), 64) || undefined : undefined,
    tool: input.tool_name ? clip(String(input.tool_name), 64) : undefined,
    detail,
    ok,
    cwd: input.cwd ? basename(String(input.cwd)) : undefined,
    task: input.task_subject ? clip(String(input.task_subject), 100) : undefined,
    message: input.hook_event_name === 'Notification' ? clip(input.message, 120) : undefined,
    kind: input.notification_type ? clip(String(input.notification_type), 40) : undefined,
    // Agent Teams teammates run as their own Claude sessions inside the claude-swarm tmux socket;
    // mark them so the dashboard never shows them as another lead.
    teammate: /claude-swarm/.test(process.env.TMUX ?? '') || /[\\/]\.(worktrees|claude[\\/]worktrees)[\\/]/.test(String(input.cwd ?? '')) || undefined,
    worktree: (String(input.cwd ?? '').match(/[\\/]\.(?:worktrees|claude[\\/]worktrees)[\\/]([^\\/]+)/) ?? [])[1],
  };
}

async function main() {
  if (disabled()) return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  const url = process.env.DK_WATCH_URL ?? 'http://127.0.0.1:4777/events';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 400);
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(summarise(input)), signal: ctrl.signal });
  } catch { /* dashboard not running: fine */ } finally { clearTimeout(timer); }
}

/** True when run as a script (not imported by a test). Compares real paths: symlinks and %-encoding differ. */
const isMain = () => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};

if (isMain()) {
  main().catch(() => {}).finally(() => process.exit(0));
}
