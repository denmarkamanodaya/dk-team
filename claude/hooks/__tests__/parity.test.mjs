// Drift gate: lib/dk-repo.mjs and skills/dk-coding/scripts/check-versions.mjs must agree on the layout facts.
// check-versions is copied into repos and stays single-file, so it cannot import them; this test is the link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOOKS } from './helpers.mjs';

const lib = await import(join(HOOKS, 'lib/dk-repo.mjs'));
const src = readFileSync(join(lib.SKILL_SCRIPTS, 'check-versions.mjs'), 'utf8');
const literal = (name) => new RegExp(`^const ${name} = (/.+/[a-z]*);$`, 'm').exec(src)?.[1];
const list = (re) => JSON.parse(re.exec(src)[1].replace(/'/g, '"'));

test('regexes match check-versions', () => {
  assert.equal(String(lib.VERSION_FILE), literal('VERSION_FILE'));
  assert.equal(String(lib.TEST_FILE), literal('TEST_FILE'));
  assert.equal(String(lib.POINTER_TEST), literal('POINTER_TEST'));
});

test('pointer names and default allowed importers match check-versions', () => {
  assert.deepEqual([...lib.POINTERS], list(/^const POINTER = new Set\((\[.*\])\);$/m));
  assert.deepEqual(lib.DEFAULT_ALLOWED_IMPORTERS, list(/^\s*allowedImporters: (\[.*\]),$/m));
});
