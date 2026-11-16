---
paths:
---

# Observability

Scope: logs, trace correlation, metrics and alarms in dk-coding repos (backend and app).

Elsewhere: library choice (Powertools behind ports) is in stack/backend-lambda.md, which security events to log is in stack/security.md, and DLQs are in stack/errors-and-resilience.md.

## Logs

- Write structured JSON only, through the repo's redacting logger port. `console.*` and `print` are lint errors.
- Where an OpenTelemetry semantic-convention name exists, use it: `http.request.method`, `http.route`, `http.response.status_code`, `error.type`, `trace_id`, `span_id`, `service.name`. Add the house fields `requestId`, `operation`, `outcome`, `durationMs` and `code`.
- Redaction is an allowlist: only listed keys are emitted, and everything else is dropped. The backend and the clients share that one list (core/dry.md), and a test pins it.
- Never log secrets, tokens, auth headers, email addresses, names, amounts, merchant or note text, prompts or model output, storage object keys, or whole request or response bodies.
- Log exactly one outcome line per request or message, carrying `operation`, `outcome` (`ok` or the error code), `durationMs`, `requestId` and the principal id (hashed where policy requires). Any other line is detail.
- Log levels:
  - `error`: a human must act, and an alarm watches it.
  - `warn`: degraded but handled.
  - `info`: the outcome line and lifecycle events such as cold start or the selected version.
  - `debug`: off in prod.
- Logging is never error handling (stack/errors-and-resilience.md).

## Correlation

- Every request gets a `requestId` at the edge: the gateway request id, or a generated one. Return it in the error envelope and in a response header.
- Pass the `requestId` and the W3C trace context (`traceparent`) through every hop: HTTP, Lambda, queue message attributes, worker, outbound call. A hop that drops them is a defect. Why: incidents are traced one hop at a time, and a missing id ends the trail.
- When a request fails, clients log the `requestId` from the response, so a support report maps to a server line.

## Metrics

- Emit business and guard events as metrics through the metrics port, using CloudWatch Embedded Metric Format (EMF). Never derive them by parsing log text. Examples: outcomes by code, quota refusals, kill-switch refusals, billed upstream calls, sync conflicts.
- Every guard and every billed hop has a metric.
- Dimensions are low-cardinality only: stage, operation, code. Never use a user id, request id or free text as a dimension. Why: each distinct value is a separately billed metric series.

## Alarms

- Every alarm has an action, and every action reaches a subscribed human or a tested automation. Why: an earlier system ran for months with alarm topics that had no subscribers.
- Alarm on symptoms first: error rate per operation, p95/p99 latency against its budget, DLQ depth above 0, throttles, and billed-call volume or spend.
- Each alarm's description states what it means and the first step to take, with a runbook link where one exists.
- Define alarms in Terraform next to the resource they watch. Thresholds come from the documented budget, never from a guess. Set `treat_missing_data` deliberately on every alarm.

## Clients

- Crash and error reports use the same redaction list as logs. Collect minimal client telemetry, and make it opt-in wherever store or privacy rules require that.
