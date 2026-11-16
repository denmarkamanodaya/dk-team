# Hexagonal architecture (ports and adapters)

Scope: application code and Terraform in every repo. Strict in dk-coding repos; in older repos it applies to new modules when touched (definitions in `core/agent-conduct.md`).

## Layer map (dk-coding repos)

| Role | Web `src/` | Mobile `lib/` | Backend `src/` | Terraform |
|---|---|---|---|---|
| Domain, use cases, ports (pure) | `core/` | `core/` | `domain/`, `usecases/`, `ports/` | - |
| Driven adapters | `services/` | `data/`, `services/`, `platform/` | `adapters/` | `modules/<name>/v<N>/` |
| Driving adapters | `hooks/` | `features/` Notifiers | `handlers/` | - |
| UI | `components/`, `pages/`, `design/` | `features/` widgets, `design/` | - | - |
| Composition root | `app/` (+ `app/env.ts`) | `app/bootstrap.dart` | `composition/` (+ `env.ts`) | `stacks/<stack>/` via `roots/<stack>/`; `env/<stage>.*.tfvars` (run by `tf.sh`) injects stage data |
| Contracts | top-level `contracts/`: fixtures, golden tables and shared data every platform reads; which schema is authoritative: `core/dry.md` | | | |

## Dependency rule

- Dependencies point inward: UI -> driving adapter -> use case -> domain. Driven adapters depend on the core's ports. The core never imports an adapter, a framework, an SDK, a wire schema, `app/` or `composition/`.
- Pure layers import only their own layer, the layers inward of it (backend: `usecases/` -> `ports/` -> `domain/`), the shared kernel, the language core libraries (never `dart:io` or `dart:ui`), and `package:meta`.
- Enforced by dependency-cruiser plus `no-restricted-imports` (TS) and `test/architecture/import_rules_test.dart` (Dart). Never weaken these configs to pass.

## Ports

- The core owns every port. Declare it where it is used (`core/<area>/ports/`, backend `ports/`); never in `features/`, `services/` or beside its implementation.
- Driving port = the use-case input: a plain function or class taking its input value plus its driven ports (`deps`). Driven port = what the core needs from outside (`BudgetStore`, `Clock`, `PushSender`).
- Ports speak domain types only: no DTO, SDK type, `Response`, database row or vendor model in a signature.
- Name by role, with no `I` prefix. Adapters are `<Tech><Port>`: `DynamoItemStore`, `DriftBudgetStore`. Ports are never versioned (`stack/versioning.md`).

## Adapters translate at the boundary (anti-corruption)

- Driven adapters are the only code that calls HTTP clients, database drivers, SDKs, OS plugins, `fetch`, axios, dio, drift, Firebase or `@aws-sdk/*`.
- DTO mapping lives in the adapter. Parse the wire or database shape with its schema there, then map it to a domain type; map domain to DTO on the way out. Use cases never see a Zod wire schema or a row.
- Vendor models (store receipts, Firebase users, FX feeds, model output) are translated inside the adapter and never cross a port.
- The adapter catches SDK and HTTP exceptions and returns a typed failure with an `UPPER_SNAKE` code. A raw vendor exception never reaches the core. Error shapes: `stack/errors-and-resilience.md`.

## Driving adapters are thin

- A handler, hook or Notifier does three things: parse and validate input, call one use case, shape the result (envelope, state, view model).
- No `if` on business data, no key lookups, no tier or limit choices, no flag reads, no "then also call X". Those are use-case decisions. Branching on the result variant to shape the output is fine.
- UI calls only driving adapters; it never calls a service and never does money, date or permission math.

## Use cases

- Return a domain value or `Result<T, E>`. Never an HTTP status, `Response`, envelope, widget, `BuildContext` or framework state; the driving adapter maps the error code to those.
- No side effects in the core. Banned in `core/`, `domain/`, `usecases/`, `ports/` and `shared/` (tests and the redacting logger itself, `shared/log/` or `platform/log/`, exempt): `Date.now()`, argument-less `new Date()`, `DateTime.now()`, `Math.random()`, `Random()`, `crypto.randomUUID()`, `print`, `console.*`, `process.env`, `import.meta.env`, `fetch`, timers, file or network IO. Inject instead: time via `Clock`, ids and randomness via `IdGenerator`, config as values from the composition root, logs via a redacting logger port, IO via a driven port.

## Composition root

- One per deployable: web `app/`, mobile `app/bootstrap.dart`, one per Lambda in `composition/`, one Terraform stack per `stacks/<stack>/`.
- It is the only place that reads env (once, through Zod), builds SDK clients (once per cold start), constructs adapters, selects active versions and binds them to ports. No business decisions in it: no loops over data, no `if` other than "which adapter or version".
- Pure layers never import it. No service locator: never `getIt<X>()`, `container.resolve()` or a global registry. Driving adapters receive bound dependencies only through the framework's DI surface (React context provided by `app/`, Riverpod providers overridden in `bootstrap()`). Backend: a Lambda handler gets its wired use case only from its own `composition/` module; nothing else imports `composition/`.

## Modules

- A module (`core/<area>`, `usecases/<op>`, `features/<area>`) imports another module only through its pointer (`index.ts`, `current.dart`) or its ports file, never its `v<N>` files or internals. No import cycles.
- The shared kernel (money, time, ids, `Result`, errors) is named explicitly in the repo's `CLAUDE.md` and kept small. Anything else two areas share gets one owning area, and the other imports its pointer.

## Port contract suite

- Every driven port has an in-memory fake in test support and one contract suite: a function taking an adapter factory, run against the fake and against the real adapter (DynamoDB Local, a recorded HTTP adapter, an in-memory database).
- Use-case tests use the fake. The fake is trusted only because the same suite passes on the real adapter; a fake written inside one test proves nothing. Driving-adapter tests: `stack/testing.md`.

## Example

```ts
export interface BudgetStore { get(id: BudgetId): Promise<Result<Budget, BudgetError>> } // core/budgets/ports
export const remaining = (deps: { store: BudgetStore; clock: Clock }) =>               // core use case
  async (id: BudgetId): Promise<Result<Money, BudgetError>> => {
    const got = await deps.store.get(id);                                                // Err passes through
    return got.ok ? ok(remainingOf(got.value, deps.clock.now())) : got;                  // pure rule + Clock
  };
// services/budget-store/v1.ts: HttpBudgetStore parses the DTO with Zod, returns Budget or BUDGET_NOT_FOUND
// app/compose.ts:           export const getRemaining = remaining({ store: new HttpBudgetStore(http), clock: systemClock });
```

```dart
abstract interface class BudgetStore { Future<Result<Budget, BudgetError>> get(BudgetId id); } // core/budgets/ports
// data/budget_store/v1.dart: DriftBudgetStore maps the row to Budget and DriftException to BudgetError
// app/bootstrap.dart:        final remaining = Remaining(store: DriftBudgetStore(db), clock: const SystemClock());
```
