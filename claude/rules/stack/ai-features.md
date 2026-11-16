---
paths:
---

# AI features

Scope: any feature in a dk-coding repo that calls a large language model for extraction, chat or tool use. It follows the OWASP Top 10 for LLM Applications 2025 (LLM01 to LLM10). General security rules are in stack/security.md.

## Boundary

- The model client is a driven adapter behind a port. Model ids, prompts and inference parameters live in config or contract files, never inline in a use case.
- Model output is untrusted input (LLM05). Parse it with a bounded Zod schema before anything acts on it. If parsing fails, return a typed error or the documented fallback. Never make a best-effort guess.
- Never render model output as HTML, evaluate it, or use it to build a query, path, URL or key.
- Request structured output (a tool or JSON schema) and still validate it. Clamp lengths and numbers. Where the input allows, cross-check the extraction, for example that line items sum to the total.
- A change to a prompt or a model is a behaviour change, so it goes in a new unit version (stack/versioning.md). It must pass the benchmark below.

## Prompt injection and tools (LLM01, LLM06)

- User text and document content are data. Keep them in the user turn, delimited, and never concatenate them into system instructions.
- Each feature has a fixed allowlist of tools. When a tool executes, the server authorises it against the verified principal, the same way it authorises a direct request. The model never chooses the user id, the account or the scope.
- Tools are read-only by default. A change the model proposes goes back to the client as a proposal for the user to confirm. It then runs through the normal validated write path.
- Cap tool iterations per request, and cap the rows and bytes any tool can return.

## Data exposure (LLM02, LLM07)

- Send the model only the fields the task needs. Never put secrets, credentials, another user's data or storage keys in a prompt.
- Assume the system prompt can leak. It holds no secret and no authorisation logic.
- Never log prompts or outputs (stack/observability.md). Log the model id, token counts, latency and outcome code.
- Provider-side invocation logging and data-retention settings are recorded decisions in the security or contract document, never accepted defaults.

## Cost and abuse (LLM10)

- Meter every model call per user before the call: one conditional counter update against the plan's cap, failing closed (stack/data-and-migrations.md). Caps come from the plan data, never from literals (core/dry.md).
- Each AI feature has a kill switch, checked before the meter (stack/feature-flags.md).
- Every request bounds its input size, sets `max_tokens`, and has a timeout shorter than its caller's. Retries follow stack/errors-and-resilience.md.
- The mutation that triggers a model call takes an `Idempotency-Key` (stack/api-design.md), so a client retry replays the stored result instead of paying again.
- Cache deterministic results by content hash, so the same document is extracted once.
- Alarm on billed-call volume and spend (stack/observability.md).

## Quality (LLM09)

- A benchmark set gates every prompt or model change: real-shaped fixtures with no real personal data, each with its expected output. Record the score in the PR.
- Any number shown to the user comes from computed domain data, never from model text. The model writes the wording; the domain does the arithmetic.
