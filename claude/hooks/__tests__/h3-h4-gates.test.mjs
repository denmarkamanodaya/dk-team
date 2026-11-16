import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { runHook, makeRepo, DK_FILES, LEGACY_FILES, HOOKS } from './helpers.mjs';

const dk = makeRepo(DK_FILES);
const legacy = makeRepo(LEGACY_FILES);
const stateDir = mkdtempSync(join(tmpdir(), 'dk-hooks-state-'));
const env = { DK_HOOKS_STATE_DIR: stateDir, DK_HOOKS_DRY_RUN: '1' };
const unit = join(dk, 'src/usecases/get-thing/v1.ts');
const post = (file_path, session_id = 's1', extra = {}) => ({
  session_id,
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path, old_string: 'a', new_string: 'b' },
  tool_response: {},
  ...extra,
});
const stop = (session_id, extra = {}) => ({ session_id, hook_event_name: 'Stop', stop_hook_active: false, ...extra });
const edited = (s) => {
  const d = join(stateDir, s, 'edited');
  return existsSync(d) ? readdirSync(d).map((n) => JSON.parse(readFileSync(join(d, n), 'utf8')).file) : [];
};
const fail = (on) => (on ? writeFileSync(join(dk, 'FAIL'), '') : rmSync(join(dk, 'FAIL'), { force: true }));

test('H3: records the file, stays silent when gates pass', () => {
  fail(false);
  const r = runHook('h3-post-edit.mjs', post(unit), env);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(edited('s1'), [unit]);
});

test('H3: check-versions failure comes back as additionalContext, never a block', () => {
  fail(true);
  const r = runHook('h3-post-edit.mjs', post(unit, 's2'), env);
  fail(false);
  assert.equal(r.code, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(r.json.hookSpecificOutput.additionalContext, /check-versions failed[\s\S]*stub failure/);
});

test('H3: legacy repo is a no-op (nothing recorded, no output)', () => {
  const r = runHook('h3-post-edit.mjs', post(join(legacy, 'src/usecases/get-thing/v1.ts'), 's3'), env);
  assert.equal(r.code, 0);
  assert.equal(r.stdout + r.stderr, '');
  assert.equal(existsSync(join(stateDir, 's3')), false);
});

test('H4: nothing edited => exit 0, no output', () => {
  const r = runHook('h4-stop-gate.mjs', stop('empty'), env);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('H4: passing gates clear the touched list', () => {
  fail(false);
  runHook('h3-post-edit.mjs', post(unit, 's4'), env);
  const r = runHook('h4-stop-gate.mjs', stop('s4'), env);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(edited('s4'), []);
});

test('H4: failing gates block twice with the same reason, then let the agent stop', () => {
  fail(false);
  runHook('h3-post-edit.mjs', post(unit, 's5'), env);
  fail(true);
  const a = runHook('h4-stop-gate.mjs', stop('s5'), env);
  const b = runHook('h4-stop-gate.mjs', stop('s5'), env);
  const c = runHook('h4-stop-gate.mjs', stop('s5'), env);
  const d = runHook('h4-stop-gate.mjs', stop('s5'), env);
  fail(false);
  assert.equal(a.json.decision, 'block');
  assert.match(a.json.reason, /check-versions failed[\s\S]*stub failure/);
  assert.equal(b.json.decision, 'block');
  assert.equal(c.json.decision, undefined);
  assert.match(c.json.systemMessage, /failed 2 times/);
  assert.equal(d.stdout, '', 'after giving up the touched list is cleared');
});

test('H4: stop_hook_active never blocks; a still-red gate is reported to the user and re-checked next stop', () => {
  fail(false);
  runHook('h3-post-edit.mjs', post(unit, 's6'), env);
  fail(true);
  const retry = runHook('h4-stop-gate.mjs', stop('s6', { stop_hook_active: true }), env);
  const next = runHook('h4-stop-gate.mjs', stop('s6'), env);
  fail(false);
  assert.equal(retry.code, 0);
  assert.equal(retry.json.decision, undefined);
  assert.match(retry.json.systemMessage, /still fail[\s\S]*check-versions failed/);
  assert.equal(next.json.decision, 'block');
});

test('H4: stop_hook_active with passing gates clears the list silently', () => {
  fail(false);
  runHook('h3-post-edit.mjs', post(unit, 's6b'), env);
  const r = runHook('h4-stop-gate.mjs', stop('s6b', { stop_hook_active: true }), env);
  assert.equal(r.stdout, '');
  assert.deepEqual(edited('s6b'), []);
});

test('H4: non-object stdin (null) exits 0 without a crash', () => {
  const r = runHook('h4-stop-gate.mjs', null, env);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
});

test('H3: parallel runs in one session never lose each other\'s entries', async () => {
  fail(false);
  const files = Array.from({ length: 8 }, (_, k) => join(dk, `src/adapters/http/p${k}.ts`));
  for (const f of files) writeFileSync(f, 'export const p = 1;\n');
  const runOne = (f, k) =>
    new Promise((done) => {
      const c = spawn(process.execPath, [join(HOOKS, 'h3-post-edit.mjs')], { env: { ...process.env, DK_HOOKS_DISABLE: '', ...env } });
      c.on('close', done);
      c.stdin.end(JSON.stringify(post(f, 'par', { agent_id: `a${k}` })));
    });
  await Promise.all(files.map(runOne));
  for (const f of files) rmSync(f);
  const { editedFiles } = await import(join(HOOKS, 'lib/dk-repo.mjs'));
  process.env.DK_HOOKS_STATE_DIR = stateDir; // editedFiles reads it at call time
  assert.deepEqual(editedFiles('par').map((e) => e.file).sort(), [...files].sort());
});

test('H4: SubagentStop checks only that subagent\'s files', () => {
  fail(false);
  runHook('h3-post-edit.mjs', post(unit, 's7', { agent_id: 'A' }), env);
  fail(true);
  const other = runHook('h4-stop-gate.mjs', { session_id: 's7', hook_event_name: 'SubagentStop', agent_id: 'B' }, env);
  const mine = runHook('h4-stop-gate.mjs', { session_id: 's7', hook_event_name: 'SubagentStop', agent_id: 'A' }, env);
  fail(false);
  assert.equal(other.stdout, '');
  assert.equal(mine.json.decision, 'block');
});
