#!/usr/bin/env node
/**
 * H2 — layout guard (PreToolUse Edit|Write|MultiEdit). Blocks with exit 2, in dk-coding repos only.
 *
 *  a. a new loose-helper file (`utils`, `helpers`, `misc`, `common`) anywhere outside tests: a helper in
 *     `core/util/` or `shared/` carries a real name too (core/dry.md); or a new stale copy: `*_old`,
 *     `*-backup`, `*.bak`, `* copy` always, `*_new` / `*-copy` only when the original sits beside it
 *     (so `whats_new.dart` and UI-copy files such as `hero-copy.ts` pass);
 *  b. a `v<N>` file importing a sibling `v<M>` (v<N+1> never imports v<N>);
 *  c. any other file importing a `v<N>` file directly, except its own test (same unit; Dart also the
 *     mirrored `test/` tree), the unit pointer, a pointer test, the composition root (check-versions.json
 *     `allowedImporters`) or a migration;
 *  d. a unit pointer (`index.ts` / `current.dart` beside `v<N>` files) with more than one export line
 *     (stack/versioning.md: exactly one; `export *` already re-exports types).
 * b and c are check-versions rules 2-3 with the same layout constants (lib/dk-repo.mjs, drift-tested
 * against check-versions); this hook only catches them before the write lands.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import {
  readInput, disabled, editedPath, incomingText, beforeAfter, dkRepo, rel, langOf, isTestFile, stripCode, importSpecs, readJson,
  block, pass, VERSION_FILE, TEST_FILE, POINTERS, POINTER_TEST, DEFAULT_ALLOWED_IMPORTERS, basename, dirname, join, existsSync,
} from './lib/dk-repo.mjs';

const LOOSE = /^(utils?|helpers?|misc|common)([._-].*)?\.\w+$|[._-](utils?|helpers?|misc|common)\.\w+$/i;
const STALE = /([_-](old|backup|bak)\d*| copy( \d+)?)(\.\w+)+$|\.(bak|orig)$/i;
const MAYBE_STALE = /^(.+?)[_-](new|copy)\d*((\.\w+)+)$/i; // stale only when the original `$1$3` sits beside it

if (disabled('h2')) pass();
const input = readInput();
const file = editedPath(input);
const repo = dkRepo(file);
if (!repo) pass();
const relPath = rel(repo.pkg, file);
const name = basename(file);
const problems = [];

// a. loose helpers and stale copies (new files only)
if (!existsSync(file)) {
  const copyOf = MAYBE_STALE.exec(name);
  if (STALE.test(name) || (copyOf && existsSync(join(dirname(file), copyOf[1] + copyOf[3]))))
    problems.push(`new file "${name}": no _old/_new/-copy/backup files; version the unit (v<N>) or delete the copy`);
  else if (LOOSE.test(name) && !isTestFile(relPath))
    problems.push(`new file "${name}": never utils/helpers/misc/common files; name the helper for what it does (core/util/<name>, shared/<name>) or put area logic in its unit (core/dry.md)`);
}

const lang = langOf(file);
if (lang) {
  const after = beforeAfter(input, file).after;
  const specs = importSpecs(stripCode(incomingText(input), lang, { keepStrings: 'specifiers' }));
  const fromDir = posix.dirname(relPath);
  const allowed = readJson(join(repo.pkg, 'check-versions.json'))?.allowedImporters ?? DEFAULT_ALLOWED_IMPORTERS;
  const selfVersion = name.match(VERSION_FILE);

  for (const spec of specs) {
    const t = targetOf(spec, fromDir, repo.config);
    if (!t) continue;
    const sameUnit = t.dir === fromDir;
    if (sameUnit && selfVersion) {
      problems.push(`b. ${name} imports ${spec}: a version never imports another version of its unit; extract shared code to the layer's shared place first`);
      continue;
    }
    // Mirrored own test (test/<path>/v<N>_test.dart for lib/<path>/v<N>.dart) is Dart only, as in check-versions.
    const mirrored = lang === 'dart' && t.dir.startsWith('lib/') && fromDir === `test/${t.dir.slice(4)}`;
    const ownTest = Number(TEST_FILE.exec(name)?.[1]) === Number(t.n) && (sameUnit || mirrored);
    const pointer = sameUnit && POINTERS.has(name);
    const ok = ownTest || pointer || POINTER_TEST.test(relPath) || /(^|\/)migrations\//.test(relPath) || allowed.some((a) => relPath.startsWith(a.replace(/\/$/, '') + '/'));
    if (!ok) problems.push(`c. ${relPath} imports ${spec} directly: import the unit's pointer (${lang === 'dart' ? 'current.dart' : 'index'}) instead`);
  }

  // d. pointer with more than one export line
  if (POINTERS.has(name) && isUnitDir(dirname(file), after)) {
    const exports = stripCode(after, lang, { keepStrings: 'specifiers' })
      .split('\n')
      .filter((l) => /^\s*export\b/.test(l));
    if (exports.length > 1) problems.push(`d. ${relPath} is a version pointer and must be exactly one export line (\`export *\` already re-exports types); found ${exports.length}`);
  }
}

if (!problems.length) pass();
block(`dk-coding H2 (layout guard) blocked this write:\n${problems.map((p) => '  - ' + p).join('\n')}\nSee the dk-coding versioning rules (stack/versioning.md).`);

/** Resolves a relative or `package:` specifier that names a v<N> file → `{ dir, n }` (package-relative). */
function targetOf(spec, fromDir, cfg) {
  if (spec.startsWith('dart:')) return null;
  let path;
  if (spec.startsWith('package:')) {
    const own = cfg.dartPackage ?? readPubName();
    const m = spec.match(/^package:([^/]+)\/(.+)$/);
    if (!m || (own && m[1] !== own)) return null;
    path = `lib/${m[2]}`;
  } else if (spec.startsWith('.') || (langOf(file) === 'dart' && !spec.includes(':'))) {
    path = posix.normalize(posix.join(fromDir, spec));
  } else return null;
  const vm = posix.basename(path).match(/^v(\d+)(\.(ts|tsx|js|mjs|dart))?$/);
  if (!vm) return null;
  const dir = posix.dirname(path);
  return { dir, n: vm[1] };
}

var pubName; // var: hoisted, read by targetOf() before this line runs
function readPubName() {
  if (pubName !== undefined) return pubName;
  try {
    pubName = /^name:\s*(\S+)/m.exec(readFileSync(join(repo.pkg, 'pubspec.yaml'), 'utf8'))?.[1] ?? null;
  } catch {
    pubName = null;
  }
  return pubName;
}

/** A directory is a unit when it holds a v<N> file, or the pointer text itself exports one. */
function isUnitDir(dir, text) {
  try {
    if (readdirSync(dir).some((f) => VERSION_FILE.test(f))) return true;
  } catch {
    /* new dir */
  }
  return /['"](\.\/)?v\d+(\.\w+)?['"]/.test(text);
}
