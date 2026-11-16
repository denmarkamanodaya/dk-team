---
paths:
---

# Data and migrations

Scope: covers stored data in dk-coding repos: DynamoDB items and keys, the on-device drift (SQLite) database, schema evolution and backfills.

Elsewhere: table protection (PITR, deletion protection, `prevent_destroy`) is in stack/terraform.md; the key-constants source is in core/dry.md; at-least-once handlers are in stack/backend-lambda.md.

## Keys and access patterns

- Derive keys and indexes from the access patterns listed in the contract document. Every request-path read is a `GetItem`, `BatchGetItem` or `Query` on a key or an index. Never use `Scan` on a request path. Why: a scan's cost and latency grow with the table, not with the user.
- Every query is bounded by a key range and a `Limit`, and it paginates (lists in stack/api-design.md).
- Build keys only through the keys unit; never write a key literal at a call site (core/dry.md).

## Invariants and concurrency

- Enforce an invariant in the write itself, with a `ConditionExpression` (`attribute_not_exists`, version equality, a counter bound) or a `TransactWriteItems`. Never read, check, then write. Why: two concurrent requests both pass the read.
- Every mutable item carries an integer `version`. A write is conditional on the version it read (optimistic locking). A failed condition becomes a typed conflict, never a retry loop that overwrites.
- A quota or counter is one conditional `UpdateItem` (`ADD` with the bound in the condition) that runs before the work it meters.
- Keep each transaction under the DynamoDB per-transaction item limit (100 items as of 2026-10-04; check the AWS quotas page before relying on it). Design batches so they cannot exceed it.
- Replaying the same change id leaves the same stored state.

## Schema evolution

- Every stored item or row with a document shape carries an integer `schemaVersion`. Writers write version N; readers accept N and N-1.
- Change a shape by expand, migrate, contract. Each step is its own PR and deploy, and each is rollback-safe:
  1. **Expand:** add the new field, index or table. Readers accept both shapes, and writers write both.
  2. **Migrate:** backfill the old items, then switch reads to the new shape.
  3. **Contract:** stop writing the old shape. Remove it only when no reader still needs it, including the oldest supported client build.
- Never rename or retype a stored attribute in place. Never remove a field in the same deploy that stops reading it.
- A versioned unit whose old version reads stored data is not removed while that data exists (removal rule: stack/versioning.md).
- TTLs and retention follow the contract document. Deleting user data is a tested job, never an ad-hoc script.

## Backfills

- A backfill is repo code, with a use case, ports and tests. Never a console session or a one-off CLI loop.
- It is idempotent (safe to rerun), resumable (it persists a checkpoint cursor) and rate-limited (bounded concurrency and write rate). It has a dry-run mode that reports counts.
- It runs on dev first, with before and after counts in the PR. The agent never runs a backfill against prod. Prod runs go through the owner-approved pipeline path.

## On-device database (drift)

- Every schema change bumps `schemaVersion`, adds a migration step, and commits the exported schema snapshot (`drift_schemas/drift_schema_v<N>.json`).
- A migration test (drift's schema verifier) starts from every shipped schema version, migrates to the current one, and asserts that user data survives.
- A migration never silently drops user data. A destructive step copies the data into the new table first.
- Data that exists only on the device (outbox, local settings) is migrated with the same care as server data. A reinstall cannot restore it.
