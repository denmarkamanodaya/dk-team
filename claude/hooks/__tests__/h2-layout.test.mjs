import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runHook, makeRepo, DK_FILES, LEGACY_FILES, write, edit } from './helpers.mjs';

const dk = makeRepo({
  ...DK_FILES,
  'check-versions.json': '{"allowedImporters":["src/composition"]}',
  'app/pubspec.yaml': 'name: fx\n',
  'app/lib/core/dates/local_date/v1.dart': '/// Version: 1\n',
  'app/lib/core/dates/local_date/current.dart': "export 'v1.dart';\n",
});
const legacy = makeRepo(LEGACY_FILES);
const H = 'h2-layout.mjs';
const u = (p) => join(dk, p);

test('a. blocks a new utils/helpers/misc/common file everywhere outside tests', () => {
  for (const p of ['src/usecases/utils.ts', 'src/domain/date-helpers.ts', 'src/core/util/helpers.ts', 'src/shared/misc.ts', 'src/shared/common.ts', 'app/lib/core/common.dart'])
    assert.equal(runHook(H, write(u(p), 'export const a = 1;')).code, 2, p);
  for (const p of ['src/core/util/format-money.ts', 'src/shared/clamp.ts', 'tests/helpers.ts', 'src/usecases/__tests__/test-helpers.ts', 'app/test/test_helpers.dart'])
    assert.equal(runHook(H, write(u(p), 'export const a = 1;')).code, 0, p);
});

test('a. blocks stale copies; _new/-copy only when the original sits beside it', () => {
  for (const p of ['src/shared/v1_old.ts', 'src/domain/rules-backup.ts', 'src/domain/x.ts.bak', 'src/domain/rules copy.ts', 'src/usecases/get-thing/v1_new.ts', 'src/adapters/http/v1-copy.ts'])
    assert.equal(runHook(H, write(u(p), 'export const a = 1;')).code, 2, p);
  for (const p of ['app/lib/features/news/whats_new.dart', 'app/lib/features/x/add_new.dart', 'app/lib/features/x/empty_state_copy.dart', 'src/design/hero-copy.ts'])
    assert.equal(runHook(H, write(u(p), 'export const a = 1;')).code, 0, p);
});

test('b. blocks v2 importing v1 of its own unit', () => {
  const r = runHook(H, write(u('src/usecases/get-thing/v2.ts'), "import { getThing } from './v1.js';"));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /never imports another version/);
});

test('c. blocks a direct v<N> import from a caller; allows pointer, own test, composition, pointer test', () => {
  assert.equal(runHook(H, write(u('src/handlers/x/v1.ts'), "import { getThing } from '../../usecases/get-thing/v1.js';")).code, 2);
  assert.equal(runHook(H, write(u('src/handlers/x/v1.ts'), "import { getThing } from '../../usecases/get-thing/index.js';")).code, 0);
  assert.equal(runHook(H, write(u('src/usecases/get-thing/v1.test.ts'), "import { getThing } from './v1.js';")).code, 0);
  assert.equal(runHook(H, write(u('src/composition/app.ts'), "import { getThing } from '../usecases/get-thing/v1.js';")).code, 0);
  assert.equal(runHook(H, write(u('src/usecases/__tests__/pointers.test.ts'), "import * as v1 from '../get-thing/v1.js';")).code, 0);
});

test('c. pointer-test names follow check-versions exactly', () => {
  const imp = (depth) => `import * as v1 from '${'../'.repeat(depth)}src/usecases/get-thing/v1.js';`;
  assert.equal(runHook(H, write(u('src/__tests__/pointers-usecases.test.ts'), "import * as v1 from '../usecases/get-thing/v1.js';")).code, 0);
  assert.equal(runHook(H, write(u('test/architecture/pointers.test.ts'), imp(2))).code, 0);
  assert.equal(runHook(H, write(u('src/__tests__/pointers.usecases.test.ts'), "import * as v1 from '../usecases/get-thing/v1.js';")).code, 2);
});

test('c. a TS test in a mirrored tree is not the own test (Dart only)', () => {
  assert.equal(runHook(H, write(u('tests/usecases/get-thing/v1.test.ts'), "import { getThing } from '../../../src/usecases/get-thing/v1.js';")).code, 2);
});

test('c. import text inside a string literal is not an import', () => {
  assert.equal(runHook(H, write(u('src/handlers/x/v1.ts'), `export const doc = "import { g } from '../../usecases/get-thing/v1.js'";`)).code, 0);
});

test('c. Dart: package: import of v1 is allowed from the mirrored test, blocked from lib', () => {
  assert.equal(runHook(H, write(u('app/test/core/dates/local_date/v1_test.dart'), "import 'package:fx/core/dates/local_date/v1.dart';")).code, 0);
  assert.equal(runHook(H, write(u('app/lib/core/periods/p/v1.dart'), "import 'package:fx/core/dates/local_date/v1.dart';")).code, 2);
  assert.equal(runHook(H, write(u('app/lib/core/periods/p/v1.dart'), "import 'package:fx/core/dates/local_date/current.dart';")).code, 0);
});

test('d. pointer must be exactly one export line (export * already carries the types)', () => {
  const p = u('src/usecases/get-thing/index.ts');
  assert.equal(runHook(H, write(p, "export * from './v1.js';\nexport const extra = 1;\n")).code, 2);
  assert.equal(runHook(H, write(p, "export * from './v1.js';\nexport type { Thing } from './v1.js';\n")).code, 2);
  assert.equal(runHook(H, write(p, "/** pointer */\nexport * from './v1.js';\n")).code, 0);
  assert.equal(runHook(H, edit(p, "export * from './v2.js';", "export * from './v1.js';")).code, 0);
  assert.equal(runHook(H, write(u('app/lib/core/dates/local_date/current.dart'), "export 'v1.dart';\nexport 'v2.dart';\n")).code, 2);
});

test('legacy repo: exit 0 and no output', () => {
  const r = runHook(H, write(join(legacy, 'src/usecases/utils.ts'), "import { a } from '../x/v1.js';"));
  assert.equal(r.code, 0);
  assert.equal(r.stdout + r.stderr, '');
});
