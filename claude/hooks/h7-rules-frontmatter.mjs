#!/usr/bin/env node
/**
 * H7 — rule frontmatter check (PostToolUse Edit|Write|MultiEdit on any `.claude/rules/**.md`). Warns only.
 *
 * A rule whose YAML frontmatter fails to parse loads unconditionally, so a typo silently turns a scoped
 * rule into an always-on one. This checks, without a YAML library:
 *  - an opening `---` on line 1 has a closing `---`;
 *  - every frontmatter line is `key: value`, a `- item` list entry, or blank/comment;
 *  - `paths:` is a list (block `- "glob"` items or an inline `["a", "b"]`), never empty;
 *  - each glob: quoted when it starts with `*`, `{`, `[`, `!`, `&`, `@` or a backtick (plain YAML would
 *    misparse it), balanced quotes / [] / {}, not absolute and not `~`-relative.
 * Not marker-gated: rules live under @DK_HOME@, outside every dk-coding repo.
 */
import { readFileSync } from 'node:fs';
import { readInput, disabled, editedPath, warn, pass } from './lib/dk-repo.mjs';

if (disabled('h7')) pass();
const input = readInput();
const file = editedPath(input);
if (!file || !/\/\.claude\/rules\/.+\.md$/.test(file)) pass();
let text;
try {
  text = readFileSync(file, 'utf8');
} catch {
  pass();
}

const lines = text.split('\n');
if (lines[0].trim() !== '---') pass();
const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
const problems = [];
if (end < 0) problems.push('frontmatter opens with --- on line 1 but never closes; the whole rule loads unconditionally');

const fm = end < 0 ? [] : lines.slice(1, end);
let inPaths = false;
let pathCount = 0;
fm.forEach((l, k) => {
  const n = k + 2;
  if (!l.trim() || /^\s*#/.test(l)) return;
  const item = l.match(/^\s+-\s+(.*)$/) ?? l.match(/^-\s+(.*)$/);
  if (item) {
    if (!inPaths) return;
    pathCount++;
    checkGlob(item[1].trim(), n);
    return;
  }
  if (/^\s/.test(l) && !inPaths) return; // continuation of a multi-line scalar (e.g. `description: >`)
  const kv = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
  if (!kv) {
    problems.push(`line ${n}: "${l.trim()}" is not "key: value" or a "- item" entry`);
    inPaths = false;
    return;
  }
  inPaths = kv[1] === 'paths';
  if (!inPaths) return;
  const v = kv[2].trim();
  if (!v) return; // block list follows
  if (!v.startsWith('[') || !v.endsWith(']')) {
    problems.push(`line ${n}: paths must be a list (block "- \\"glob\\"" items or inline ["a", "b"]), got "${v}"`);
    return;
  }
  const inner = v.slice(1, -1).trim();
  for (const g of inner ? splitInline(inner) : []) {
    pathCount++;
    checkGlob(g.trim(), n);
  }
  inPaths = false;
});
if (end > 0 && fm.some((l) => /^paths:/.test(l)) && pathCount === 0) problems.push('paths: is present but lists no globs');

if (!problems.length) pass();
warn('PostToolUse', `dk-coding H7 (rule frontmatter) ${file}:\n${problems.map((p) => '  - ' + p).join('\n')}\nA rule whose frontmatter fails to parse loads in every session, unscoped.`);

function checkGlob(raw, n) {
  const quoted = /^(["']).*\1$/.test(raw);
  if (!quoted && /^[*{[!&@`|>%]/.test(raw)) problems.push(`line ${n}: glob ${raw} must be quoted (plain YAML reads a leading ${raw[0]} as syntax)`);
  if (/^["']/.test(raw) && !quoted) problems.push(`line ${n}: unbalanced quote in ${raw}`);
  const g = quoted ? raw.slice(1, -1) : raw;
  if (!g) problems.push(`line ${n}: empty glob`);
  for (const [o, c] of [['[', ']'], ['{', '}']]) {
    if (g.split(o).length !== g.split(c).length) problems.push(`line ${n}: unbalanced ${o}${c} in ${g}`);
  }
  if (/^(\/|~)/.test(g)) problems.push(`line ${n}: glob ${g} must be relative to the project root, not absolute or ~-relative`);
}

/** Splits an inline YAML list body on commas outside quotes and braces. */
function splitInline(s) {
  const out = [];
  let cur = '';
  let q = null;
  let depth = 0;
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
