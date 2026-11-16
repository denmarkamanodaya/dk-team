import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runHook, makeRepo, DK_FILES, write, HOOKS } from './helpers.mjs';

const { dkRepo } = await import(join(HOOKS, 'lib/dk-repo.mjs'));
const put = (root, p, c) => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), c);
};

test('an agent worktree at <repo>/.claude/worktrees/<name>/ is checked like the main checkout', () => {
  const repo = makeRepo(DK_FILES, { commitTag: 'base' });
  const wt = join(repo, '.claude/worktrees/agent-x');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'agent-x', wt], { stdio: 'ignore' });
  const unit = join(wt, 'src/usecases/get-thing/v1.ts');
  assert.equal(dkRepo(unit)?.git, wt);
  assert.equal(runHook('h1-side-effects.mjs', write(unit, 'const t = Date.now();')).code, 2);
});

test('other .claude/ paths (the skill folder, rules) are never dk files', () => {
  const repo = makeRepo(DK_FILES);
  put(repo, '.claude/skills/s/scripts/check-versions.mjs', '');
  put(repo, '.claude/skills/s/src/usecases/a/v1.ts', '');
  assert.equal(dkRepo(join(repo, '.claude/skills/s/src/usecases/a/v1.ts')), null);
  assert.equal(dkRepo(join(repo, '.claude/worktrees/x')), null, 'the worktree folder itself is not a file inside it');
});

// sample app on 2026-10-04: only backend/ carries a marker (backend/scripts/check-versions.mjs). One marker
// anywhere in the git repo marks the whole repo (rules/core/agent-conduct.md), so the unmarked Flutter
// app/ is checked too, as its own package root. A repo with no marker at all stays dormant.
test('sample app shape: a marker in backend/ makes the sibling app/ package a dk package too', () => {
  const repo = makeRepo({
    'backend/package.json': '{"name":"backend"}',
    'backend/scripts/check-versions.mjs': '',
    'backend/src/usecases/get-me/v1.ts': '/** @version 1 */\n',
    'app/pubspec.yaml': 'name: sampleapp\n',
    'app/lib/core/money/format/v1.dart': '/// Version: 1\n',
  });
  const backend = join(repo, 'backend/src/usecases/get-me/v1.ts');
  const app = join(repo, 'app/lib/core/money/format/v1.dart');
  assert.equal(dkRepo(backend)?.pkg, join(repo, 'backend'));
  assert.equal(dkRepo(app)?.pkg, join(repo, 'app'));
});

test('a repo with no marker anywhere is never a dk repo', () => {
  const repo = makeRepo({
    'web/package.json': '{"name":"web"}',
    'web/src/core/a/v1.ts': '/** @version 1 */\n',
  });
  assert.equal(dkRepo(join(repo, 'web/src/core/a/v1.ts')), null);
});
