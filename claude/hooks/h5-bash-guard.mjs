#!/usr/bin/env node
/**
 * H5 — Bash guard (PreToolUse Bash). Global: not gated on a dk-coding marker, because these owner rulings
 * are platform-wide. Never denies; escalates to the user's permission prompt ("ask") for:
 *  - git push targeting develop or main (`origin develop`, `HEAD:main`, `refs/heads/develop`, `--all`,
 *    `--mirror`, `origin HEAD` / `origin @` or a bare push while the current branch is develop/main);
 *  - --no-verify on any command;
 *  - terraform / tofu apply or destroy (any form), and -backend-config / -reconfigure;
 *  - adding a dependency: npm install|i|add <pkg>, pnpm add, yarn add, bun add, flutter|dart pub add.
 *    A bare `npm install` / `npm ci` / `pub get` is allowed.
 * The command line is tokenized like a shell: quoted text and heredoc bodies are data (a commit message
 * that mentions `git push origin develop` is not a push), while `$(...)`, backticks, `bash|sh|zsh -c '...'`
 * and `eval` are scanned as commands. Wrappers (`sudo`, `env`, `timeout 30`, `xargs -n1`, ...) are skipped.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readInput, disabled, ask, pass } from './lib/dk-repo.mjs';

const PROTECTED = /^(?:\+?(?:[\w.\-/]*:)?(?:refs\/heads\/)?)(develop|main)$/;
/** Wrapper commands in front of the real one, with the flags of each that take a value. */
const WRAPPERS = {
  sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U'],
  time: [], command: [], exec: ['-a'], nohup: [], stdbuf: [], npx: ['-p', '--package'], fvm: [],
  nice: ['-n'],
  env: ['-u', '-C', '-S', '--unset', '--chdir'],
  timeout: ['-s', '--signal', '-k', '--kill-after'],
  xargs: ['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file', '--replace'],
};
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']);
const NPM_VALUE_FLAGS = new Set(['--prefix', '-w', '--workspace', '-C', '--cache', '--registry', '--omit', '--include', '--userconfig', '--loglevel', '--install-strategy', '--before', '--tag']);

if (disabled('h5')) pass();
const input = readInput();
const command = input?.tool_input?.command;
if (typeof command !== 'string' || !command.trim()) pass();

const reasons = new Set();
for (const words of segments(command)) check(words);
if (!reasons.size) pass();
ask(`Owner ruling check (H5): ${[...reasons].join('; ')}. Approve only if the owner asked for exactly this.`);

/**
 * Splits a shell line into simple commands, each as its list of words (quotes removed). Separators:
 * ; && || | & newline ( ). Redirections and their targets are dropped. Command substitutions and
 * `sh -c` / `eval` strings are scanned recursively; heredoc bodies and quoted text are only data.
 */
function segments(cmd, depth = 0) {
  const out = [];
  if (depth > 4) return out;
  const src = stripHeredocs(cmd);
  let words = [];
  let cur = null; // the word being built; null between words
  let dropNext = false; // the next word is a redirection target
  const endWord = () => {
    if (cur !== null && !dropNext) words.push(cur);
    else if (cur !== null) dropNext = false;
    cur = null;
  };
  const endSeg = () => {
    endWord();
    dropNext = false;
    const w = unwrap(words);
    if (w.length) {
      const c = w.findIndex((x, k) => k > 0 && /^-[a-z]*c[a-z]*$/i.test(x));
      if (SHELLS.has(w[0].split('/').pop()) && c > 0 && w[c + 1] !== undefined) out.push(...segments(w[c + 1], depth + 1));
      else if (w[0] === 'eval') out.push(...segments(w.slice(1).join(' '), depth + 1));
      else out.push(w);
    }
    words = [];
  };
  const sub = (from, close) => {
    const end = close === ')' ? matchParen(src, from - 1) : src.indexOf('`', from);
    const stop = end < 0 ? src.length : end;
    out.push(...segments(src.slice(from, stop), depth + 1));
    return stop; // index of the closing char
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] !== '\n') cur = (cur ?? '') + (src[i + 1] ?? '');
      i++;
    } else if (c === "'") {
      const e = src.indexOf("'", i + 1);
      const end = e < 0 ? src.length : e;
      cur = (cur ?? '') + src.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let s = '';
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === '\\') s += src[++j] ?? '';
        else if (src.startsWith('$(', j)) j = sub(j + 2, ')');
        else if (src[j] === '`') j = sub(j + 1, '`');
        else s += src[j];
      }
      cur = (cur ?? '') + s;
      i = j;
    } else if (src.startsWith('$(', i)) {
      i = sub(i + 2, ')');
      cur = (cur ?? '') + '$SUB';
    } else if (c === '`') {
      i = sub(i + 1, '`');
      cur = (cur ?? '') + '$SUB';
    } else if (c === '>' || c === '<' || (c === '&' && src[i + 1] === '>')) {
      if (cur !== null && /^\d+$/.test(cur)) cur = null; // fd number: 2>
      endWord();
      while (/[<>&|]/.test(src[i + 1] ?? '')) i++; // >> &> >& <<< >|
      const fd = /^\d+|^-/.exec(src.slice(i + 1)); // >&2, >&-
      if (fd && src[i] === '&') i += fd[0].length;
      else dropNext = true;
    } else if (c === ';' || c === '\n' || c === '(' || c === ')' || c === '|' || c === '&') {
      if ((c === '&' || c === '|') && src[i + 1] === c) i++;
      endSeg();
    } else if (c === ' ' || c === '\t' || c === '\r') endWord();
    else if (c === '#' && cur === null) {
      while (i + 1 < src.length && src[i + 1] !== '\n') i++; // comment to end of line
    } else cur = (cur ?? '') + c;
  }
  endSeg();
  return out;
}

/** Drops leading env assignments, shell keywords (`if`, `{`, `!`, ...) and wrapper commands (with their flags, flag values and, for timeout, the duration). */
function unwrap(w) {
  w = [...w];
  for (;;) {
    if (w.length && (/^\w+=/.test(w[0]) || KEYWORDS.has(w[0]))) w.shift();
    else if (w.length && Object.hasOwn(WRAPPERS, w[0])) {
      const name = w.shift();
      while (w.length && w[0].startsWith('-')) if (WRAPPERS[name].includes(w.shift())) w.shift();
      if (name === 'timeout' && w.length) w.shift();
    } else return w;
  }
}

/** Removes heredoc bodies (from the line after `<<TAG` to the line holding only TAG), keeping the rest of the `<<` line. */
function stripHeredocs(cmd) {
  const re = /(?<!<)<<(-?)[ \t]*(['"]?)([A-Za-z_][\w.-]*)\2/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(cmd))) {
    const nl = cmd.indexOf('\n', re.lastIndex);
    if (nl < 0) break;
    const tag = m[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const term = new RegExp(`^${m[1] ? '\\t*' : ''}${tag}[ \\t]*$`, 'm').exec(cmd.slice(nl + 1));
    const end = term ? nl + 1 + term.index + term[0].length : cmd.length;
    out += cmd.slice(last, m.index) + cmd.slice(re.lastIndex, nl);
    last = end;
    re.lastIndex = end;
  }
  return out + cmd.slice(last);
}

/** Index of the `)` that closes the `(` at `open`, skipping quoted text; -1 when unclosed. */
function matchParen(s, open) {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const c = s[k];
    if (c === "'" || c === '"') {
      const e = s.indexOf(c, k + 1);
      if (e < 0) return -1;
      k = e;
    } else if (c === '\\') k++;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k;
  }
  return -1;
}

function check(w) {
  if (w.includes('--no-verify')) reasons.add('--no-verify skips the repo hooks/gates');
  const tool = w[0].split('/').pop();

  if (tool === 'git') {
    const i = w.findIndex((x, k) => k > 0 && x === 'push');
    if (i > 0 && w.slice(1, i).every((x) => x.startsWith('-') || isGitOptValue(w, x))) checkPush(w, i);
  }
  if (tool === 'terraform' || tool === 'tofu' || tool === 'terragrunt') {
    const sub = w.slice(1).find((x) => !x.startsWith('-'));
    if (sub === 'apply' || sub === 'destroy') reasons.add(`${tool} ${sub} changes real infrastructure (the agent produces a saved plan and stops)`);
    if (w.some((x) => /^--?backend-config\b/.test(x) || /^--?reconfigure$/.test(x)))
      reasons.add(`${tool} -backend-config/-reconfigure can repoint state (the backend state picks the environment)`);
  }
  if (tool === 'npm' || tool === 'pnpm' || tool === 'yarn' || tool === 'bun') {
    const s = subIndex(w);
    const sub = w[s];
    const adds = tool === 'npm' ? ['install', 'i', 'add', 'isntall', 'in'] : tool === 'bun' ? ['add', 'install', 'i'] : ['add'];
    const pkgs = adds.includes(sub) ? pkgArgs(w, s) : [];
    if (pkgs.length) reasons.add(`${tool} ${sub} ${pkgs.join(' ')} adds a dependency (justify it in the PR)`);
  }
  if ((tool === 'flutter' || tool === 'dart') && w[1] === 'pub' && w[2] === 'add') reasons.add(`${tool} pub add adds a dependency (justify it in the PR)`);
}

function isGitOptValue(w, x) {
  const k = w.indexOf(x);
  return ['-C', '-c', '--git-dir', '--work-tree'].includes(w[k - 1]);
}

function checkPush(w, i) {
  const args = w.slice(i + 1);
  if (args.some((x) => x === '--all' || x === '--mirror')) {
    reasons.add('git push --all/--mirror can update develop/main');
    return;
  }
  const positional = args.filter((x, k) => !x.startsWith('-') && !['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(args[k - 1]));
  const refspecs = positional.slice(1); // first positional is the remote
  // The ref a refspec updates: its destination, or for a bare source the source itself (HEAD/@ = current branch).
  const dest = (r) => {
    const s = r.replace(/^\+/, '');
    if (s.includes(':')) return s.slice(s.indexOf(':') + 1);
    return s === 'HEAD' || s === '@' ? (currentBranch(w) ?? s) : s;
  };
  const hit = refspecs.map(dest).find((d) => PROTECTED.test(d));
  if (hit) {
    reasons.add(`git push targets ${hit.replace('refs/heads/', '')} (never push to develop/main directly; feature branch + PR)`);
    return;
  }
  if (!refspecs.length) {
    const branch = currentBranch(w);
    if (branch === 'develop' || branch === 'main') reasons.add(`git push from the ${branch} branch pushes ${branch} directly (feature branch + PR)`);
  }
}

function currentBranch(w) {
  const c = w.indexOf('-C');
  const base = input.cwd || process.cwd();
  const cwd = c > 0 ? resolve(base, w[c + 1]) : base;
  try {
    return execFileSync('git', ['-C', cwd, 'symbolic-ref', '--short', '-q', 'HEAD'], { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Index of the first non-flag word after the tool, skipping the values of value-taking flags. */
function subIndex(w) {
  for (let k = 1; k < w.length; k++) {
    if (!w[k].startsWith('-')) return k;
    if (NPM_VALUE_FLAGS.has(w[k])) k++;
  }
  return -1;
}

/** Package-name arguments after the install subcommand at index `s` (flags and their values skipped). */
function pkgArgs(w, s) {
  const out = [];
  for (let k = s + 1; k < w.length; k++) {
    const x = w[k];
    if (x.startsWith('-')) {
      if (NPM_VALUE_FLAGS.has(x)) k++;
      continue;
    }
    out.push(x);
  }
  return out;
}
