---
paths:
---

# Time, money and locale

Scope: how dk-coding repos represent and format instants, calendar dates, money, currency conversion and user-facing text, in the backend, app and contracts.

Wire formats in stack/api-design.md point here.

## Time

- An instant (a moment in time) is stored and sent as UTC ISO-8601 with `Z` and milliseconds: `2026-10-04T03:15:00.000Z`. Never send a local time without an offset, or epoch numbers on the wire. Internal arithmetic may use epoch milliseconds.
- A calendar date (when a transaction happened to the user, a due date) is a local date `yyyy-mm-dd` with its own type (`LocalDate`), never midnight UTC. Why: midnight UTC is still the previous day everywhere west of UTC.
- Display converts instants to the user's IANA zone (`Australia/Sydney`), never to a fixed offset. Store the zone with the user's settings.
- Compute period boundaries (day, week, month) in the user's zone, with the week start taken from settings.
- Get the current time only from the injected `Clock` (core/architecture-hexagonal.md).
- Golden tables pin daylight-saving transitions, month ends (28 to 31 days) and leap days for every platform (stack/testing.md).
- Durations carry their unit in the name or the type: `timeoutMs`, `ttlSeconds`.
- When the client and server disagree on time, the server instant decides ordering. A client time is data, never the authority.

## Money

- An amount is integer minor units plus an ISO 4217 code: `{ "amountMinor": 1299, "currency": "AUD" }`. Never use floats for money in domain code, storage or the wire.
- Each currency's minor-unit exponent comes from one currency table (core/dry.md), never an assumed 2. For example, JPY has 0 and KWD has 3.
- Arithmetic works only on same-currency values. A mismatch is a typed error.
- Splits distribute the remainder deterministically, so the parts always sum to the whole.
- Conversion uses a rate snapshot (rate, source, timestamp) recorded with the transaction. Never re-convert history at today's rate.
- Rates are exact decimals (a decimal string or a scaled integer). The contract names the rounding mode once, and golden tables shared across platforms pin it.
- Formatting (symbol, separators, grouping) happens only at the UI edge, with the locale formatter (`Intl.NumberFormat` on web, `intl` `NumberFormat.currency` in Dart). Domain code never formats.

## Locale and text

- User-facing strings live outside widget and component code:
  - Mobile: ARB files or a per-feature `strings.dart` (stack/mobile-flutter.md).
  - Web: a strings module per feature.
- Plurals and interpolation use ICU message syntax through the localisation library, never string concatenation. Don't write `'$n item' + (n == 1 ? '' : 's')`.
- Format dates and numbers with the locale's formatter, never hand-built patterns such as `dd/mm`.
- Layouts tolerate longer translations and large text scales. The checks are in stack/mobile-flutter.md and stack/web-react.md.
- Normalise text to Unicode NFC before comparing or hashing it. Search uses case folding, and user-visible sorting uses locale-aware collation.
