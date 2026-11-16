---
paths:
---

# Testing

Scope: how tests are written, what they must prove, and the gates around them in dk-coding repos. Reaches sessions through the dk-coding skill. Test placement per version and pointer tests: `stack/versioning.md`. Reporting what ran vs what was traced: `core/agent-conduct.md`.

## Writing a test

- **Names are sentences** that state the rule, not the method: `it('rejects a repayment larger than the balance')`, Dart `test('rejects a repayment larger than the balance', ...)`.
- **Arrange / Act / Assert:** three visible blocks, one behaviour per test.
- **Fixtures over literals:** wire and golden tests load `contracts/**/fixtures/*.json` bytes. If the repo has no `contracts/` fixtures yet, a test may use literals; the first PR that adds the contract converts them.
- **DAMP, not DRY:** repeat setup when it makes the test readable on its own. Share builders, fakes and fixtures (`test/support/`), never assertions (`core/dry.md`).
- **Deterministic:** fake `Clock`, seeded ids and generators, no sleeps, no real network, no wall-clock time, no test-order dependence.

## What every change must prove

- **Wire test per contract.** Assert the exact serialised outgoing request (body string, headers) and parse the exact response bytes from the fixture. Never assert only the return shape. Why: a destructure is a filter; a payload test catches the seam bugs a return-shape test misses.
- **Mutation check per guard.** Remove or invert the guard's condition, watch the named test fail, restore it, and record `guard → test` in the PR. A test that cannot fail is no test.
- **One test file per version file**, plus the pointer test (`stack/versioning.md`). Previous-version tests keep running until the version is removed.
- **Golden tables** are versioned with their contract; every platform iterates the same file, and golden tests iterate versions explicitly.
- **Port contract suite** for every driven port you add or change, as `core/architecture-hexagonal.md` defines it.
- **Property-based tests** on pure domain rules: money arithmetic, periods, parsers, sort orders, and round-trips (`decode(encode(x)) == x`). TS: `fast-check`. Dart: a seeded hand-rolled generator (or `glados` once approved as a dependency). Seed every run and print the seed on failure.

## Test shape

- Most tests are fast unit tests on `core/` / `domain/` / `usecases/`, plus port contract suites.
- A few integration tests per adapter (DynamoDB Local, drift in memory).
- A handful of end-to-end flows (Playwright on web, `integration_test` on mobile).
- Driving adapters (handlers, hooks, Notifiers) are tested against a fake use case, asserting the exact input passed in and the exact shaped output.

## Gates

| Gate | Rule |
|---|---|
| Coverage | 90 % lines on `core/` / `domain/` + `usecases/`; 80 % overall. Thresholds only ratchet up, never down. |
| Mutation score (TS) | Stryker (`@stryker-mutator/vitest-runner` or the jest runner) in incremental mode on `core/`, `domain/`, `usecases/`. The `break` threshold only ratchets up. Dart has no mature mutation tool: keep the manual `guard → test` record. |
| UI, web | Testing Library + axe in component tests; Playwright screenshots for flows. |
| UI, mobile | Goldens in the light theme only, compared on macOS only. Screen sizes and text scales: `stack/mobile-flutter.md`. |
| Terraform | `terraform test` per module version (`tests/v<N>.tftest.hcl`, plan mode) and a plan-guard fixture test. |

## Integrity

- Never change an expectation to make a test pass unless the PR states the behaviour change it reflects. Anything else is suppression, which `core/agent-conduct.md` forbids along with skipping or loosening tests.
- A flaky test is quarantined with a reason and an issue link (`it.skip` + `// quarantined: #<id> <reason>`; Dart `skip: 'quarantined #<id>: <reason>'`), and listed in the PR. Never rerun it until it passes. Why: a retried flake hides a real race.
