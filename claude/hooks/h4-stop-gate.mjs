#!/usr/bin/env node
/**
 * H4 — completion gate (Stop + SubagentStop). Blocks the stop once per failure.
 *
 * Runs only when dk-coding files were edited this session (recorded by H3). For each touched package, in
 * parallel: check-versions, dry-gate on the touched files, dependency-cruiser when the package has a
 * `.dependency-cruiser.*` config, `tsc --noEmit` when it has a tsconfig, eslint on touched TS/JS files when
 * it has an eslint config. The Dart import-rules test is too slow for a hook, so it is only named.
 *
 * Loop safety: never blocks when `stop_hook_active` is true (the agent is already continuing after a block).
 * In that case the gates still run once more: a pass clears the touched list, a failure is reported to the
 * user (systemMessage) and the files stay recorded, so the next turn's stop checks them again. After two
 * blocks with the same reason (across turns) it lets the agent stop and tells the user the gates are still
 * failing. A passing run clears the touched list, so a turn that only reads or answers costs nothing.
 * A SubagentStop checks only that subagent's files.
 */
import { readdirSync } from 'node:fs';
import {
  readInput, disabled, dkRepo, rel, langOf, loadState, saveState, editedFiles, clearEdited, run, tail, stopBlock, notifyUser, pass, hash,
  localBin, checkVersionsScript, checkVersionsArgs, dryGateScript, join, existsSync, extname,
} from './lib/dk-repo.mjs';

const GATE_MS = Number(process.env.DK_HOOKS_STOP_GATE_MS) || 120000;
const MAX_SAME_BLOCKS = 2;

if (disabled('h4')) pass();
const input = readInput();
const retry = input.stop_hook_active === true;

const sub = input.hook_event_name === 'SubagentStop' ? (input.agent_id ?? '') : null;
const files = editedFiles(input.session_id)
  .filter((e) => existsSync(e.file) && (sub === null || e.agent === sub))
  .map((e) => e.file);
if (!files.length) pass();
const state = loadState(input.session_id);

/** pkg dir → { repo, files[] } */
const pkgs = new Map();
for (const f of files) {
  const repo = dkRepo(f);
  if (!repo) continue;
  const e = pkgs.get(repo.pkg) ?? { repo, files: [] };
  e.files.push(f);
  pkgs.set(repo.pkg, e);
}

const jobs = [];
const reminders = [];
for (const { repo, files: touched } of pkgs.values()) {
  const at = (label, cmd, args) =>
    jobs.push(run(cmd, args, { cwd: repo.pkg, timeoutMs: GATE_MS }).then((r) => ({ label: `${rel(repo.git ?? repo.pkg, repo.pkg) || '.'}: ${label}`, r })));
  const code = touched.filter((f) => langOf(f));
  const ts = touched.filter((f) => langOf(f) === 'ts');
  const names = safeList(repo.pkg);

  const cv = checkVersionsScript(repo);
  if (cv) at('check-versions', process.execPath, [cv, ...checkVersionsArgs(repo)]);
  const dg = dryGateScript();
  if (dg && code.length) at('dry-gate', process.execPath, [dg, '--root', repo.pkg, '--files', code.join(',')]);

  const depConf = names.find((n) => /^\.dependency-cruiser\.(c?js|mjs|json)$/.test(n));
  const depcruise = depConf && localBin(repo, 'depcruise');
  const srcDirs = ['src', 'lib'].filter((d) => existsSync(join(repo.pkg, d)));
  if (depcruise && srcDirs.length) at('dependency-cruiser', depcruise, [...srcDirs, '--config', depConf]);

  const tsc = names.includes('tsconfig.json') && ts.length && localBin(repo, 'tsc');
  if (tsc) at('tsc --noEmit', tsc, ['--noEmit', '-p', 'tsconfig.json']);

  const eslintConf = names.some((n) => /^(eslint\.config\.(c?js|mjs|ts)|\.eslintrc(\.\w+)?)$/.test(n));
  const eslint = eslintConf && ts.length && localBin(repo, 'eslint');
  if (eslint) at('eslint (touched files)', eslint, ts);

  if (touched.some((f) => extname(f) === '.dart') && existsSync(join(repo.pkg, 'test', 'architecture')))
    reminders.push(`Dart files changed in ${rel(repo.git ?? repo.pkg, repo.pkg)}: run \`fvm flutter test test/architecture\` (import rules + pointers) and \`fvm flutter analyze\` before claiming done.`);
}

const failures = [];
for (const { label, r } of await Promise.all(jobs)) {
  if (r.timedOut) failures.push(`${label}: timed out after ${GATE_MS} ms`);
  else if (r.code !== 0) failures.push(`${label} failed:\n${tail(r.out, 20)}`);
}

if (!failures.length) {
  clearEdited(input.session_id, files);
  state.lastBlock = { hash: '', count: 0 };
  saveState(input.session_id, state);
  if (reminders.length && !state.dartReminded) {
    state.dartReminded = true;
    saveState(input.session_id, state);
    notifyUser(`dk-coding gates passed. ${reminders.join(' ')}`);
  }
  pass();
}

const firstLines = failures.map((f) => f.split('\n')[0]).join('\n');
if (retry) notifyUser(`dk-coding H4: the gates still fail after the agent's retry (not blocked again: stop_hook_active). They are re-checked at the next stop. Still failing:\n${firstLines}`);

const reason =
  `dk-coding H4 (completion gate): ${failures.length} gate(s) fail on the files you changed. Fix them, or ` +
  `report them as failing with the reason — never claim done over a red gate.\n\n${failures.join('\n\n')}` +
  (reminders.length ? `\n\n${reminders.join('\n')}` : '');
// Durations differ run to run; strip them so an unchanged failure hashes the same.
const h = hash(failures.join('\n').replace(/\d+(\.\d+)?\s*(ms|s)\b/g, ''));
const count = state.lastBlock.hash === h ? state.lastBlock.count + 1 : 1;
if (count > MAX_SAME_BLOCKS) {
  clearEdited(input.session_id, files);
  state.lastBlock = { hash: '', count: 0 };
  saveState(input.session_id, state);
  notifyUser(`dk-coding H4: the same gates failed ${MAX_SAME_BLOCKS} times in a row; letting the agent stop. Still failing:\n${firstLines}`);
}
state.lastBlock = { hash: h, count };
saveState(input.session_id, state);
stopBlock(reason);

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
