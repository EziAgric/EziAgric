/**
 * Platform fee math for the frontend (#423).
 *
 * This is the client-side mirror of `backend/src/lib/feeComputation.ts`
 * (`computeReleaseFee`), which in turn mirrors the on-chain
 * `release_funds()` in `contracts/amana_escrow`:
 *
 *   fee = amount * fee_bps / 10_000   (truncated toward zero)
 *   seller_net = amount - fee
 *
 * Rounding is deliberately truncation, not `Math.round`: the backend and the
 * Soroban contract both truncate, so anything the UI predicts has to truncate
 * too or the number a user reads before signing won't match what they get.
 * Parity is enforced by `__tests__/feeBreakdown.test.ts`, which replays the
 * shared money-math corpus in `shared-test-fixtures/`.
 *
 * Keep this in lockstep with the backend util — if `BPS_DIVISOR` or the
 * rounding policy ever changes there, change it here and the parity test will
 * catch any drift.
 */

/** Basis-point denominator: 10_000 bps == 100%. Mirrors backend `BPS_DIVISOR`. */
export const BPS_DIVISOR = BigInt(10_000);

/** Default platform fee: 100 bps == 1%. */
export const DEFAULT_PLATFORM_FEE_BPS = 100;

export interface FeeBreakdown {
  /** Gross amount, in the same integer units the input used (stroops or cNGN). */
  gross: string;
  /** Platform fee, truncated toward zero. */
  fee: string;
  /** What the seller receives after the fee: `gross - fee`. */
  net: string;
  /** The fee rate used, in basis points. */
  feeBps: number;
}

function assertFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < 0) {
    throw new Error(
      `computeFeeBreakdown: feeBps must be a non-negative integer, received ${feeBps}`,
    );
  }
}

/**
 * Compute the 1% (or `feeBps`) platform fee on an integer amount.
 *
 * The amount is expected in integer minor units — stroops for on-chain
 * amounts, whole cNGN for the UI. Multiplication happens before the division
 * so no precision is lost to an intermediate rounding.
 */
export function computeFeeBreakdown(
  grossStroops: bigint | string,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): FeeBreakdown {
  assertFeeBps(feeBps);

  const gross =
    typeof grossStroops === "string" ? BigInt(grossStroops) : grossStroops;

  if (gross < BigInt(0)) {
    throw new Error(
      `computeFeeBreakdown: gross must not be negative, received ${gross}`,
    );
  }

  // Truncating division, exactly as Soroban i128 and the backend do.
  const fee = (gross * BigInt(feeBps)) / BPS_DIVISOR;

  return {
    gross: gross.toString(),
    fee: fee.toString(),
    net: (gross - fee).toString(),
    feeBps,
  };
}

/**
 * Decimal-friendly wrapper around {@link computeFeeBreakdown}.
 *
 * Real UI amounts arrive as decimal strings such as `"5000"` or `"12.5"`. This
 * scales the value to an integer using the string's own fractional digits,
 * applies the same truncating math, then scales the result back — so integer
 * inputs produce byte-for-byte the same result as `computeFeeBreakdown`.
 */
export function computeFeeBreakdownFromDecimal(
  gross: string | number,
  feeBps: number = DEFAULT_PLATFORM_FEE_BPS,
): FeeBreakdown {
  const raw = typeof gross === "number" ? String(gross) : gross.trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(
      `computeFeeBreakdownFromDecimal: invalid amount "${gross}"`,
    );
  }

  const [wholePart, fractionPart = ""] = raw.split(".");
  const scale = fractionPart.length;
  const unscaled = BigInt(`${wholePart}${fractionPart.padEnd(scale, "0")}`);

  const result = computeFeeBreakdown(unscaled, feeBps);

  return {
    ...result,
    gross: fromScaled(BigInt(result.gross), scale),
    fee: fromScaled(BigInt(result.fee), scale),
    net: fromScaled(BigInt(result.net), scale),
  };
}

/** Render an integer at `scale` decimal places, trimming trailing zeros. */
function fromScaled(value: bigint, scale: number): string {
  if (scale === 0) return value.toString();

  const digits = value.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");

  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

/** Format a bps rate as a percentage string, e.g. `100` -> `"1%"`. */
export function formatFeePercent(feeBps: number): string {
  if (!Number.isFinite(feeBps)) return "—";
  const percent = feeBps / 100;
  return Number.isInteger(percent)
    ? `${percent}%`
    : `${percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

/** Group an integer-ish amount with thousands separators for display. */
export function formatFeeAmount(value: string | number): string {
  const raw = String(value);
  const match = /^(\d+)(\.\d+)?$/.exec(raw);
  if (!match) return raw;
  return `${match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${match[2] ?? ""}`;
}
