---
name: dk-dry
description: Use when asked to audit duplication in a repo or package ("find duplicates", "is this DRY", "what should we extract", before a refactor). Runs the repo-wide dry-gate, hunts knowledge copies that text tools miss, and sorts every finding into extract (with a target path), leave (with a reason) or exempt. Reports only; never edits.
argument-hint: "[package-or-dir, default: every package in the repo]"
context: fork
agent: dk-reviewer
background: false
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git rev-parse *)
  - Bash(git ls-files *)
  - Bash(node @DK_HOME@/skills/dk-coding/scripts/*)
  - Bash(npm run jscpd)
---

# dk-dry: duplication report

Scope: `$ARGUMENTS` if given, otherwise every package in the repo where this session runs. Read-only: follow the "Read-only means" section of your agent definition. The rules are in `@DK_TEAM@/rules/core/dry.md`; read it now if it is not already in context, and classify only by it.

## 1. Strictness

Apply "Where these rules apply" in `@DK_TEAM@/rules/core/agent-conduct.md`. In an older repo, report findings but mark extraction as "when the module is next touched", and use the shared location that repo's `CLAUDE.md` names.

## 2. Text clones

- For each package, run `node @DK_HOME@/skills/dk-coding/scripts/dry-gate.mjs --root <pkg> --json` (usage and defaults are in its header). Record the command, exit code, clone count and the `exempt` pairs.
- `dry-gate: jscpd not found — skipped` on stderr exits 0 but means nothing was scanned; report the package as not run.
- If the script is missing, run the package's own jscpd script and drop version pairs of one unit by hand (exemption 2), saying so in the report.

## 3. Knowledge copies (the gate cannot see these)

Sweep production code for facts written in more than one place. For each kind in the "Knowledge first" table of `core/dry.md` (storage keys and sort-key prefixes, error codes, env keys, design token values, routes, plan limits, wire shapes, cross-language rules), plus repeated regexes and magic numbers:

1. Grep for literal occurrences (for example `'ENT#'`, `'QUOTA_EXCEEDED'`, `process.env.`, hex colours, `/v1/` paths).
2. Find the authoritative source the table names. A copy that does not import, generate from, or get tested against that source is a finding.
3. A fact present in two languages without a generator that has a `--check` mode is a finding.
4. Hand-written types that mirror a Zod schema instead of `z.infer` are a finding.

## 4. Classify every finding

Use the same-reason-to-change test in `core/dry.md`.

| Verdict | When | Report |
|---|---|---|
| Extract | both copies encode the same knowledge and would change together | target path from the placement table in `core/dry.md`; versioned unit if it is a business rule or a shipped helper whose behaviour would change |
| Leave | copies look alike but change for different reasons | both reasons, and the `jscpd:ignore` reason comment it needs if the gate flags it |
| Exempt | `v<N>`/`v<N+1>` of one unit, or DAMP test setup | which exemption |

Never propose merging two behaviours behind a boolean or mode parameter; propose the split instead.

## 5. Report

First line: `<n> to extract, <m> to leave, <k> exempt` for the scope.

| # | Kind (code / knowledge) | Locations (`file:line`, all copies) | Verdict | Target path or reason | Rule (`core/dry.md` section) |
|---|---|---|---|---|---|

Then the gate results (`Package | Command | Exit | Clones | Exempted pairs`), then **Ran** and **Traced only**. Name rule sections; never paste rule text.
