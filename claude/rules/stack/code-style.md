---
paths:
---

# Code style: naming, doc comments, unit size, formatting

Scope: TypeScript, Dart and Terraform source in dk-coding repos. Reaches sessions through the dk-coding skill. Where a linter or formatter already enforces a rule, this file names the tool in one line; never disable the tool to get past it (`core/agent-conduct.md`).

## Naming

| Thing | Dart | TypeScript (web + backend) | Terraform |
|---|---|---|---|
| Function / method | `lowerCamelCase`, verb first | same | n/a |
| Boolean | `is` / `has` / `can` / `should` prefix | same | `enable_<x>` |
| Variable, parameter | `lowerCamelCase` | same | `snake_case` |
| Class, type, enum | `UpperCamelCase` | same; React components `UpperCamelCase` | n/a |
| Constant | `lowerCamelCase`, no prefix | `camelCase`; `UPPER_SNAKE` only for wire / env constants | `locals` `snake_case` |
| Enum member | `lowerCamelCase` | string-literal union; `UPPER_SNAKE` only on the wire | n/a |
| Unit directory | `snake_case/` | `kebab-case/` (hook unit `use-<thing>/` exporting `useThing`) | `kebab-case/` |
| Non-versioned file | `snake_case.dart` | `kebab-case.ts`; component file `UpperCamelCase.tsx` | `snake_case.tf`, one per feature |
| Port | `abstract interface class XRepository`, no `I` prefix | `interface XRepository` | n/a |
| Adapter | `<Tech><Port>`: `DriftXRepository` | `AxiosXGateway`, `DynamoItemStore` | module `<service>-<purpose>` |
| Use case | verb phrase: `RecordRepayment` | same | n/a |
| CSS (web) | n/a | one `<Component>.css` per component; classes `component-name__part--state`; custom properties `--<group>-<name>`, defined only in `design/tokens.css` | n/a |
| Error code, env key, wire constant | `UPPER_SNAKE` | `UPPER_SNAKE` | n/a |
| Resource / variable / output | n/a | n/a | local name = role (`aws_lambda_function.sync`; `this` only in a single-resource module); variables and outputs are `snake_case` nouns |
| AWS name | n/a | n/a | `local.name_prefix = "<app>-${var.stage}"` + role; never a literal prefix |

- `UPPER_SNAKE` is reserved for error codes, env keys and wire constants. Nothing else uses it.
- The version lives in the path, never the identifier (`stack/versioning.md`).
- One word per concept, recorded in `docs/glossary.md`. A new noun is added there in the same PR. Why: two words for one concept read as two concepts.
- Test and branch names: `stack/testing.md`, `stack/git-and-pr.md`. Other CSS rules: `stack/web-react.md`.

## Doc comments

Enforced by `public_member_api_docs` (Dart), `eslint-plugin-jsdoc` (TS), `terraform_documented_*` in tflint.

- **Dart `///`:** on every public declaration in `core/`, `services/`, `platform/`, `data/`, and on public widgets, Notifiers and providers. First line is one sentence, third person, ends with a period, does not echo the symbol name. Use `[square-bracket]` references.
- **TS JSDoc:** on every exported function, class, type, constant, hook and component. Tags: `@param` and `@returns` always; `@throws` only when the function can throw (programmer errors; expected failures are a `Result`, `stack/errors-and-resilience.md`). No `{type}` braces (types live in the signature). Use `@see` for the fixture or the mirrored implementation, and `@deprecated` with the replacement and the removal PR. React: document props on the props type, one line per prop.
- **Both:** state units and ranges (`amountMinor` in minor units; ISO weekday 1–7), every throw or `Result` variant, and the invariant, not the obvious. Versioned units add the version block (`stack/versioning.md`).
- **File header:** a short `//` (or `#`) block saying what the file is, which plan document asked for it, and which contract it implements.
- **Terraform:** every `variable` and `output` has `description` and `type`; `validation` for finite sets; `sensitive` for secrets; `nullable = false` by default. Each module version has a README with a hand-written head above a `terraform-docs` block (`--output-check` in CI).
- Comments say why, never what. No commented-out code. A TODO is `// TODO(#<issue>)`, never a bare TODO.

```ts
/** Gets the window. */                       // Don't: echoes the name, no unit, no failure.
/**                                           // Do: what, units, failure.
 * Returns the half-open budget window `[start, end)` that contains `anchor`.
 * @param anchor - Local date `yyyy-mm-dd`.
 * @returns The window as two local dates, `end` exclusive.
 * @throws RangeError when `weekStart` is outside 1–7.
 */
```

## Unit size

Enforced by ESLint (`max-lines-per-function`, `max-lines`, `max-params`, `complexity`) and the Dart metrics lint (`dart_code_linter`).

| Limit | Value |
|---|---|
| Function | ≤ 40 lines (React components ≤ 80) |
| File | ≤ 300 lines |
| Positional parameters | ≤ 4 |
| Cyclomatic complexity | ≤ 10 |
| Nesting depth (Dart metrics) | ≤ 4 |

- A "line" is a non-blank, non-comment line: ESLint `max-lines` / `max-lines-per-function` with `skipBlankLines: true` and `skipComments: true`; Dart `source-lines-of-code`. A repo test that counts raw lines is stricter; obey it until it is aligned, and never delete doc comments to pass it.
- At the cap, split the unit by responsibility. Never squeeze to fit: no joining statements onto one line, no deleting doc comments, no cryptic short names. Why: a file sitting at exactly 300 lines usually means the cap was gamed, not met.

## Formatting (ruling C8)

- Formatter output is law: `dart format`, Prettier, `terraform fmt`. CI runs each with its check flag (`dart format --set-exit-if-changed`, `prettier --check`, `terraform fmt -check -recursive`).
- Line length is 100 everywhere: Prettier `printWidth: 100`, `singleQuote: true`, `trailingComma: 'all'`; Dart `formatter: page_width: 100`.
- Never hand-format against the formatter or argue with its output. Run it on every file you touch, before tests.
