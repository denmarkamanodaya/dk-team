import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runHook, makeRepo, DK_FILES, LEGACY_FILES, edit, write } from './helpers.mjs';

const dk = makeRepo({ ...DK_FILES, 'lib/core/clock_user/v1.dart': '/// Version: 1\n', 'pubspec.yaml': 'name: fx\n' });
const legacy = makeRepo(LEGACY_FILES);
const H = 'h1-side-effects.mjs';
const unit = join(dk, 'src/usecases/get-thing/v1.ts');

test('blocks Date.now( in a pure layer and names the Clock port', () => {
  const r = runHook(H, edit(unit, 'export const at = () => Date.now();'));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Date\.now\(/);
  assert.match(r.stderr, /Clock port/);
});

test('blocks each TS token on Write', () => {
  for (const [code, port] of [
    ['const d = new Date();', /Clock/],
    ['const r = Math.random();', /IdGenerator/],
    ['console.log(1);', /Logger/],
    ['const k = process.env.KEY;', /composition root/],
    ['await fetch("https://x");', /HTTP adapter/],
  ]) {
    const r = runHook(H, write(unit, code));
    assert.equal(r.code, 2, code);
    assert.match(r.stderr, port, code);
  }
});

test('blocks the rest of the banned list: ids, perf clock, timers, import.meta.env', () => {
  for (const [code, port] of [
    ['const id = crypto.randomUUID();', /IdGenerator/],
    ['crypto.getRandomValues(buf);', /IdGenerator/],
    ['const t0 = performance.now();', /Clock port/],
    ['setTimeout(() => go(), 10);', /scheduler port/],
    ['const h = globalThis.setInterval(tick, 5);', /scheduler port/],
    ['const k = import.meta.env.VITE_KEY;', /composition root/],
  ]) {
    const r = runHook(H, write(unit, code));
    assert.equal(r.code, 2, code);
    assert.match(r.stderr, port, code);
  }
});

test('blocks Dart DateTime.now( / timestamp( / print( / Random( / Timer / Future.delayed / Platform.environment', () => {
  const f = join(dk, 'lib/core/clock_user/v1.dart');
  for (const code of [
    'final t = DateTime.now();', 'final t = DateTime.timestamp();', "print('x');", 'final r = Random();',
    'Timer(d, cb);', 'Timer.periodic(d, cb);', 'await Future.delayed(d);', "final e = Platform.environment['X'];",
  ]) {
    assert.equal(runHook(H, write(f, code)).code, 2, code);
  }
});

test('passes clean code, comments, strings, new Date(x) and a local fetch binding', () => {
  for (const code of [
    'export const add = (a: number, b: number) => a + b;',
    '// never call Date.now() here\n/* console.log */ export const y = 1;',
    "const msg = 'use console.log in adapters';",
    'const d = new Date(ms).toISOString();',
    'async function all(fetch: (k: string) => Promise<number>) { return fetch("a"); }',
    'const go = (deps: Deps) => deps.scheduler.setTimeout(run, 10);',
    'const q = a / 2; const half = b / 4;',
  ]) {
    const r = runHook(H, write(unit, code));
    assert.equal(r.code, 0, code);
    assert.equal(r.stderr, '', code);
  }
});

test('a fetch binding in a sibling (closed) scope does not exempt a global fetch(', () => {
  const code = 'function f(fetch: F) { return fetch(1); }\nexport async function g() { return fetch("https://evil"); }';
  assert.equal(runHook(H, write(unit, code)).code, 2);
});

test('a quote inside a regex literal does not hide the rest of the line', () => {
  assert.equal(runHook(H, write(unit, `const re = /['"]/; const t = Date.now();`)).code, 2);
  assert.equal(runHook(H, write(unit, 'const q = a / 2; const t = Date.now(); const z = 3 / 4;')).code, 2);
});

test('the redacting logger itself (shared/log/) is exempt', () => {
  assert.equal(runHook(H, write(join(dk, 'src/shared/log/v9.ts'), 'console.log(redact(x));')).code, 0);
  assert.equal(runHook(H, write(join(dk, 'src/shared/time/v1.ts'), 'console.log(1);')).code, 2);
});

test('interpolations are still scanned', () => {
  assert.equal(runHook(H, write(unit, 'const s = `at ${Date.now()}`;')).code, 2);
});

test('exempts tests and non-pure layers', () => {
  assert.equal(runHook(H, write(join(dk, 'src/usecases/get-thing/v1.test.ts'), 'Date.now();')).code, 0);
  assert.equal(runHook(H, write(join(dk, 'src/adapters/http/v1.ts'), 'await fetch("x"); console.log(1);')).code, 0);
});

test('legacy repo: exit 0 and no output', () => {
  const r = runHook(H, write(join(legacy, 'src/usecases/get-thing/v1.ts'), 'Date.now(); console.log(1);'));
  assert.equal(r.code, 0);
  assert.equal(r.stdout + r.stderr, '');
});

test('DK_HOOKS_DISABLE=h1 turns it off', () => {
  assert.equal(runHook(H, write(unit, 'Date.now();'), { DK_HOOKS_DISABLE: 'h1' }).code, 0);
});
