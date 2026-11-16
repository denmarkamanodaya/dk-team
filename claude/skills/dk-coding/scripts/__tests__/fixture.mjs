// Shared fixture helpers for the dk-coding script tests (node:test, run with `node --test`).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Builds a temp tree from { 'rel/path': 'content' } and returns its root. Caller removes it. */
export function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'dk-scripts-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

export const removeTree = (root) => rmSync(root, { recursive: true, force: true });

/** Runs a script in this directory with node; returns { status, out } where out = stdout + stderr. */
export function runScript(script, args, { cwd, env } = {}) {
  const res = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, env: env ?? process.env, encoding: 'utf8' });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}
