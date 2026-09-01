# Log PII Scrubbing and Leak Scanning

## Overview

Application logs (pino, via `middleware/logger.ts`) carry request bodies and
domain objects — trades, disputes, webhook payloads, manifest records — that
can contain phone numbers, emails, and other PII (see #32 on encryption for
data-at-rest; this covers the log-store leak surface specifically). Log
aggregation is the softest PII exposure: retention makes any leak durable,
and log access is usually broader than direct DB access.

This covers three layers:

1. **Redaction at the source** — every structured log call is deep-redacted
   before it's serialized.
2. **Enforcement tests** — snapshot-style tests assert PII is absent from
   representative payloads (and from the *actual serialized log line*, not
   just the redaction function in isolation).
3. **Runtime scanning** — a scheduled job re-checks a live sample of
   emitted log lines and alerts if anything slipped through.

## 1. Redaction at the source

`lib/logRedaction.ts` exports `redactPii(value)`, which deep-clones any value
and:

- Fully replaces the value of any field whose name matches a PII denylist
  (`email`, `phoneNumber`, `driverIdNumber`, `password`, `privateKey`, …),
  regardless of what shape the value is.
- Scrubs email/phone-shaped substrings out of every other string value, so
  PII embedded in free text (dispute notes, error messages) is caught too.
- Preserves everything else — ids, amounts, Stellar addresses, timestamps —
  untouched, so logs stay useful for debugging.

This is wired into `appLogger` (the shared pino instance every service
imports) via `hooks.logMethod`, pino's official hook for transforming
arguments before they're serialized. That makes it a single, global
enforcement point — no call site has to remember to redact anything, and a
new log call anywhere in the codebase is covered automatically.

**Adding a new PII field**: add its normalized name (lowercase,
non-letters stripped) to `PII_FIELD_DENYLIST` in `lib/logRedaction.ts`. Don't
add generic names like `name` or `id` — they're used for many non-PII
purposes and would gut log usefulness; use specific compounds instead
(`driverName`, `buyerName`, ...).

## 2. Enforcement tests

- `__tests__/logRedaction.test.ts` — unit tests for `redactPii` against
  representative payloads (nested objects, arrays, `Error` instances,
  circular references), including a full trade-dispute-shaped payload
  asserting every PII value is absent from the serialized result.
- `__tests__/logger.pii.test.ts` — asserts against the actual serialized
  pino log line (not just the function output), using the same
  `hooks.logMethod` wiring as the real `appLogger`.

Run them with:

```bash
npx jest --config jest.config.js src/__tests__/logRedaction.test.ts src/__tests__/logger.pii.test.ts
```

## 3. Runtime scanning

Redaction rules can have gaps — a new field name nobody denylisted, a
payload shape the pattern pass doesn't cover, a caller that stringifies data
before logging it. `lib/piiLeakScanner.ts` re-scans a sample of **already
emitted** (post-redaction) log lines and flags anything that still looks
like PII, so a redaction gap shows up as an alert instead of a silent,
permanent leak.

- `lib/logSampleBuffer.ts` — a bounded, in-process ring buffer fed by pino's
  `streamWrite` hook, capturing exactly what was actually written to the log
  sink (size controlled by `PII_SCANNER_SAMPLE_SIZE`, default 2000 lines).
- `jobs/workers/piiLogScanner.worker.ts` — a BullMQ worker (queue
  `pii-log-scan`) that samples the buffer, runs `scanForPiiLeaks`, and — on
  any finding — dispatches a `pii_log_leak_detected` alert via
  `AlertService` and logs a warning. Findings never include the leaked
  value itself, only its field path and pattern kind, so triaging an alert
  doesn't re-expose the data.
- Scheduled weekly (Sundays 03:00 UTC) in `index.ts`, gated by
  `PII_SCANNER_CRON_ENABLED` (default `true`).

**Scope note**: the sample buffer is process-local and resets on restart —
appropriate for a single-instance deployment or as a canary. A
multi-instance production deployment with a central log aggregator
(Loki/CloudWatch/Datadog) should swap `getRecentLogSample()` for a query
against that store; the scanning and alerting logic downstream is
unchanged.

### Responding to a scanner alert

1. Findings arrive as `{ lineIndex, kind, path }` in the alert's
   `affectedPaths`/`findingsByKind` — e.g. `path: "trade.buyerContact.email"`
   tells you exactly which field regressed, without needing to see the
   leaked value.
2. Add the field to `PII_FIELD_DENYLIST` in `lib/logRedaction.ts` if it's a
   structured field, or investigate the call site if it's free text that
   the pattern pass should have caught but didn't.
3. Add a regression case to `__tests__/logRedaction.test.ts` covering the
   field/shape that leaked.
4. If the leak reached a real log sink (not just this sample), follow the
   incident process in
   [docs/runbooks/incident-response.md](../../docs/runbooks/incident-response.md)
   for retention/purge of the affected log range.

## Retention

Logs are retained only as long as necessary for debugging and audit —
`MANIFEST_PII_RETENTION_DAYS` (default 30 days) is the app-level precedent
for PII retention windows in this codebase; log storage retention should be
configured to the same order of magnitude at the aggregator/infra level
(outside this repo — see your deployment's log sink configuration). Shorter
retention bounds the blast radius of any leak that the scanner or tests
don't yet catch.

## Guidance for contributors

- **Log structured data, not pre-formatted strings.** `logger.info({ tradeId,
  status }, "trade updated")` is redactable; `logger.info(\`trade ${tradeId}
  for ${buyerEmail}\`)` is not — string interpolation happens before the
  logger ever sees the value, so the pattern pass is your only safety net for it.
  Prefer the structured form so denylisted fields get caught by name, not
  just by pattern-matching.
- **Don't log full request bodies or full DB records "just in case."** Log
  the specific fields you need to debug. Every extra field is another
  chance to carry PII into a log you didn't expect to.
- **If you add a new PII-bearing field to a schema**, add it to
  `PII_FIELD_DENYLIST` in the same PR — don't rely on the weekly scanner to
  catch it after the fact.
