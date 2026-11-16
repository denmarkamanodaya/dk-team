/**
 * Test helpers: build throwaway repos and pipe hook-input JSON into a hook script.
 * DK_HOOKS_DIR points the tests at another copy of the hooks (the mutation checks use this).
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOKS = process.env.DK_HOOKS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Runs hook `name` with `input` on stdin. Returns { code, stdout, stderr, json }. */
export function runHook(name, input, env = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS, name)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, DK_HOOKS_DISABLE: '', ...env },
    timeout: 30000,
  });
  let json = null;
  try {
    json = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  } catch {
    /* plain text */
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

/** Writes `files` ({ relPath: content }) under a fresh git repo and returns its real path. */
export function makeRepo(files, { commitTag } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dk-hooks-fixture-')));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  const git = (...a) => execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { stdio: 'ignore' });
  git('init', '-q', '-b', 'feature');
  if (commitTag) {
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
    git('tag', commitTag);
  }
  return root;
}

/** A dk-coding repo (marker: scripts/check-versions.mjs) with one backend unit. The check-versions stub
 *  fails while a file named FAIL exists in the package root, so tests can drive H3/H4 both ways. */
export const DK_FILES = {
  'package.json': '{"name":"fixture","type":"module"}',
  'scripts/check-versions.mjs':
    "import { existsSync } from 'node:fs';\nif (existsSync('FAIL')) { console.error('[2 importer] stub failure'); process.exit(1); }\nconsole.log('ok');\n",
  'src/usecases/get-thing/v1.ts': '/** @version 1 */\nexport const getThing = () => 1;\n',
  'src/usecases/get-thing/index.ts': "export * from './v1.js';\n",
  'src/adapters/http/v1.ts': '/** @version 1 */\nexport const x = 1;\n',
};

/** A legacy repo: same shape, no marker. */
export const LEGACY_FILES = {
  'package.json': '{"name":"legacy"}',
  'src/usecases/get-thing/v1.ts': 'export const getThing = () => 1;\n',
  'src/usecases/get-thing/index.ts': "export * from './v1.js';\n",
};

export const edit = (file_path, new_string, old_string = 'x', extra = {}) => ({
  session_id: 'test',
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path, old_string, new_string },
  ...extra,
});
export const write = (file_path, content, extra = {}) => ({
  session_id: 'test',
  hook_event_name: 'PreToolUse',
  tool_name: 'Write',
  tool_input: { file_path, content },
  ...extra,
});
