---
name: dk-new-unit
description: Use when adding a new behavioural unit (function, use case, domain rule, service, adapter, hook, Notifier, handler, contract schema or Terraform module) in a dk-coding repo. Scaffolds v1, its test, the pointer and the pointer-test line from the dk-coding templates. Refuses ports, interfaces, value types, DTOs and UI files, which are plain files and never versioned.
argument-hint: "<layer>/<area>/<unit-name> [ts|dart|tf]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash(date *)
  - Bash(node @DK_HOME@/skills/dk-coding/scripts/*)
  - Bash(npm run check:versions)
  - Bash(fvm flutter test *)
  - Bash(npx vitest run *)
  - Bash(npx jest *)
---

# dk-new-unit: scaffold a versioned unit

Scope: creates one new unit directory in a dk-coding repo. Arguments: `$ARGUMENTS` (path `$0`, optional language `$1`).

Rules this skill applies, by path (read them if they are not already in context):
`@DK_TEAM@/rules/stack/versioning.md`, `@DK_TEAM@/rules/core/dry.md`, `@DK_TEAM@/rules/stack/code-style.md`, `@DK_TEAM@/rules/core/agent-conduct.md`.

## 1. Refuse first

Stop with a one-line reason, and create nothing, when any of these hold:

| Case | Say instead |
|---|---|
| No `$0` given | ask for `<layer>/<area>/<unit-name>` |
| The repo or package is not a dk-coding repo (see "Where these rules apply" in `core/agent-conduct.md`) | older repos follow their own `CLAUDE.md`; ask the owner before introducing versioned units there |
| A port, interface, value type or DTO (path under `ports/`, a `*_ports.*` or `*-port.*` name, or the caller describes only types) | ruling C11: make it a plain file (`ports/<name>.ts`, Dart `core/<area>/ports/<name>.dart`), no pointer, no runtime test |
| UI: component, page, widget, screen, CSS, tokens | ruling C2: edit or create in place; screenshots and goldens cover it |
| The unit directory already exists | edit `v1` in place if it never shipped; otherwise the owner runs `/dk-bump` |

## 2. Search before creating

Grep the repo for the unit name, its verb and noun, and the shared homes in the placement table of `core/dry.md`. If a unit already does this job, stop and report its path instead of creating a second one.

## 3. Place and name it

- Layer and area must exist in the layer map of the dk-coding skill; the home for shared rules comes from the placement table in `core/dry.md`. Never `utils`, `helpers`, `misc` or `common`.
- Directory name and symbol name: the "Unit directory" row of the naming table in `stack/code-style.md`. The version lives only in the path.
- Language: `$1` if given; otherwise Dart when the package has `pubspec.yaml`, Terraform when the path is under `modules/`, else TypeScript.

## 4. Write the files from the template

Read exactly one template and follow it file by file:

- `@DK_HOME@/skills/dk-coding/references/templates/unit-typescript.md`
- `@DK_HOME@/skills/dk-coding/references/templates/unit-dart.md`
- `@DK_HOME@/skills/dk-coding/references/templates/unit-terraform.md`

- Fill `@since` / `Since:` with today's date from `date +%F`, date only (ruling C12).
- The doc comment states the real behaviour, inputs with units, and returns or errors. If the request does not say what the unit does, ask one question before writing; never ship placeholder text.
- Write a first test that states the rule in a sentence and fails until the body is implemented.
- Pointer-test line: add one assertion to the layer's existing pointer test. If the repo splits Dart pointer tests per layer (`pointers_<layer>_test.dart`), use that file. Create the file only when none exists, at the path the template names.
- Terraform: the caller line in the stack is the pointer; add it only if the request names the stack.

## 5. Verify and report

- Run the package's `npm run check:versions` (or the skill script with `--config check-versions.json`), and the new test. Dart: `fvm flutter test` on the new test file and on `test/architecture/`.
- Report: files created (paths), each command with its exit code and last lines, and what was only traced. Never commit.
