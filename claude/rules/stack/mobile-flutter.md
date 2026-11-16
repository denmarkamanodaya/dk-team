---
paths:
---

# Mobile (Flutter / Dart)

Scope: Flutter apps in dk-coding repos only. Never apply these rules to any older repo; its own CLAUDE.md governs it.

Layer map (`core/`, `data/`, `services/`, `platform/`, `features/`, `design/`, `app/`): see core/architecture-hexagonal.md. Naming, doc comments, unit size, formatter: see stack/code-style.md. Errors and `Result`: see stack/errors-and-resilience.md. Which units are versioned: see stack/versioning.md.

## Toolchain (gates; never add `// ignore:` to go green)

- Flutter through fvm, SDK pinned in `.fvmrc`; run every command as `fvm flutter ...` / `fvm dart ...`.
- `analysis_options.yaml` includes `package:very_good_analysis`, strict casts, inference and raw types, `avoid_print: error`, `public_member_api_docs: true` (page width: stack/code-style.md). The analyzer enforces these.
- Metrics lint (`dart_code_linter`) enforces complexity, function, parameter, nesting and file limits; the numbers are in stack/code-style.md.
- Architecture gates: `test/architecture/import_rules_test.dart` (layering) and `versions_test.dart` (versioned units).
- Code generation only for the database layer (drift). No `freezed`, `json_serializable` or `riverpod_generator`. Why: generated models hide the mapping that the boundary must own.

## Dart rules

- `final` by default; `const` constructors and widgets wherever possible.
- Sealed classes with an exhaustive `switch`; never a `default:` branch on a sealed type. Why: a new variant must break the build, not fall through.
- Records for small returns; promote to a class once used in more than two places.
- Value objects are immutable with `==`, `hashCode`, `toString`, `copyWith`. Money is `Money(amountMinor, currency)` (stack/time-money-i18n.md).
- No `dynamic`; `as` only inside adapters; no bare `!`.
- Named parameters beyond two positionals.
- Await every `Future` or wrap it in `unawaited(...)`; no `.then` chains; timeouts are injected, never hard-coded.
- Log through `platform/log/` (redacting); time through `Clock`; ids through `IdGenerator`.
- User-facing strings live in `features/<area>/strings.dart` or ARB files, never inline in widgets.

## Widgets and screens

- One public widget per file; `build()` at most 60 lines; extract named private widgets, never `Widget`-returning helper methods.
- No colour, radius, spacing or text-style literals outside `design/`.
- Every interactive widget has a semantics label and a hit target of at least 44 logical pixels.
- Navigate only through typed route helpers; never build route strings by hand.
- Screen tests pump at 390x844, at text scales `[1.0, 1.3, 2.0]`, with the real brand font loaded (goldens: stack/testing.md).

## Security and privacy (OWASP MASVS v2.1)

- STORAGE: tokens, keys and refresh secrets go only in Keychain/Keystore through `flutter_secure_storage`. Never in shared preferences, drift tables, files, logs or crash reports.
- PLATFORM: screens that show sensitive data are hidden from the app-switcher snapshot.
- AUTH: a biometric unlock releases a Keychain/Keystore key through a crypto operation (key access gated on user authentication). Never gate on the bare boolean that a biometric prompt returns.
- NETWORK: HTTPS only; keep iOS App Transport Security on and Android cleartext traffic off. Certificate pinning is a recorded decision (an ADR in the repo's decisions folder), never an ad-hoc addition.
- PLATFORM: deep-link and push payload parameters are untrusted input; parse them with a typed schema before routing, and reject unknown hosts and paths.
- CODE / RESILIENCE: release builds use `--obfuscate --split-debug-info=<dir>`; upload the symbol files for crash symbolication and never ship them in the bundle.
- PRIVACY: collect the minimum. Every permission has a specific purpose string (`NS...UsageDescription`, Android rationale) and a tested denial path that keeps the app usable.
- Secrets in `--dart-define` and other client-side values are public: see stack/security.md.
