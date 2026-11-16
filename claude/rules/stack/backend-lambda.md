---
paths:
---

# Backend (TypeScript on AWS Lambda)

Scope: serverless TypeScript backends in dk-coding repos only. In older repos, their own CLAUDE.md governs.

Layer map (`handlers/`, `domain/`, `usecases/`, `ports/`, `adapters/`, `contracts/`, `shared/`, `composition/`): see core/architecture-hexagonal.md. Errors, `Result`, timeouts, retries, DLQs and partial batch failures: see stack/errors-and-resilience.md. Error envelope, idempotency keys and pagination: see stack/api-design.md. Logs, traces and metrics: see stack/observability.md.

## Toolchain (gates; never disable a rule to go green)

- Current LTS `nodejs` runtime, ESM, one esbuild bundle per Lambda.
- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `moduleResolution: bundler`, `isolatedModules`.
- ESLint 9 flat: `strictTypeChecked` + `stylisticTypeChecked`, `jsdoc`, `import-x`. ESLint enforces `no-explicit-any`, `no-floating-promises`, `no-console`, the `@aws-sdk/*` import ban outside `adapters/` and `composition/`, and the direct `v<N>` import ban.
- Prettier, `dependency-cruiser`, `knip`, jscpd (core/dry.md), jest or vitest with coverage thresholds, DynamoDB Local for integration tests.
- Repo guards: `check:versions`; `check:env-scope` (each Lambda lists the env keys its bundle reads); `check:iam-scope` (every IAM action is checked against the real AWS action list; verify an action exists before adding it); `check:zod-max`.

## TypeScript rules

- Named exports. Barrels: stack/versioning.md.
- `interface` for ports and object shapes, `type` for unions; no `enum` (use string-literal unions).
- `readonly` properties and `ReadonlyArray` parameters; `unknown` at every boundary until a Zod schema narrows it.
- `satisfies` for literal shapes.
- `async`/`await` only; `Promise.all` for independent IO; pass an `AbortSignal` down every IO chain.
- Zod on every wire shape, env value and parameter-store value, with `.max()` on every string and array (`check:zod-max` enforces it).

## Handlers

- A handler follows the driving-adapter rule in core/architecture-hexagonal.md; its parse step is the contract Zod schema for that event.
- Error mapping to the envelope: stack/errors-and-resilience.md.
- Treat every event source as at-least-once (SQS, DynamoDB Streams, EventBridge, Scheduler, async invoke, client retries). Make each handler idempotent: dedupe on a stable event or idempotency key with a conditional write, so a replay returns the stored outcome instead of repeating the side effect. Why: a duplicate delivery that re-runs a billed or user-visible action is a live bug, not a theory.
- Check the payload size before you send. Measure the serialised bytes against the smallest cap on the path (API Gateway WebSocket message 128 KB, EventBridge entry 1 MB in most commercial regions since 2026-01-29 and 256 KB in the rest, synchronous Lambda response 6 MB; confirm current quotas in the AWS docs) and page or split before the send. Never let an oversized send fail silently. Why: an over-cap send fails as a bodyless error that looks unrelated.

## Composition and cold start

- `composition/` builds SDK clients, adapters and config once per cold start, at module scope, and exports the wired use case. Handlers never construct a client per invocation.
- The env schema in `composition/env.ts` (core/dry.md) fails fast at cold start on a missing or malformed key.
- Secrets come from SSM parameter names passed by Terraform (stack/terraform.md). Shape check and fail-closed start: stack/errors-and-resilience.md.
- `Clock`, `IdGenerator` and SDK clients reach use cases through `deps`; singletons exist only in `composition/`.
- Keep the bundle small: import per-service `@aws-sdk/client-*` packages, never a whole SDK; lazy-load a client only a rare path needs. Why: bundle size is cold-start time on every scale-out.
- Powertools for AWS Lambda (Logger, Tracer, Metrics, Idempotency) is allowed only behind ports, imported by adapters and `composition/`. Adding it is a new dependency: ask first (core/agent-conduct.md, stack/supply-chain.md).
- Log only through the redacting structured-JSON logger in `shared/log/`.
