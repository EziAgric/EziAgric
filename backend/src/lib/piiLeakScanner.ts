/**
 * Runtime PII-leak scanner (#233).
 *
 * Sweeps a sample of already-*redacted* log lines (see logSampleBuffer.ts)
 * and flags anything that still looks like PII. This exists because
 * `redactPii` (middleware/logger.ts's `hooks.logMethod`) is the enforcement
 * point, but enforcement points can regress — a new field name that isn't on
 * the denylist, a payload shape the pattern pass doesn't cover, a caller
 * that stringifies before logging. The scanner is the safety net that turns
 * "we assume redaction still works" into a recurring, alertable check.
 *
 * Findings never include the leaked value itself — only its location and
 * pattern — so investigating a scanner alert doesn't itself become a PII
 * exposure.
 */

const SCAN_EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const SCAN_PHONE_PATTERN =
  /(?:\+\d{6,15})|(?:\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)|(?:\b\(\d{2,4}\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b)/;

export type PiiLeakKind = "email" | "phone" | "unredacted_denylisted_field";

export interface PiiLeakFinding {
  lineIndex: number;
  kind: PiiLeakKind;
  /** Dot-path to the offending field within the parsed log record, e.g. "trade.buyerContact.email". */
  path: string;
}

/** Same denylist semantics as logRedaction.ts, duplicated intentionally: this checks the *outcome*, not the same code path, so a bug in one doesn't hide a bug in the other. */
const DENYLISTED_FIELD_NAMES = new Set([
  "email",
  "emailaddress",
  "phone",
  "phonenumber",
  "mobile",
  "mobilenumber",
  "ssn",
  "password",
  "pin",
  "otp",
  "cvv",
  "cardnumber",
  "secretkey",
  "privatekey",
  "walletsecret",
  "seedphrase",
  "mnemonic",
]);

function normalizeFieldName(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

function walk(value: unknown, path: string, findings: PiiLeakFinding[], lineIndex: number, depth: number): void {
  if (depth > 10 || value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (value === "[REDACTED]" || value.startsWith("[REDACTED_")) {
      return;
    }
    if (SCAN_EMAIL_PATTERN.test(value)) {
      findings.push({ lineIndex, kind: "email", path });
    } else if (SCAN_PHONE_PATTERN.test(value)) {
      findings.push({ lineIndex, kind: "phone", path });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, findings, lineIndex, depth + 1));
    return;
  }

  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (
        DENYLISTED_FIELD_NAMES.has(normalizeFieldName(key)) &&
        typeof val === "string" &&
        val !== "[REDACTED]"
      ) {
        findings.push({ lineIndex, kind: "unredacted_denylisted_field", path: childPath });
        continue;
      }
      walk(val, childPath, findings, lineIndex, depth + 1);
    }
  }
}

/**
 * Scans a batch of log lines (each expected to be a JSON object, one per
 * line — pino's default format) for suspected PII that survived redaction.
 * Lines that aren't valid JSON are skipped (nothing structured to check).
 */
export function scanForPiiLeaks(lines: string[]): PiiLeakFinding[] {
  const findings: PiiLeakFinding[] = [];

  lines.forEach((line, lineIndex) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    walk(parsed, "", findings, lineIndex, 0);
  });

  return findings;
}
