---
paths:
---

# API design

Scope: wire contracts between clients and backends in dk-coding repos: routes, shapes, the error envelope, evolution, idempotency, updates and lists.

Code versions (`v<N>` files) are a separate thing from wire versions (stack/versioning.md). Error types and the code-to-status table: stack/errors-and-resilience.md. Size caps per transport: stack/backend-lambda.md.

## Contract first

- A route, header, field, error code or limit exists only once it is written in the repo's contract source (the contract document plus `contracts/` schemas and fixtures). Server and client tests consume the same fixture bytes (core/dry.md).
- Every request and response has a Zod schema and at least one fixture. The server parses each request with the schema; the client parses each response with it.
- Every error uses one envelope: `{"error":{"code","message","details","requestId"}}`. For each code, the contract documents its status and the client's action: retry, fix the request, resync, or tell the user.
- A client must be able to choose between retrying and stopping from the code alone. Never give one status two client actions.
- Every client sends its build number. The server can answer a documented "upgrade required" code below a minimum build, so an old mobile build can be fenced without a store review.

## Evolution

- Within a wire version, change is additive only: a new optional field, a new route, or a new enum value that clients already tolerate. Removing, renaming, retyping or tightening anything needs a new wire version: a new route prefix plus a new contract directory and fixtures. Both versions stay live until the minimum-build gate retires the old one.
- Clients are tolerant readers. They ignore unknown response fields and map an unknown enum value to an explicit `unknown` branch; they never crash on one.
- Servers parse requests strictly (stack/security.md). So deploy the server side of a new request field before any client sends it.
- Each optional field states whether it is omitted or set to `null` when it has no value. Never leave it ambiguous.

## Idempotency

- Every mutation that is not naturally idempotent accepts an `Idempotency-Key` header. The client generates one key per user intent (a ULID or UUID) and reuses it on every retry. This follows the IETF httpapi `Idempotency-Key` header draft, which is still a draft, not an RFC, as of 2026-10-04.
- Before doing the work, the server claims the key with a conditional write. It stores the outcome (status plus a size-bounded body) with a TTL, and returns that stored outcome for any repeat.
  - A repeat that arrives while the first request is still running gets a documented conflict code with `Retry-After`.
  - The same key with a different body is rejected.
- Record the outcome independently of sending the response. Why: in an earlier system, an oversized acknowledgement skipped the outcome write and every retry was delivered twice.
- Where a design can be idempotent by construction (a PUT to a client-generated id, or a write conditional on a version), use it. Event-driven handlers: stack/backend-lambda.md.

## Updates and concurrency

- Updates are partial: only the fields sent change. Full replacement is only for operations that are truly "replace the whole resource". Why: in an earlier system, a full-item save from a client with a partial view silently destroyed every field it omitted.
- A write carries the version (or `If-Match` ETag) it was based on. A stale write gets a typed conflict; it never silently overwrites newer data (stack/data-and-migrations.md).

## Lists

- Every list is bounded:
  - an opaque cursor, which clients store and echo but never parse or build;
  - a default and a maximum page size;
  - a byte budget per page that stays well below the smallest transport cap on the path.
  Why: in an earlier system, an unbounded list outgrew a frame cap and failed in production with an opaque error.
- Order is stable and total (tie-break on id), so a cursor never skips or repeats an item.

## Wire formats

- Instants, local dates and money use the formats in stack/time-money-i18n.md.
- Ids are strings on the wire, even numeric ones. Field names are `camelCase`. Enum values are documented strings. Error codes and wire constants are `UPPER_SNAKE`.
- Rate-limited, disabled and read-only responses carry a `Retry-After` header.
