---
paths:
---

# Security

Scope: application security for backend and app code in dk-coding repos, against OWASP Top 10:2025 and OWASP ASVS 5.0.0 Level 2 (released 2025-05-30).

Elsewhere: fail-closed error policy in stack/errors-and-resilience.md; IAM, SSM plumbing and `trivy` in stack/terraform.md; mobile storage and MASVS in stack/mobile-flutter.md; dependencies and CI in stack/supply-chain.md; LLM features in stack/ai-features.md; log redaction in stack/observability.md.

## Access control (A01, which now includes SSRF)

- Authorize in the use case and deny by default. The use case receives the verified principal and checks ownership or permission before it reads or writes. Why: a check that lives only in the handler is skipped by the next driving adapter (queue worker, job, scheduler).
- Take the user id, and any account or tenant id, from the verified token claims the authorizer passes in. Never take it from the body, query, path or a client-set header.
  Do: `const uid = principal.uid;` Don't: `const uid = body.userId;`
- Scope every storage key and query by that id: the partition key starts with the owner. A read that can return another owner's item is a defect even if no screen asks for it.
- The server builds object-storage keys from the principal plus a server-generated id. Reject client-supplied keys or paths. Presigned URLs pin the exact key, content type and maximum size, with the shortest workable expiry.
- When outbound HTTP has a URL that any input can influence, check it against a host allowlist held in config. Don't follow redirects to hosts off the list.

## Input and injection (A05)

- Validate every input at the boundary with a bounded Zod schema: `.max()` on every string and array, integer ranges on numbers, `.strict()` objects on requests. Check the raw byte length before `JSON.parse`. Why: an unbounded field is a cost and denial-of-service lever.
- Never build a query, expression, shell command, file path or HTML from strings. Use parameterised expressions (DynamoDB `ExpressionAttributeNames`/`Values`), argument arrays and typed builders. Never use `eval`, `new Function`, `innerHTML` or `dangerouslySetInnerHTML`.
- On the client, deep links, push payloads, shared files and clipboard content are untrusted input too.

## Secrets, authentication and crypto (A04, A07)

- Client bundles and app binaries are public. Anything in `VITE_*`, `--dart-define`, app assets or a web bundle is an identifier, never a secret. Keep secrets out of source, tests, fixtures and logs.
- Server secrets come from the parameter store at cold start (plumbing: stack/terraform.md; start-up check: stack/errors-and-resilience.md).
- Verify tokens fully: signature, issuer, audience, expiry and the expected identity-provider project. Never accept a token you only decoded.
- Compare signatures, MACs and token hashes in constant time (`crypto.timingSafeEqual`). For long-lived tokens you issue, store only a hash.
- Use platform crypto (Node `crypto`, OS keystores). Never hand-roll primitives or reuse a nonce or IV.

## Exceptional conditions (A10)

- Lookups for identity, ownership, entitlement and quota fail closed, as stack/errors-and-resilience.md defines. Write a test for the thrown-lookup path, not only the "not found" path.
- Error responses carry the envelope code and `requestId` only (stack/api-design.md). Never include a stack trace, an SDK message, a storage key or another owner's id.

## Configuration (A02)

- CORS lists the exact origins per stage, plus methods and headers. Never combine `*` with credentials.
- In prod, debug routes, verbose errors and test-only switches are off by construction: the composition root refuses them for the prod stage. Convention alone is not enough.
- Rate-limit every public route and every billed hop per principal, and answer with the documented error code.

## Security logging and alerting (A09)

- Log every security event as one structured line with `requestId`, the principal id (hashed when unauthenticated), the route and a reason code. Security events are: auth failure, permission denied, ownership mismatch, rate-limit or quota refusal, and a rejected signature.
- Each security event also increments a metric, and an alarm with a subscriber watches it (stack/observability.md).

## Review questions

1. Where does this code get the owner id: from the token or from the request?
2. Is every key and query scoped to the owner?
3. Does every input have an upper bound?
4. What does the client see when the auth or ownership lookup throws?
5. If someone extracted this client-side value, could they abuse it?
