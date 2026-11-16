#!/usr/bin/env node
/**
 * H6 — frozen-version guard (PreToolUse Edit|Write|MultiEdit). Blocks with exit 2.
 *
 * A `v<N>` file that exists at the repo's `frozenRef` (from `.dk-coding.json`, normally a prod release
 * tag) has shipped to production and is frozen. An edit to it is allowed only when it adds a new
 * `Patched:` line to the doc block — the defect-fix path that keeps the documented contract. Anything
 * else is a behaviour change and belongs in `v<N+1>`.
 * Inactive (exit 0) when `.dk-coding.json` has no `frozenRef`, when the ref does not resolve, or when the
 * file did not exist at that ref.
 */
import { execFileSync } from 'node:child_process';
import { readInput, disabled, editedPath, beforeAfter, dkRepo, rel, block, pass, VERSION_FILE, basename } from './lib/dk-repo.mjs';

if (disabled('h6')) pass();
const input = readInput();
const file = editedPath(input);
const repo = dkRepo(file);
const ref = repo?.config?.frozenRef;
if (!repo || !repo.git || typeof ref !== 'string' || !ref) pass();

const fromGit = rel(repo.git, file);
const isVersion = VERSION_FILE.test(basename(file)) || /(^|\/)modules\/[^/]+\/v\d+\/[^/]+\.tf$/.test(fromGit);
if (!isVersion || !existsAt(ref, fromGit)) pass();

const { before, after } = beforeAfter(input, file);
const count = (s) => (s.match(/Patched:/g) ?? []).length;
if (count(after) > count(before)) pass();

block(
  `dk-coding H6 (frozen version): ${fromGit} shipped to production (present at ${ref}), so it is frozen.\n` +
    `  - Behaviour change: create v<N+1> beside it, copy the test, flip the pointer, update the pointer test.\n` +
    `  - Defect fix that keeps the documented contract (crash, off-by-one, security): keep this edit but add a ` +
    `"Patched: <yyyy-mm-dd> — <what>" line to the doc block, with a failing-first test.\n` +
    `See the dk-coding versioning rules (stack/versioning.md).`,
);

function existsAt(gitRef, path) {
  try {
    execFileSync('git', ['-C', repo.git, 'cat-file', '-e', `${gitRef}:${path}`], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
