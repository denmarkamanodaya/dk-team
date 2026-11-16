/**
 * Shared helpers for the dk-coding hooks (H1-H7). Dependency-free Node ESM.
 *
 * Every hook reads one JSON object on stdin (the Claude Code hook input), decides, and answers through
 * one of the output helpers below. Repo detection is the opt-in gate: a file belongs to a dk-coding repo
 * only when its package root, or an ancestor up to the git root, holds `.dk-coding.json` or
 * `scripts/check-versions.mjs`. Everything else (the legacy repos) gets exit 0 with no output.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative, sep, basename, extname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Where the dk-coding scripts live: the installed path (filled in by `dk-team install`), else the repo layout. */
const INSTALLED_SCRIPTS = '@DK_HOME@/skills/dk-coding/scripts';
export const SKILL_SCRIPTS = INSTALLED_SCRIPTS.startsWith('@')
  ? resolve(dirname(fileURLToPath(import.meta.url)), '../../skills/dk-coding/scripts')
  : INSTALLED_SCRIPTS;
export const RULES_HINT = '@DK_TEAM@/rules/core/architecture-hexagonal.md';

// ---------------------------------------------------------------- input ---

/** Reads and parses stdin. A malformed, empty or non-object payload (`null`, `[]`, `3`) yields `{}`, so the hook falls through to exit 0. */
export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    const v = raw.trim() ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** `DK_HOOKS_DISABLE=1` (or `all`) turns every hook off; `DK_HOOKS_DISABLE=h1,h5` turns off the listed ones. */
export function disabled(id) {
  const v = (process.env.DK_HOOKS_DISABLE ?? '').toLowerCase().trim();
  if (!v) return false;
  if (v === '1' || v === 'all' || v === 'true') return true;
  return v.split(/[,\s]+/).includes(id);
}

/** The edited file. MultiEdit carries it at top level; the per-edit form is accepted as a fallback. */
export function editedPath(input) {
  const ti = input?.tool_input ?? {};
  const p = ti.file_path ?? ti.edits?.find((e) => e?.file_path)?.file_path;
  return typeof p === 'string' && p ? resolve(input.cwd ?? process.cwd(), p) : null;
}

/** Only the text this tool call adds: Write content, Edit new_string, MultiEdit new_strings. */
export function incomingText(input) {
  const ti = input?.tool_input ?? {};
  if (typeof ti.content === 'string') return ti.content;
  if (typeof ti.new_string === 'string') return ti.new_string;
  if (Array.isArray(ti.edits)) return ti.edits.map((e) => e?.new_string ?? '').join('\n');
  return '';
}

/** The file before and after this call (Edit/MultiEdit applied to the on-disk text; '' when new). */
export function beforeAfter(input, file) {
  const ti = input?.tool_input ?? {};
  let before = '';
  try {
    before = readFileSync(file, 'utf8');
  } catch {
    /* new file */
  }
  if (typeof ti.content === 'string') return { before, after: ti.content };
  const edits = Array.isArray(ti.edits) ? ti.edits : [ti];
  let after = before;
  for (const e of edits) {
    if (typeof e?.old_string !== 'string' || typeof e?.new_string !== 'string') continue;
    after = e.replace_all ? after.split(e.old_string).join(e.new_string) : after.replace(e.old_string, () => e.new_string);
  }
  return { before, after };
}

// ---------------------------------------------------------- repo shape ---

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Nearest ancestor (inclusive) holding `.git` (dir, or file for worktrees); null when none. */
export function gitRoot(start) {
  for (let d = start; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
}

/** Nearest ancestor with package.json or pubspec.yaml, never above the git root; else the git root. */
export function packageRoot(file) {
  const top = gitRoot(dirname(file));
  for (let d = dirname(file); ; d = dirname(d)) {
    if (isFile(join(d, 'package.json')) || isFile(join(d, 'pubspec.yaml'))) return d;
    if (d === top || dirname(d) === d) return top ?? dirname(file);
  }
}

/**
 * Detects a dk-coding repo for `file`. Returns `{ pkg, git, markerDir, config }` or null.
 * Searches the package root and each ancestor up to the git root (no git root: up to, not including,
 * $HOME). Files under `node_modules/` or a `.claude/` directory are never dk files: the skill's own
 * `scripts/check-versions.mjs` must not turn the skill folder into a "repo". The one exception is a
 * Claude Code agent worktree, `<repo>/.claude/worktrees/<name>/...`: it is a full checkout (its own git
 * root), so a teammate's edits there are checked like edits in the main checkout.
 */
export function dkRepo(file) {
  if (!file) return null;
  const parts = file.split(sep);
  if (parts.includes('node_modules')) return null;
  for (let k = 0; k < parts.length; k++) {
    if (parts[k] === '.claude' && !(parts[k + 1] === 'worktrees' && k + 3 < parts.length)) return null;
  }
  const pkg = packageRoot(file);
  const git = gitRoot(pkg);
  const home = homedir();
  for (let d = pkg; ; d = dirname(d)) {
    if (!git && d === home) return null;
    const json = join(d, '.dk-coding.json');
    if (isFile(json) || isFile(join(d, 'scripts', 'check-versions.mjs'))) {
      return { pkg, git, markerDir: d, config: readJson(json) ?? {} };
    }
    if (d === git) return siblingMarker(pkg, git);
    if (dirname(d) === d) return null;
  }
}

/**
 * One marker anywhere in a git repo marks the whole repo (core/agent-conduct.md): checks each direct
 * child package of the git root, so an `app/` package is strict when `backend/scripts/` holds the marker.
 */
function siblingMarker(pkg, git) {
  let names = [];
  try {
    names = readdirSync(git, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return null;
  }
  for (const name of names) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const d = join(git, name);
    const json = join(d, '.dk-coding.json');
    if (isFile(json) || isFile(join(d, 'scripts', 'check-versions.mjs'))) {
      return { pkg, git, markerDir: d, config: readJson(json) ?? {} };
    }
  }
  return null;
}

export function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export const rel = (from, p) => relative(from, p).split(sep).join('/');

const TEST_RE = /(\.test\.|\.spec\.|_test\.dart$)|(^|\/)(__tests__|test|tests|integration_test|test-support|testing)\//;
export const isTestFile = (relPath) => TEST_RE.test(relPath);

// Layout facts shared with skills/dk-coding/scripts/check-versions.mjs. That script is copied into repos and
// must stay single-file, so these are kept equal to its constants by __tests__/parity.test.mjs (a drift
// gate), never edited on one side only.
export const VERSION_FILE = /^v(\d+)\.(ts|tsx|js|mjs|dart)$/;
export const TEST_FILE = /^v(\d+)(\.test\.(ts|tsx|js|mjs)|_test\.dart)$/;
export const POINTERS = new Set(['index.ts', 'index.js', 'index.mjs', 'current.dart']);
export const POINTER_TEST = /(^|\/)(__tests__|test\/architecture)\/(pointers(-[a-z0-9-]+)?\.test\.(ts|tsx|js|mjs)|pointers(_[a-z0-9_]+)?_test\.dart)$/;
export const DEFAULT_ALLOWED_IMPORTERS = ['src/composition', 'src/app', 'lib/app', 'migrations'];

export function langOf(file) {
  const ext = extname(file);
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'].includes(ext)) return 'ts';
  if (ext === '.dart') return 'dart';
  return null;
}

/** check-versions to run for a package: the repo's own copy (package root up to git root), else the skill's. */
export function checkVersionsScript(repo) {
  for (let d = repo.pkg; ; d = dirname(d)) {
    const s = join(d, 'scripts', 'check-versions.mjs');
    if (isFile(s)) return s;
    if (d === repo.git || d === repo.markerDir || dirname(d) === d) break;
  }
  const skill = join(SKILL_SCRIPTS, 'check-versions.mjs');
  return isFile(skill) ? skill : null;
}

export function checkVersionsArgs(repo) {
  const cfg = join(repo.pkg, 'check-versions.json');
  return isFile(cfg) ? ['--config', cfg] : [];
}

export const dryGateScript = () => {
  const s = join(SKILL_SCRIPTS, 'dry-gate.mjs');
  return isFile(s) ? s : null;
};

/** A local binary: `<pkg>/node_modules/.bin/<name>`, then each parent up to the git root. */
export function localBin(repo, name) {
  for (let d = repo.pkg; ; d = dirname(d)) {
    const b = join(d, 'node_modules', '.bin', name);
    if (isFile(b)) return b;
    if (d === repo.git || dirname(d) === d) return null;
  }
}

/** A binary on PATH, or null. */
export function onPath(name) {
  for (const d of (process.env.PATH ?? '').split(':')) {
    if (d && isFile(join(d, name))) return join(d, name);
  }
  return null;
}

// -------------------------------------------------------- code scanning ---

/**
 * Strips comments, and string contents unless `keepStrings`. Interpolations (`${...}` in TS template
 * literals, `${...}` in Dart strings) stay, because they are code. Conservative: an unterminated
 * single-line string ends at the newline, so an Edit fragment cut mid-string cannot swallow the rest.
 * `keepStrings: 'specifiers'` keeps only the strings that directly follow `from`, `import`, `export`,
 * `part` or `import(`, so import text quoted inside another string is never read as an import.
 * TS regex literals are replaced by `/r/`, so a quote inside one (`/['"]/`) cannot open a fake string.
 */
export function stripCode(src, lang = 'ts', { keepStrings = false } = {}) {
  let i = 0;
  let out = '';
  const n = src.length;
  const code = (inInterp) => {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/' && src[i - 1] !== ':') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const e = src.indexOf('*/', i + 2);
        i = e < 0 ? n : e + 2;
        out += ' ';
        continue;
      }
      if (c === '/' && lang !== 'dart' && regexAllowed()) {
        const end = regexEnd(i);
        if (end > 0) {
          out += '/r/';
          i = end;
          continue;
        }
      }
      if (c === '"' || c === "'" || (c === '`' && lang !== 'dart')) {
        str();
        continue;
      }
      if (inInterp && c === '{') depth++;
      if (inInterp && c === '}' && depth-- === 0) return;
      out += c;
      i++;
    }
  };
  // A `/` starts a regex literal (not a division) after an operator, an opening bracket, a keyword, or at a line start.
  const regexAllowed = () => {
    const prev = out.replace(/[ \t]+$/, '');
    if (!prev || prev.endsWith('\n')) return true;
    return /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|do|else|in|of|void|yield|await|delete|throw|new)$/.test(prev);
  };
  // End offset (after the flags) of the regex literal starting at `start`, or -1 when the line has no closing `/`.
  const regexEnd = (start) => {
    let inClass = false;
    for (let j = start + 1; j < n; j++) {
      const ch = src[j];
      if (ch === '\n') return -1;
      if (ch === '\\') {
        j++;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        return j;
      }
    }
    return -1;
  };
  const str = () => {
    const keep = keepStrings === true || (keepStrings === 'specifiers' && /(\b(from|import|export|part)|\bimport\s*\()\s*$/.test(out.slice(-40)));
    const q = src[i];
    const raw = lang === 'dart' && src[i - 1] === 'r';
    const close = q !== '`' && src.startsWith(q + q + q, i) ? q + q + q : q;
    const multiline = close.length === 3 || q === '`';
    const interp = q === '`' || (lang === 'dart' && !raw);
    out += close;
    i += close.length;
    while (i < n) {
      if (src[i] === '\\' && !raw) {
        if (keep) out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (src.startsWith(close, i)) {
        out += close;
        i += close.length;
        return;
      }
      if (!multiline && src[i] === '\n') {
        out += close;
        return;
      }
      if (interp && src[i] === '$' && src[i + 1] === '{') {
        out += '${';
        i += 2;
        code(true);
        if (src[i] === '}') {
          out += '}';
          i++;
        }
        continue;
      }
      if (keep) out += src[i];
      i++;
    }
  };
  code(false);
  return out;
}

/** Import/export specifiers in TS or Dart source, stripped with `keepStrings: 'specifiers'`. */
export function importSpecs(src) {
  const re =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm;
  return [...src.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
}

/** The line of `text` holding offset `idx`, trimmed and capped. */
export function lineAt(text, idx) {
  const s = text.lastIndexOf('\n', idx - 1) + 1;
  const e = text.indexOf('\n', idx);
  return text.slice(s, e < 0 ? undefined : e).trim().slice(0, 120);
}

// -------------------------------------------------------------- output ---

/** Blocks a PreToolUse call: stderr goes to Claude as the reason. */
export function block(msg) {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n');
  process.exit(2);
}

/** Non-blocking feedback Claude sees on its next request (PostToolUse additionalContext). */
export function warn(event, msg) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: msg } }));
  process.exit(0);
}

/** Escalates a PreToolUse call to the user's permission prompt with `reason`. */
export function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

/** Keeps Claude working (Stop / SubagentStop) with `reason` as its next instruction. */
export function stopBlock(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

/** A message shown to the user only. */
export function notifyUser(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
}

export const pass = () => process.exit(0);

export const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

// ------------------------------------------------------- session state ---
// Layout: <stateDir>/<session>/edited/<sha1(path)>.json  one marker per edited file ({ file, agent }), so
//         parallel H3 runs (subagents in one session) never overwrite each other's entries;
//         <stateDir>/<session>/state.json                 { lastBlock: { hash, count }, dartReminded }, written by H4 only.

const stateDir = () => process.env.DK_HOOKS_STATE_DIR || join(tmpdir(), 'dk-hooks');
export const sessionDir = (sessionId) => join(stateDir(), String(sessionId || 'nosession').replace(/[^\w.-]/g, '_'));
const editedDir = (sessionId) => join(sessionDir(sessionId), 'edited');

function writeAtomic(p, data) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, p);
  } catch {
    /* state is best-effort: a lost write only means the Stop gate checks less */
  }
}

/** Records that `file` was edited this session by `agent` ('' for the main thread). */
export const recordEdit = (sessionId, file, agent) => writeAtomic(join(editedDir(sessionId), `${hash(file)}.json`), { file, agent: agent ?? '' });

/** `[{ file, agent }]` for every file recorded this session. */
export function editedFiles(sessionId) {
  let names = [];
  try {
    names = readdirSync(editedDir(sessionId)).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names.map((n) => readJson(join(editedDir(sessionId), n))).filter((e) => typeof e?.file === 'string');
}

/** Forgets `files` (they passed the gates, or H4 gave up on them). */
export function clearEdited(sessionId, files) {
  for (const f of files) rmSync(join(editedDir(sessionId), `${hash(f)}.json`), { force: true });
}

/** `{ lastBlock: { hash, count }, dartReminded: bool }` */
export function loadState(sessionId) {
  const s = readJson(join(sessionDir(sessionId), 'state.json')) ?? {};
  return { ...s, lastBlock: s.lastBlock ?? { hash: '', count: 0 } };
}

export const saveState = (sessionId, state) => writeAtomic(join(sessionDir(sessionId), 'state.json'), state);

// --------------------------------------------------------- processes ---

/** Runs a command; resolves `{ code, out, timedOut, ms }`. Never rejects. `code` is null on timeout/spawn error. */
export function run(cmd, args, { cwd, timeoutMs = 5000 } = {}) {
  const t0 = Date.now();
  return new Promise((done) => {
    let out = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    } catch (e) {
      done({ code: null, out: String(e), timedOut, ms: 0 });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ code: null, out: out + String(e), timedOut, ms: Date.now() - t0 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: timedOut ? null : code, out, timedOut, ms: Date.now() - t0 });
    });
  });
}

/** Last `n` non-empty lines of a tool's output. */
export const tail = (s, n = 30) =>
  s
    .split('\n')
    .filter((l) => l.trim())
    .slice(-n)
    .join('\n');

export { basename, dirname, join, extname, existsSync };
