import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runHook, makeRepo, DK_FILES, edit, write } from './helpers.mjs';

// ---------------------------------------------------------------- H6 ---
const frozen = makeRepo({ ...DK_FILES, '.dk-coding.json': '{"frozenRef":"prod-1"}' }, { commitTag: 'prod-1' });
const noRef = makeRepo({ ...DK_FILES, '.dk-coding.json': '{}' }, { commitTag: 'prod-1' });
const shipped = join(frozen, 'src/usecases/get-thing/v1.ts');

test('H6: blocks a behaviour edit to a v<N> present at frozenRef', () => {
  const r = runHook('h6-frozen.mjs', edit(shipped, 'export const getThing = () => 2;', 'export const getThing = () => 1;'));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /frozen[\s\S]*v<N\+1>[\s\S]*Patched:/);
});

test('H6: allows the edit when it adds a Patched: line', () => {
  const r = runHook(
    'h6-frozen.mjs',
    edit(shipped, '/** @version 1\n * Patched: 2026-10-04 — off-by-one. */', '/** @version 1 */'),
  );
  assert.equal(r.code, 0);
});

test('H6: a new v2 (not at the ref), a non-version file and a repo without frozenRef all pass', () => {
  assert.equal(runHook('h6-frozen.mjs', write(join(frozen, 'src/usecases/get-thing/v2.ts'), 'x')).code, 0);
  assert.equal(runHook('h6-frozen.mjs', edit(join(frozen, 'src/usecases/get-thing/index.ts'), "export * from './v2.js';")).code, 0);
  assert.equal(runHook('h6-frozen.mjs', edit(join(noRef, 'src/usecases/get-thing/v1.ts'), 'y', 'export')).code, 0);
});

test('H6: an unresolvable frozenRef is inactive', () => {
  const bad = makeRepo({ ...DK_FILES, '.dk-coding.json': '{"frozenRef":"prod-999"}' }, { commitTag: 'prod-1' });
  assert.equal(runHook('h6-frozen.mjs', edit(join(bad, 'src/usecases/get-thing/v1.ts'), 'y', 'export')).code, 0);
});

// ---------------------------------------------------------------- H7 ---
const rulesDir = join(realpathSync(mkdtempSync(join(tmpdir(), 'dk-rules-'))), '.claude', 'rules', 'stack');
mkdirSync(rulesDir, { recursive: true });
const rule = (name, text) => {
  const p = join(rulesDir, name);
  writeFileSync(p, text);
  return runHook('h7-rules-frontmatter.mjs', { session_id: 't', hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: p } });
};

test('H7: valid block list, inline list and no frontmatter are silent', () => {
  assert.equal(rule('a.md', '---\npaths:\n  - "sample-app/**/*.ts"\n  - "sample-app/**/*.{dart,tf}"\n---\n# A\n').stdout, '');
  assert.equal(rule('b.md', '---\npaths: ["x/**/*.ts", "y/*.md"]\n---\n# B\n').stdout, '');
  assert.equal(rule('c.md', '# C\nno frontmatter\n').stdout, '');
  assert.equal(rule('d.md', '---\ndescription: >\n  folded text\npaths:\n  - "x/**"\n---\n').stdout, '');
});

test('H7: warns on unclosed frontmatter, unquoted leading *, unbalanced braces, absolute globs, bad shape', () => {
  const ctx = (r) => r.json?.hookSpecificOutput?.additionalContext ?? '';
  assert.match(ctx(rule('e.md', '---\npaths:\n  - "x/**"\n# E\n')), /never closes/);
  assert.match(ctx(rule('f.md', '---\npaths:\n  - **/*.ts\n---\n')), /must be quoted/);
  assert.match(ctx(rule('g.md', '---\npaths:\n  - "x/**/*.{ts,dart"\n---\n')), /unbalanced \{\}/);
  assert.match(ctx(rule('h.md', '---\npaths:\n  - "/Users/x/**"\n---\n')), /relative to the project root/);
  assert.match(ctx(rule('i.md', '---\npaths: x/**/*.ts\n---\n')), /must be a list/);
  assert.match(ctx(rule('j.md', '---\npaths:\n---\n')), /lists no globs/);
});

test('H7: ignores files outside .claude/rules', () => {
  const r = runHook('h7-rules-frontmatter.mjs', { tool_name: 'Write', tool_input: { file_path: join(frozen, 'README.md') } });
  assert.equal(r.stdout, '');
});
