#!/usr/bin/env node
/**
 * H1 — side-effect guard (PreToolUse Edit|Write|MultiEdit). Blocks with exit 2.
 *
 * In a dk-coding repo, a non-test file under a pure layer (`core/`, `domain/`, `usecases/`, `ports/`,
 * `shared/` anywhere below `src/` or `lib/`) may not gain calls to time, randomness, ids, timers, the
 * console, env or the network. The redacting logger itself (`shared/log/`, `platform/log/`) is exempt.
 * Only the incoming text is scanned (Write content, Edit new_string), comments and string contents
 * stripped. The banned list is core/architecture-hexagonal.md ("No side effects in the core"); this file
 * holds its regex form. Import rules stay with dependency-cruiser / import_rules_test (not duplicated here).
 */
import { readInput, disabled, editedPath, incomingText, beforeAfter, dkRepo, rel, isTestFile, langOf, stripCode, lineAt, block, pass, RULES_HINT } from './lib/dk-repo.mjs';

const PURE = /^(?:src|lib)\/(?:.*\/)?(core|domain|usecases|ports|shared)\//;
const LOGGER = /(^|\/)(shared|platform)\/log\//;

const CLOCK = 'inject the Clock port and call clock.now(); wire the real clock in the composition root';
const IDS = 'inject an IdGenerator (or Random) port; wire the real source in the composition root';
const LOG = 'inject the Logger (log) port; the console/print adapter is wired in the composition root';
const ENV = 'read env only in the composition root and pass the value in as config';
const HTTP = 'call a driven port; the HTTP adapter under adapters/ implements it';
const TIMER = 'inject a Clock or scheduler port; the real timer is wired in the composition root';

const TOKENS = {
  ts: [
    [/\bDate\.now\s*\(/g, 'Date.now(', CLOCK],
    [/\bnew\s+Date\s*\(\s*\)/g, 'new Date()', CLOCK],
    [/\bperformance\.now\s*\(/g, 'performance.now(', CLOCK],
    [/\bMath\.random\s*\(/g, 'Math.random(', IDS],
    [/\bcrypto\.(?:randomUUID|getRandomValues)\s*\(/g, 'crypto.randomUUID(', IDS],
    [/(?:\b(?:globalThis|window)\.|(?<![\w$.]))(?:setTimeout|setInterval)\s*\(/g, 'setTimeout(', TIMER],
    [/\bconsole\s*\./g, 'console.', LOG],
    [/\bprocess\.env\b/g, 'process.env', ENV],
    [/\bimport\.meta\.env\b/g, 'import.meta.env', ENV],
    [/(?:\b(?:globalThis|window)\.|(?<![\w$.]))fetch\s*\(/g, 'fetch(', HTTP],
  ],
  dart: [
    [/\bDateTime\.(?:now|timestamp)\s*\(/g, 'DateTime.now(', CLOCK],
    [/(?<![\w$.])Random(?:\.secure)?\s*\(/g, 'Random(', IDS],
    [/(?<![\w$.])Timer(?:\.periodic)?\s*\(|\bFuture\.delayed\s*\(/g, 'Timer(', TIMER],
    [/(?<![\w$.])(?:debugPrint|print)\s*\(/g, 'print(', LOG],
    [/\bPlatform\.environment\b/g, 'Platform.environment', ENV],
  ],
};

/** A binding named `fetch` (parameter, variable, function) in a scope enclosing the call shadows the global. */
const LOCAL_FETCH = /(?:\(|,)\s*fetch\s*[:,)=]|\b(?:const|let|var|function)\s+fetch\b|\bfetch\s*:\s*\(/;

if (disabled('h1')) pass();
const input = readInput();
const file = editedPath(input);
const repo = dkRepo(file);
if (!repo) pass();
const relPath = rel(repo.pkg, file);
const lang = langOf(file);
const layer = relPath.match(PURE);
if (!lang || !layer || isTestFile(relPath) || LOGGER.test(relPath)) pass();

const text = stripCode(incomingText(input), lang);
const findings = [];
let globalFetchAdded; // computed on the first bare fetch( only
for (const [re, token, fix] of TOKENS[lang]) {
  for (const m of text.matchAll(re)) {
    if (token === 'fetch(' && !m[0].includes('.')) {
      if (globalFetchAdded === undefined) {
        const { before, after } = beforeAfter(input, file);
        globalFetchAdded = globalFetchCalls(stripCode(after, lang)) > globalFetchCalls(stripCode(before, lang));
      }
      if (!globalFetchAdded) continue;
    }
    findings.push(`  - ${token}  in: ${lineAt(text, m.index)}\n    fix: ${fix}`);
    break;
  }
}
if (!findings.length) pass();

block(
  `dk-coding H1 (side-effect guard): ${relPath} is in a pure layer (${layer[1]}/), which never touches time, ` +
    `randomness, the console, env or the network directly. The new text adds:\n${findings.join('\n')}\n` +
    `Rule: ${RULES_HINT} (no side effects in the core). Tests are exempt.`,
);

/** Bare `fetch(` calls that no enclosing binding shadows (declarations and method definitions skipped). */
function globalFetchCalls(code) {
  let count = 0;
  for (const m of code.matchAll(/(?<![\w$.])fetch\s*\(/g)) {
    const before = code.slice(0, m.index);
    if (/\bfunction\s*\*?\s*$/.test(before)) continue; // function fetch(...)
    const close = closeParen(code, m.index + m[0].length - 1);
    if (/^\s*(?::[^;{}=]*)?\{/.test(code.slice(close + 1))) continue; // method definition: fetch(...) {  /  fetch(...): T {
    if (LOCAL_FETCH.test(visibleScope(before))) continue;
    count++;
  }
  return count;
}

/** `text` with every closed `{...}` block removed, together with a `(params)` header right before it, so
 *  only bindings of the scopes still open at the end of `text` (the call's enclosing scopes) remain. */
function visibleScope(text) {
  let out = '';
  const starts = [];
  for (const ch of text) {
    if (ch === '{') {
      starts.push(headerStart(out));
      out += ch;
    } else if (ch === '}' && starts.length) out = out.slice(0, starts.pop());
    else out += ch;
  }
  return out;
}

function headerStart(out) {
  const m = /\)\s*(?::[^(){};=]*)?(?:=>)?\s*$/.exec(out);
  if (!m) return out.length;
  for (let k = m.index, depth = 0; k >= 0; k--) {
    if (out[k] === ')') depth++;
    else if (out[k] === '(' && --depth === 0) return k;
  }
  return out.length;
}

function closeParen(code, open) {
  for (let k = open, depth = 0; k < code.length; k++) {
    if (code[k] === '(') depth++;
    else if (code[k] === ')' && --depth === 0) return k;
  }
  return code.length;
}
