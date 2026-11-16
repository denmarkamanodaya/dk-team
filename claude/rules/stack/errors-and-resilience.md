---
paths:
---

# Errors and resilience

Scope: error types, `Result`, failure handling, timeouts and retries in TypeScript and Dart code of dk-coding repos. Reaches sessions through the dk-coding skill. Where errors are translated (adapters, at the port): `core/architecture-hexagonal.md`.

## Typed errors

- Every error is typed and carries a stable `UPPER_SNAKE` `code`. The code is the identifier callers switch on and logs record; the message is for humans and may change.
- Each code is defined once, in the contract (`contracts/` and its document), and imported or generated everywhere else (`core/dry.md`). A new code in a bump goes in `v<N+1>` (`stack/versioning.md`).
- Never throw a string, a bare `Error('...')` / `Exception('...')`, or a `Map`. Never use a nullable string as an outcome (`typedef Outcome = String?` is a defect); return a typed error.
- **TypeScript:** one error class, `AppError extends Error`, with `readonly code: ErrorCode` and optional `readonly details?: Readonly<Record<string, string | number>>`. A repo may name it for its domain. It lives in backend `shared/errors/` and web `core/errors/`. It carries no HTTP status: the core never knows the transport (`core/architecture-hexagonal.md`). `details` holds safe, bounded values only. Expected-failure variants are discriminated unions on `code`.
- **Dart (fixes the earlier text, which cannot compile):** Dart forbids extending a `sealed` class outside its own library, so the root is `abstract`, and each area declares its own `sealed` family in its own library. Consume families with an exhaustive `switch` (`stack/mobile-flutter.md`).

```dart
// core/errors/app_error.dart (the repo may name it for the app)
abstract class AppError implements Exception { String get code; String get message; }
// core/periods/period_error.dart
sealed class PeriodError extends AppError { /* final subtypes per case */ }
```

## One `Result<T, E>` everywhere (ruling C5)

- Expected failures return `Result<T, E>` with two variants, `Ok(value)` and `Err(error)`, in both languages. There is no single-parameter `Result<T>`. Hand-rolled (about 20 lines), no dependency: backend `shared/result/`, web `core/errors/result.ts`, Dart `core/errors/result.dart`.
- Ports return `Result` for failures the caller must handle. Throw only for programmer errors and truly unexpected states.
- Use cases return domain values or `Result`, never an HTTP status, a response object or a widget (`core/architecture-hexagonal.md`).
- Handlers (driving adapters) are the only code that maps a typed error to the wire error envelope (`stack/api-design.md`) and to an HTTP status, using the contract's code-to-status table. Anything else becomes `INTERNAL`, with the `requestId` logged and no stack trace on the wire.

## Never swallow

A `catch` does exactly one of three things:

1. **Recovers** explicitly, with the recovery visible in code and covered by a test.
2. **Translates** to a typed error and returns or throws it (adapters do this at the boundary; keep the original as `cause` for logs only).
3. **Rethrows.**

Log-and-continue, an empty `catch`, `catch (_) {}`, `.catch(() => undefined)` and `on Object catch` without rethrow are defects. Never catch broader than the failure you can handle.

## Fail closed

- Any failure to resolve identity, tenant, permission, quota, plan or configuration rejects the request. Never default to allow, to "unlimited", or to a guessed value when a lookup errors or returns nothing. Why: an error path that grants access is the access-control bug.
- Config and secrets are shape-checked at cold start or app start; a missing or empty value stops the process. A parameter that exists is not a parameter with a value. Authorisation itself: `stack/security.md`.

## Timeouts

- Every IO call has an explicit timeout, shorter than its caller's remaining budget (a Lambda's remaining time, an API Gateway integration limit, a UI wait). TS passes an `AbortSignal` down the chain; Dart takes the timeout as an injected value.
- Never rely on a library or SDK default timeout. State the number where the client is built (composition root).

## Retries

- Retry only idempotent operations, or operations made idempotent by a key (`stack/api-design.md`).
- Capped exponential backoff with full jitter and a maximum attempt count; the total retry time fits inside the caller's timeout.
- Decide from the error code's documented client action (`stack/api-design.md`), not from the status class. By default retry 408, 429, 502, 503 and 504, plus any code the contract documents as "retry" (such as the idempotency in-progress conflict). Honour `Retry-After` when present, still capped; otherwise use the backoff above.
- Never retry any other 4xx: the request is wrong and a retry repeats it.
- Never retry inside a retry: one layer owns retries (usually the adapter), the others pass the error up.
- After the last attempt, return the typed error (for example `UPSTREAM_UNAVAILABLE`); never a silent fallback value.

## Asynchronous work

- Every asynchronously invoked Lambda has a dead-letter queue or an on-failure destination, and an alarm on it (`stack/observability.md`).
- SQS and DynamoDB Streams handlers report partial batch failures (`batchItemFailures`), so one bad record never fails or replays the whole batch.
- Async handlers are idempotent because delivery is at least once (`stack/backend-lambda.md`).
- TS: no floating promise (`no-floating-promises` is an error). Dart Future rules: `stack/mobile-flutter.md`.
