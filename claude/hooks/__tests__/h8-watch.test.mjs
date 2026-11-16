// h8-watch: never blocks, never leaks content, forwards a summary when a dashboard is listening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runHook, HOOKS } from './helpers.mjs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

/** Async run (the in-process test server must keep serving while the hook runs). */
const runAsync = (input, env) => new Promise((resolve) => {
  const p = spawn(process.execPath, [join(HOOKS, 'h8-watch.mjs')], { env: { ...process.env, DK_HOOKS_DISABLE: '', ...env } });
  p.on('close', (code) => resolve(code));
  p.stdin.end(JSON.stringify(input));
});

const { summarise } = await import(join(HOOKS, 'h8-watch.mjs'));

test('summary keeps names, drops content', () => {
  const s = summarise({ hook_event_name: 'PreToolUse', session_id: 's', agent_id: 'a', agent_type: 'dk-implementer',
    tool_name: 'Write', tool_input: { file_path: '/repo/src/secret.ts', content: 'API_KEY=abc' } });
  assert.equal(s.detail, 'secret.ts');
  assert.equal(s.agentType, 'dk-implementer');
  assert.ok(!JSON.stringify(s).includes('API_KEY'));
});

test('bash detail is the description or the first line, clipped', () => {
  const s = summarise({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hi\nexport TOKEN=x' } });
  assert.equal(s.detail, 'echo hi');
});

test('exits 0 quickly with no dashboard', () => {
  const t = Date.now();
  const r = runHook('h8-watch.mjs', { hook_event_name: 'Stop', session_id: 's' }, { DK_WATCH_URL: 'http://127.0.0.1:9/events' });
  assert.equal(r.code, 0);
  assert.ok(Date.now() - t < 3000);
});

test('DK_HOOKS_DISABLE=h8 sends nothing', async () => {
  let hits = 0;
  const srv = createServer((req, res) => { hits++; res.writeHead(204).end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/events`;
  assert.equal(await runAsync({ hook_event_name: 'Stop' }, { DK_WATCH_URL: url, DK_HOOKS_DISABLE: 'h8' }), 0);
  assert.equal(hits, 0);
  assert.equal(await runAsync({ hook_event_name: 'Stop' }, { DK_WATCH_URL: url }), 0);
  srv.close();
  assert.equal(hits, 1);
});
