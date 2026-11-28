/**
 * PII redaction for structured logs.
 *
 * Two layers, both applied to every log record:
 *  1. A field-name denylist — any key that looks like it holds PII
 *     (phone, email, secrets, etc.) is fully replaced regardless of value.
 *  2. A pattern pass over every remaining string value, scrubbing
 *     email/phone-shaped substrings that show up in fields we didn't think
 *     to denylist (free-text notes, error messages, webhook payloads).
 *
 * This is deliberately conservative about the pattern pass — the goal is to
 * catch PII embedded in prose (denylist can't), not to redact every 7+
 * digit number in the app (would gut logs of trade ids, amounts, ledger
 * sequence numbers). See `logPiiScanner` for a runtime sweep that flags
 * anything this misses so leaks don't quietly persist forever.
 */

const REDACTED = "[REDACTED]";

/** Field names (case/punctuation-insensitive) fully redacted regardless of value. */
const PII_FIELD_DENYLIST = new Set(
  [
    "email",
    "emailaddress",
    "phone",
    "phonenumber",
    "mobile",
    "mobilenumber",
    "msisdn",
    "ssn",
    "socialsecuritynumber",
    "nationalid",
    "idnumber",
    "driveridnumber",
    "passportnumber",
    "dateofbirth",
    "dob",
    "homeaddress",
    "streetaddress",
    "postaladdress",
    "drivername",
    "buyername",
    "sellername",
    "customername",
    "contactname",
    "fullname",
    "firstname",
    "lastname",
    "password",
    "passwordhash",
    "pin",
    "otp",
    "cvv",
    "cardnumber",
    "creditcardnumber",
    "secretkey",
    "privatekey",
    "walletsecret",
    "seedphrase",
    "mnemonic",
    "sessiontoken",
    "authorization",
    "authtoken",
    "accesstoken",
    "refreshtoken",
    "apikey",
    "cookie",
  ].map(normalizeFieldName),
);

function normalizeFieldName(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

function isDenylistedField(key: string): boolean {
  return PII_FIELD_DENYLIST.has(normalizeFieldName(key));
}

// Deliberately conservative: matches only strings that look like a phone
// number written with typical separators or an E.164 `+countrycode` prefix,
// not any 7+ digit run (which would false-positive on trade/ledger ids).
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN =
  /(?:\+\d{6,15})|(?:\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)|(?:\b\(\d{2,4}\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b)/g;

function scrubPatternsInString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]");
}

const MAX_DEPTH = 8;

/**
 * Deep-clones `value`, replacing denylisted fields and PII-shaped
 * substrings. Safe against circular references and does not mutate the
 * input (log call sites often reuse objects after logging).
 */
export function redactPii<T>(value: T, seen: WeakSet<object> = new WeakSet(), depth = 0): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return scrubPatternsInString(value) as unknown as T;
  }

  if (typeof value !== "object" || depth >= MAX_DEPTH) {
    return value;
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Error) {
    const redactedError = new Error(scrubPatternsInString(value.message));
    redactedError.name = value.name;
    // The stack's first line embeds the original (unredacted) message —
    // scrub the whole string, not just `.message`, or it leaks right back out.
    redactedError.stack = value.stack ? scrubPatternsInString(value.stack) : value.stack;
    return redactedError as unknown as T;
  }

  if (seen.has(value as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item, seen, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isDenylistedField(key)) {
      result[key] = val === null || val === undefined ? val : REDACTED;
      continue;
    }
    result[key] = redactPii(val, seen, depth + 1);
  }
  return result as T;
}

export { PII_FIELD_DENYLIST, EMAIL_PATTERN, PHONE_PATTERN };
