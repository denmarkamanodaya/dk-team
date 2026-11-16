#!/usr/bin/env node
/**
 * H3 — post-edit fast gates (PostToolUse Edit|Write|MultiEdit). Never blocks.
 *
 * In a dk-coding repo:
 *  1. formats the edited file with a formatter that is already installed locally (skips silently if not):
 *     prettier from node_modules/.bin (ts/tsx/js/mjs/cjs/json/css/scss/md/yaml), `dart format` (the
 *     .fvm SDK when `.fvmrc` is present, else dart on PATH), `terraform fmt` for .tf;
 *  2. records the file in the session state for the Stop gate (H4);
 *  3. runs check-versions (cwd = package root) and dry-gate --files <file>, in parallel.
 * Findings go back to Claude as additionalContext. DK_HOOKS_DRY_RUN=1 runs the formatter in check mode
 * (no write), so timing runs never touch real files.
 */
import {
  readInput, disabled, editedPath, dkRepo, rel, langOf, recordEdit, run, tail, warn, pass, onPath,
  localBin, checkVersionsScript, checkVersionsArgs, dryGateScript, extname, dirname, join, existsSync,
} from './lib/dk-repo.mjs';

const PRETTIER_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.md', '.yaml', '.yml']);
const DRY = process.env.DK_HOOKS_DRY_RUN === '1';
const FORMAT_MS = 3000;
const GATE_MS = 4000;

if (disabled('h3')) pass();
const input = readInput();
const file = editedPath(input);
const repo = dkRepo(file);
if (!repo || !existsSync(file)) pass();
const relPath = rel(repo.pkg, file);

const formatted = await format();

recordEdit(input.session_id, file, input.agent_id);

const notes = [];
if (formatted?.code !== 0 && formatted?.code != null && !DRY) notes.push(`formatter (${formatted.tool}) failed:\n${tail(formatted.out, 15)}`);

if (langOf(file) || extname(file) === '.tf') {
  const gates = [];
  const cv = checkVersionsScript(repo);
  if (cv) gates.push(run(process.execPath, [cv, ...checkVersionsArgs(repo)], { cwd: repo.pkg, timeoutMs: GATE_MS }).then((r) => ['check-versions', r]));
  const dg = dryGateScript();
  if (dg && langOf(file))
    gates.push(run(process.execPath, [dg, '--root', repo.pkg, '--files', file], { cwd: repo.pkg, timeoutMs: GATE_MS }).then((r) => ['dry-gate', r]));
  for (const [name, r] of await Promise.all(gates)) {
    if (r.timedOut) notes.push(`${name} timed out after ${GATE_MS} ms (skipped; the Stop gate runs it again)`);
    else if (r.code !== 0 && r.code != null) notes.push(`${name} failed:\n${tail(r.out, 25)}`);
  }
}

if (!notes.length) pass();
warn(
  'PostToolUse',
  `dk-coding H3 (post-edit gates) for ${relPath}. Not blocking — fix before you finish, or say why it is mid-refactor:\n` +
    notes.join('\n\n'),
);

/** Formats `file` with whatever local formatter fits; resolves null when none applies. */
async function format() {
  const ext = extname(file);
  if (PRETTIER_EXT.has(ext)) {
    const bin = localBin(repo, 'prettier');
    if (!bin) return null;
    const args = DRY ? ['--check', '--ignore-unknown', file] : ['--write', '--ignore-unknown', '--log-level', 'warn', file];
    const r = await run(bin, args, { cwd: repo.pkg, timeoutMs: FORMAT_MS });
    return { ...r, tool: 'prettier', code: DRY ? 0 : r.code };
  }
  if (ext === '.dart') {
    const dart = dartBin();
    if (!dart) return null;
    const args = DRY ? ['format', '--output=none', file] : ['format', file];
    return { ...(await run(dart[0], [...dart.slice(1), ...args], { cwd: repo.pkg, timeoutMs: FORMAT_MS })), tool: 'dart format' };
  }
  if (ext === '.tf') {
    const tf = onPath('terraform');
    if (!tf) return null;
    const r = await run(tf, ['fmt', ...(DRY ? ['-check'] : []), file], { cwd: dirname(file), timeoutMs: FORMAT_MS });
    return { ...r, tool: 'terraform fmt', code: DRY ? 0 : r.code };
  }
  return null;
}

/** The pinned SDK's dart when `.fvmrc` is present (direct binary: ~0.35 s vs ~0.75 s via fvm), else PATH. */
function dartBin() {
  for (let d = repo.pkg; ; d = dirname(d)) {
    if (existsSync(join(d, '.fvmrc'))) {
      const direct = join(d, '.fvm', 'flutter_sdk', 'bin', 'dart');
      if (existsSync(direct)) return [direct];
      const fvm = onPath('fvm');
      return fvm ? [fvm, 'dart'] : null;
    }
    if (d === repo.git || dirname(d) === d) break;
  }
  const dart = onPath('dart');
  return dart ? [dart] : null;
}
