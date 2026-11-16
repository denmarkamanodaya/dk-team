---
paths:
---

# Feature flags

Scope: flags, kill switches, operating modes and entitlements that turn behaviour on or off in dk-coding repos.

The integer switch that selects between code versions is covered by stack/versioning.md, not here.

## Kinds

| Kind | Purpose | Lifetime | Prod-safe default |
|---|---|---|---|
| Release flag | Ship dark, then enable per stage | Removed within 2 releases of full enablement | off |
| Kill switch | Stop a feature or billed hop in prod without a deploy | Permanent | Disengaged, but changeable without a deploy |
| Operating mode | Read-only or maintenance | Permanent | Normal |
| Enforcement control | Quota or security enforcement | Permanent | Enforcing; prod rejects any other value |
| Entitlement | What a plan or tier includes | Permanent; plan data, not a flag | From the plan data |

## Rules

- Declare every flag once in the contract source with its name, type, default, owner and purpose, plus a removal date for release flags. Add fixtures for valid and invalid flag documents. Code reads flags only through one typed loader (core/dry.md). Why: an undeclared flag cannot be found, tested or removed.
- The loader validates the whole document. It rejects an invalid document as a whole and keeps the last valid one, or the coded prod-safe default, in force. It records the fallback in a metric.
- Read flags in the composition root or a driving adapter, and pass them to use cases as values or through a port. A use case never reads env or a flag store directly (core/architecture-hexagonal.md).
- An on/off flag may be a boolean. Choosing between code versions is never a boolean flag; it is the integer switch (stack/versioning.md).
- Evaluate security, entitlement and quota decisions on the server. Client-side gating only hides UI; the server refuses on its own.
- Plan limits, prices, tiers and entitlements are data in one source, never literals in code or tests (core/dry.md). Tests read the same plan fixture.
- A kill switch refuses with a documented error code and `Retry-After`. That happens before any meter is consumed or any billed hop is called (stack/ai-features.md).
- Per-stage values live in the stage's own root, in its `env/<stage>.<stack>.tfvars`, or in a runtime parameter. Prod-safe switch defaults and promotion: stack/terraform.md.
- Clients can be fenced: the server sends a minimum build and answers "upgrade required" below it (stack/api-design.md).
- Every prod flag change is attributable to who changed it and when, through parameter history or an audit line.
- Test every flag value, including the missing-document and invalid-document cases.

## Cleanup

- A release flag past its removal date is a review-blocking defect.
- Remove the flag, its dead branch and that branch's tests together in one PR. That PR contains no other behaviour change (stack/git-and-pr.md).
