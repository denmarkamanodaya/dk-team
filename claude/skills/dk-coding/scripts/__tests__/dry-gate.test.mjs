// dry-gate.mjs — fixture tests. Run: node --test (from scripts/ or scripts/__tests__/).
// The positive cases need a real jscpd: set DRY_GATE_JSCPD to its path; they are skipped otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isVersionPair, versionKey } from '../dry-gate.mjs';
import { makeTree, removeTree, runScript } from './fixture.mjs';

const JSCPD = process.env.DRY_GATE_JSCPD ?? '/nonexistent/jscpd';
const skip = existsSync(JSCPD) ? false : `jscpd not available at ${JSCPD}`;
const env = { ...process.env, DRY_GATE_JSCPD: JSCPD };

// 8 lines / ~68 tokens: above the 35-token / 3-line defaults.
const BODY_A = `export function computeTotal(items: { price: number; qty: number }[]): number {
  let total = 0;
  for (const item of items) {
    if (item.qty <= 0) continue;
    total += item.price * item.qty;
  }
  return Math.round(total * 100) / 100;
}
`;
const BODY_B = `export function windowFor(days: number[], start: number, length: number): number[] {
  const out: number[] = [];
  for (let i = start; i < start + length && i < days.length; i++) {
    const day = days[i] ?? 0;
    if (day < 0) throw new Error('negative day ' + String(i));
    out.push(day * 2 + 1);
  }
  return out;
}
`;
const v = (n, body) => `/** @version ${n} */\n${body}`;

function gate(files, args = [], runEnv = env) {
  const root = makeTree(files);
  try {
    return runScript('dry-gate.mjs', ['--root', root, ...args.map((a) => (a.startsWith('@') ? join(root, a.slice(1)) : a))], { cwd: root, env: runEnv });
  } finally {
    removeTree(root);
  }
}

test('same-unit v1 <-> v2 clone is exempt', { skip }, () => {
  const r = gate({ 'src/core/total/v1.ts': v(1, BODY_A), 'src/core/total/v2.ts': v(2, BODY_A) });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK \(0 clones; 1 same-unit version pair\(s\) exempt\)/);
});

test('cross-unit clone fails with file:lines <-> file:lines', { skip }, () => {
  const r = gate({ 'src/core/total/v1.ts': v(1, BODY_A), 'src/core/other/v1.ts': v(1, BODY_A) });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /src\/core\/(total|other)\/v1\.ts:2-9 <-> src\/core\/(total|other)\/v1\.ts:2-9/);
});

test('--files reports only clones touching the listed files (including copies of them)', { skip }, () => {
  const files = {
    'src/core/total/v1.ts': v(1, BODY_A),
    'src/core/total/v2.ts': v(2, BODY_A),
    'src/services/sum.ts': BODY_A,
    'src/core/window/v1.ts': v(1, BODY_B),
    'src/services/window.ts': BODY_B,
    'src/services/unrelated.ts': 'export const x = 1;\n',
  };
  const all = gate(files);
  assert.equal(all.status, 1, all.out);
  assert.match(all.out, /2 clone\(s\)/);

  const onlyA = gate(files, ['--files', '@src/services/sum.ts', '--json']);
  assert.equal(onlyA.status, 1, onlyA.out);
  const json = JSON.parse(onlyA.out);
  assert.equal(json.clones.length, 1);
  assert.match(json.clones[0].a + json.clones[0].b, /services\/sum\.ts/);
  assert.equal(json.exempt.length, 1);

  // jscpd lists v1 <-> sum (not v2 <-> sum); editing v2 must still surface it.
  const viaCopy = gate(files, ['--files', '@src/core/total/v2.ts']);
  assert.equal(viaCopy.status, 1, viaCopy.out);
  assert.match(viaCopy.out, /1 clone\(s\)/);
  assert.match(viaCopy.out, /services\/sum\.ts/);

  const none = gate(files, ['--files', '@src/services/unrelated.ts']);
  assert.equal(none.status, 0, none.out);
});

test('tests are ignored by default', { skip }, () => {
  const r = gate({ 'src/a/x.test.ts': BODY_A, 'src/b/__tests__/y.ts': BODY_A, 'test/z_test.dart': BODY_A, 'src/c/w.ts': BODY_A });
  assert.equal(r.status, 0, r.out);
});

test('<pkgDir>/.jscpd.json is honoured when present', { skip }, () => {
  const r = gate({ '.jscpd.json': '{ "path": ["src"], "minTokens": 500, "threshold": 0 }', 'src/a/x.ts': BODY_A, 'src/b/y.ts': BODY_A });
  assert.equal(r.status, 0, r.out);
});

test('missing jscpd exits 0 with a skip message', () => {
  const files = { 'src/a/x.ts': BODY_A, 'src/b/y.ts': BODY_A };
  const pinnedMissing = gate(files, [], { ...process.env, DRY_GATE_JSCPD: '/nonexistent/jscpd' });
  assert.equal(pinnedMissing.status, 0, pinnedMissing.out);
  assert.match(pinnedMissing.out, /dry-gate: jscpd not found — skipped/);

  const { DRY_GATE_JSCPD: _drop, ...rest } = process.env;
  const noPath = gate(files, [], { ...rest, PATH: dirname(process.execPath) });
  assert.equal(noPath.status, 0, noPath.out);
  assert.match(noPath.out, /jscpd not found — skipped/);
});

test('bad arguments exit 2', () => {
  assert.equal(runScript('dry-gate.mjs', ['--root', '/nonexistent/dir'], { env }).status, 2);
  assert.equal(runScript('dry-gate.mjs', ['--bogus'], { env }).status, 2);
});

test('version keys: same unit pairs, different units and same version do not', () => {
  assert.equal(isVersionPair('/r/src/core/u/v1.ts', '/r/src/core/u/v2.ts'), true);
  assert.equal(isVersionPair('/r/src/core/u/v1.ts', '/r/src/core/u/v10.ts'), true);
  assert.equal(isVersionPair('/r/modules/fn/v1/main.tf', '/r/modules/fn/v2/main.tf'), true);
  assert.equal(isVersionPair('/r/src/core/u/v1.ts', '/r/src/core/w/v2.ts'), false);
  assert.equal(isVersionPair('/r/src/core/u/v1.ts', '/r/src/core/u/v1.ts'), false);
  assert.equal(isVersionPair('/r/src/core/u/v1.ts', '/r/src/core/u/v2.dart'), false);
  assert.equal(isVersionPair('/r/modules/fn/v1/main.tf', '/r/modules/fn/v2/vars.tf'), false);
  assert.equal(versionKey('/r/src/core/u/helper.ts'), null);
  assert.deepEqual(versionKey('/r/a/v1/x/v3.ts'), { key: '/r/a/v1/x/v*.ts', n: 3 });
});
