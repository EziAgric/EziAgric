import { TOKEN_CONFIG } from "../config/token";

/**
 * The single conversion point between decimal money strings and the integer
 * stroop amounts the Soroban contracts use.
 *
 * Soroban takes `i128`. IEEE-754 doubles carry 53 bits of mantissa, so any
 * stroop amount above 2^53 (~900,719,925 units at 7 decimals) silently loses
 * precision the moment it becomes a JS `number` — the DB row and the chain
 * state then disagree by an amount nobody can reconstruct. Money therefore
 * travels as a decimal `string` at the API and DB boundary, and as `bigint`
 * stroops wherever arithmetic happens. It never becomes a `number`.
 */

/** Decimal places for the platform token. */
export const MONEY_DECIMALS = TOKEN_CONFIG.decimals;

/** `i128` bounds — the widest value a Soroban amount argument can carry. */
export const I128_MAX = 2n ** 127n - 1n;
export const I128_MIN = -(2n ** 127n);

/**
 * Largest stroop amount that survives a round-trip through a JS `number`.
 * Exported so a test or a guard can name the boundary this module exists to
 * defend rather than restating the constant.
 */
export const MAX_SAFE_STROOPS = BigInt(Number.MAX_SAFE_INTEGER);

/** Thrown for any malformed or out-of-range monetary value. */
export class MoneyConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyConversionError";
  }
}

/**
 * A decimal money string: optional sign, digits, optional fraction. Exponent
 * notation is rejected — `1e21` is exactly the shape that arrives after a value
 * has already been through a float.
 */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

function base(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

/**
 * Converts a decimal money string to integer stroops.
 *
 * Parsing is purely textual — the string is split on the decimal point and
 * reassembled as an integer — so no intermediate float exists and a value of
 * any magnitude converts exactly.
 *
 * @param value - Decimal string, e.g. `"125.5000000"`. A `bigint` is treated as
 * a whole number of units, not stroops.
 * @param decimals - Decimal places. Defaults to the platform token's.
 * @returns The amount in stroops.
 * @throws MoneyConversionError if `value` is not a decimal string, carries more
 * fractional digits than `decimals` (which would silently truncate), or falls
 * outside the `i128` range.
 */
export function parseDecimalToStroops(
  value: string | bigint,
  decimals: number = MONEY_DECIMALS,
): bigint {
  if (typeof value === "bigint") {
    return assertI128Range(value * base(decimals));
  }

  if (typeof value !== "string") {
    throw new MoneyConversionError(
      `Monetary values must be decimal strings, received ${typeof value}`,
    );
  }

  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new MoneyConversionError(`Invalid decimal amount: "${value}"`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionPart = ""] = unsigned.split(".");

  if (fractionPart.length > decimals) {
    throw new MoneyConversionError(
      `Amount "${value}" has ${fractionPart.length} decimal places; at most ${decimals} are representable`,
    );
  }

  const padded = fractionPart.padEnd(decimals, "0");
  const magnitude = BigInt(`${wholePart}${padded}`);

  return assertI128Range(negative ? -magnitude : magnitude);
}

/**
 * Converts integer stroops back to a decimal string.
 *
 * Always emits exactly `decimals` fractional digits, so the same amount always
 * serialises to the same string and API responses compare byte for byte.
 *
 * @param stroops - Amount in stroops.
 * @param decimals - Decimal places. Defaults to the platform token's.
 * @returns The decimal representation, e.g. `"125.5000000"`.
 */
export function formatStroopsToDecimal(
  stroops: bigint,
  decimals: number = MONEY_DECIMALS,
): string {
  const divisor = base(decimals);
  const negative = stroops < 0n;
  const magnitude = negative ? -stroops : stroops;
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;
  const sign = negative && magnitude !== 0n ? "-" : "";
  return `${sign}${whole}.${fraction.toString().padStart(decimals, "0")}`;
}

/**
 * Asserts a stroop amount fits in `i128`.
 *
 * @param stroops - Amount to check.
 * @returns `stroops`, so this can wrap an expression.
 * @throws MoneyConversionError if the value would overflow the contract's
 * `i128` argument.
 */
export function assertI128Range(stroops: bigint): bigint {
  if (stroops > I128_MAX || stroops < I128_MIN) {
    throw new MoneyConversionError(
      `Amount ${stroops} is outside the i128 range accepted by the contract`,
    );
  }
  return stroops;
}

/**
 * True when a stroop amount would survive conversion to a JS `number`.
 *
 * Nothing in the backend should need this to decide behaviour — it exists so a
 * boundary test can state the property directly.
 */
export function isSafeAsNumber(stroops: bigint): boolean {
  const magnitude = stroops < 0n ? -stroops : stroops;
  return magnitude <= MAX_SAFE_STROOPS;
}

/**
 * Sums decimal money strings without ever leaving integer arithmetic.
 *
 * @param values - Decimal money strings.
 * @param decimals - Decimal places. Defaults to the platform token's.
 * @returns The total as a decimal string.
 * @throws MoneyConversionError if any value is malformed or the total overflows
 * `i128`.
 */
export function sumDecimalStrings(
  values: readonly string[],
  decimals: number = MONEY_DECIMALS,
): string {
  const total = values.reduce(
    (acc, value) => acc + parseDecimalToStroops(value, decimals),
    0n,
  );
  return formatStroopsToDecimal(assertI128Range(total), decimals);
}

/**
 * Normalises an amount to the canonical decimal string.
 *
 * Use this on any value crossing into the DB or an API response so that
 * `"1"`, `"1.0"` and `"1.0000000"` are stored and returned identically.
 *
 * @param value - Decimal money string or whole-unit `bigint`.
 * @param decimals - Decimal places. Defaults to the platform token's.
 * @returns The canonical decimal string.
 * @throws MoneyConversionError if `value` is malformed or out of range.
 */
export function normalizeDecimalString(
  value: string | bigint,
  decimals: number = MONEY_DECIMALS,
): string {
  return formatStroopsToDecimal(parseDecimalToStroops(value, decimals), decimals);
}
