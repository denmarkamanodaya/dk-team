// check-versions.mjs — fixture tests. Run: node --test (from scripts/ or scripts/__tests__/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, removeTree, runScript } from './fixture.mjs';

const TS_V1 = '/** @version 1 */\nexport const f = (): number => 1;\n';
const TS_V2 = '/** @version 2 */\nexport const f = (): number => 2;\n';
const DART_V1 = '/// Version: 1\nint f() => 1;\n';

function check(files, args = []) {
  const root = makeTree(files);
  try {
    return runScript('check-versions.mjs', args, { cwd: root });
  } finally {
    removeTree(root);
  }
}

test('clean TS unit with pointer, own test and pointer test passes', () => {
  const r = check({
    'src/core/u/v1.ts': TS_V1,
    'src/core/u/index.ts': "export * from './v1.js';\n",
    'src/core/u/v1.test.ts': "import { f } from './v1.js';\n",
    'src/core/__tests__/pointers.test.ts': "import * as v1 from '../u/v1.js';\n",
  });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK \(1 versioned unit/);
});

test('S4: v10.test.ts is not the own test of v1', () => {
  const r = check({
    'src/core/u/v1.ts': TS_V1,
    'src/core/u/index.ts': "export * from './v1.js';\n",
    'src/core/u/v10.test.ts': "import { f } from './v1.js';\n",
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\[2 importer\] src\/core\/u\/v10\.test\.ts imports src\/core\/u\/v1\.ts/);
});

test('S1: Dart export / import-as / package: specifiers are checked', () => {
  const r = check({
    'pubspec.yaml': 'name: demo\n',
    'lib/core/u/v1.dart': DART_V1,
    'lib/core/u/current.dart': "export 'v1.dart';\n",
    'lib/core/u/v2.dart': "/// Version: 2\nimport 'v1.dart' as v1;\nint f() => v1.f() + 1;\n",
    'lib/features/screen.dart': "import 'package:demo/core/u/v1.dart';\n",
    'lib/features/other.dart': "import '../core/u/v1.dart' as old;\n",
    'lib/features/reexport.dart': "export '../core/u/v1.dart';\n",
    'lib/features/ok.dart': "import 'package:demo/core/u/current.dart';\nimport 'package:other/core/u/v1.dart';\n",
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\[3 cross-version\] lib\/core\/u\/v2\.dart imports lib\/core\/u\/v1\.dart/);
  assert.match(r.out, /\[2 importer\] lib\/features\/screen\.dart imports lib\/core\/u\/v1\.dart/);
  assert.match(r.out, /\[2 importer\] lib\/features\/other\.dart imports lib\/core\/u\/v1\.dart/);
  assert.match(r.out, /\[2 importer\] lib\/features\/reexport\.dart imports lib\/core\/u\/v1\.dart/);
  assert.doesNotMatch(r.out, /ok\.dart|current\.dart imports/);
  assert.match(r.out, /4 problem\(s\)/);
});

test('Dart own test in the mirrored test/ tree passes; a wrong-version or misplaced test fails', () => {
  const r = check({
    'pubspec.yaml': 'name: demo\n',
    'lib/core/u/v1.dart': DART_V1,
    'lib/core/u/current.dart': "export 'v1.dart';\n",
    'test/core/u/v1_test.dart': "import 'package:demo/core/u/v1.dart';\n",
    'test/core/u/v10_test.dart': "import 'package:demo/core/u/v1.dart';\n",
    'test/core/elsewhere/v1_test.dart': "import 'package:demo/core/u/v1.dart';\n",
  });
  assert.equal(r.status, 1, r.out);
  assert.doesNotMatch(r.out, /test\/core\/u\/v1_test\.dart/);
  assert.match(r.out, /\[2 importer\] test\/core\/u\/v10_test\.dart/);
  assert.match(r.out, /\[2 importer\] test\/core\/elsewhere\/v1_test\.dart/);
});

test('A8: pointer tests may be named per layer; other names are not pointer tests', () => {
  const ok = check({
    'pubspec.yaml': 'name: demo\n',
    'src/core/u/v1.ts': TS_V1,
    'src/core/u/index.ts': "export * from './v1.js';\n",
    'src/core/__tests__/pointers.test.ts': "import '../u/v1.js';\n",
    'src/core/__tests__/pointers-core.test.ts': "import '../u/v1.js';\n",
    'lib/core/u/v1.dart': DART_V1,
    'lib/core/u/current.dart': "export 'v1.dart';\n",
    'test/architecture/pointers_test.dart': "import 'package:demo/core/u/v1.dart' as v1;\n",
    'test/architecture/pointers_core_test.dart': "import 'package:demo/core/u/v1.dart'\n    as core_u_v1;\n",
  });
  assert.equal(ok.status, 0, ok.out);

  const bad = check({
    'pubspec.yaml': 'name: demo\n',
    'src/core/u/v1.ts': TS_V1,
    'src/core/__tests__/other.test.ts': "import '../u/v1.js';\n",
    'src/core/__tests__/nested/pointers.test.ts': "import '../../u/v1.js';\n",
    'lib/core/u/v1.dart': DART_V1,
    'test/architecture/pointer_core_test.dart': "import 'package:demo/core/u/v1.dart';\n",
    'test/pointers_test.dart': "import 'package:demo/core/u/v1.dart';\n",
  });
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /4 problem\(s\)/);
});

test('S2: --config pointing at a missing file exits 2 instead of using defaults', () => {
  const missing = check({ 'src/core/u/v1.ts': TS_V1 }, ['--config', 'check-versions.json']);
  assert.equal(missing.status, 2, missing.out);
  assert.match(missing.out, /config file not found: check-versions\.json/);

  const noValue = check({ 'src/core/u/v1.ts': TS_V1 }, ['--config']);
  assert.equal(noValue.status, 2, noValue.out);

  const badJson = check({ 'cv.json': '{ nope', 'src/core/u/v1.ts': TS_V1 }, ['--config', 'cv.json']);
  assert.equal(badJson.status, 2, badJson.out);

  const used = check({ 'cv.json': '{ "roots": ["src/x"] }', 'src/x/u/v1.ts': TS_V1, 'src/x/u/stray.ts': '' }, ['--config', 'cv.json']);
  assert.equal(used.status, 1, used.out);
  assert.match(used.out, /\[1 layout\] src\/x\/u\/stray\.ts/);
});

test('A10: CHANGES.md is not allowed in a unit; README.md is', () => {
  const r = check({ 'src/core/u/v1.ts': TS_V1, 'src/core/u/README.md': '', 'src/core/u/CHANGES.md': '' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\[1 layout\] src\/core\/u\/CHANGES\.md/);
  assert.doesNotMatch(r.out, /\[1 layout\] src\/core\/u\/README/);
});

test('A9: src/ports is not a default root', () => {
  const r = check({ 'src/ports/store/v1.ts': TS_V1, 'src/ports/store/notes.txt': '' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK \(0 versioned unit/);
});

test('S1: tsconfig path aliases are resolved (JSONC with comments and globs)', () => {
  const tsconfig = '{\n  // comment\n  "compilerOptions": { "baseUrl": ".", "paths": { "@core/*": ["src/core/*"], }, },\n  "include": ["src/**/*.ts"] /* glob kept */\n}\n';
  const r = check({
    'tsconfig.json': tsconfig,
    'src/core/u/v1.ts': TS_V1,
    'src/core/u/v2.ts': TS_V2,
    'src/core/u/index.ts': "export * from './v2.js';\n",
    'src/hooks/use-x.ts': "import { f } from '@core/u/v1.js';\nimport { f as g } from '@core/u';\n",
  });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\[2 importer\] src\/hooks\/use-x\.ts imports src\/core\/u\/v1\.ts/);
  assert.match(r.out, /1 problem\(s\)/);
});

test('comment that quotes an import is not an import', () => {
  const r = check({
    'src/core/u/v1.ts': TS_V1,
    'src/core/u/index.ts': "// @rollback point back at:\n// export * from './v1.js';\nexport * from './v1.js';\n",
    'src/hooks/h.ts': "/* import { f } from '../core/u/v1.js'; */\nexport {};\n",
  });
  assert.equal(r.status, 0, r.out);
});
