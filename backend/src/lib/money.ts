/**
 * Shared money math for all currency-denominated arithmetic (#177).
 *
 * Every ratio applied to an escrowed amount — platform fees, loss shares,
 * vesting accrual — is an integer division that cannot divide evenly in the
 * general case. Performing that division inline with a bare `/` (or, worse,
 * `Math.floor` on a `Number`) silently discards the fractional stroop and
 * leaves no record that a value was adjusted. Spread across call sites the
 * discarded fractions are individually invisible and cumulatively material.
 *
 * This module makes that division explicit and auditable:
 *
 *   1. One entry point (`divideWithPolicy` / `applyBps`) for currency division,
 *      so no call site does raw arithmetic on money.
 *   2. An explicit, per-call-site `RoundingPolicy` rather than an implicit one.
 *   3. The residual is *returned*, never dropped — callers either surface it or
 *      carry it forward via `DustLedger`.
 *   4. `logRoundingAdjustment` writes a structured audit record whenever
 *      rounding moves a value off its exact quotient.
 *
 * ## Choosing a policy
 *
 * `CONTRACT_ROUNDING` (`"trunc"`) is the policy for anything mirroring on-chain
 * math. Soroban's i128 division truncates toward zero, so backend code that
 * predicts a contract result MUST truncate too: a "fairer" policy here would
 * make the backend disagree with the chain, which is a worse bug than the dust.
 *
 * `"half-even"` (banker's rounding) is the policy for backend-authoritative
 * money that is not reproducing a contract computation. It is unbiased over
 * many roundings, where half-up drifts upward on every exact-half boundary.
 *
 * Related: `lossAllocation.ts` solves the adjacent multi-party problem — when
 * one total is split N ways and the parts must sum back to it exactly, use
 * `largestRemainderAllocation` there rather than rounding each share here.
 */

import { appLogger } from "../middleware/logger";

/** Basis-point denominator: 10_000 bps == 100%. */
export const BPS_DIVISOR = 10_000n;

/**
 * How a division that does not divide evenly resolves its remainder.
 *
 * - `trunc`     — toward zero. Mirrors Soroban i128 division.
 * - `floor`     — toward negative infinity.
 * - `ceil`      — toward positive infinity.
 * - `half-up`   — nearest; exact halves away from zero.
 * - `half-even` — nearest; exact halves to the even quotient (banker's).
 */
export type RoundingPolicy =
  | "trunc"
  | "floor"
  | "ceil"
  | "half-up"
  | "half-even";

/**
 * The policy for any value that must agree with the on-chain result.
 * Named rather than inlined so the intent is greppable at every call site.
 */
export const CONTRACT_ROUNDING: RoundingPolicy = "trunc";

/**
 * The default for backend-authoritative money not mirroring the contract.
 * Unbiased across many roundings.
 */
export const DEFAULT_ROUNDING: RoundingPolicy = "half-even";

export interface DivisionResult {
  /** The rounded quotient — the amount actually payable, in stroops. */
  value: bigint;
  /**
   * Signed residual in *numerator* units: `numerator - value * denominator`.
   * Zero when the division was exact. Negative when rounding paid out more
   * than the exact share. Feed this to `DustLedger` to carry it forward.
   */
  residual: bigint;
  /** The denominator, retained so a residual can be interpreted later. */
  denominator: bigint;
}

/**
 * Divide `numerator` by `denominator`, resolving the remainder per `policy`.
 *
 * Currency division goes through here rather than through a bare `/` so the
 * residual is always visible to the caller.
 *
 * @throws when `denominator` is zero or negative — a negative denominator
 * would invert the meaning of every policy, and is always a caller bug.
 */
export function divideWithPolicy(
  numerator: bigint,
  denominator: bigint,
  policy: RoundingPolicy = DEFAULT_ROUNDING,
): DivisionResult {
  if (denominator <= 0n) {
    throw new Error(
      `divideWithPolicy: denominator must be positive, received ${denominator}`,
    );
  }

  // BigInt `/` truncates toward zero, so `remainder` carries the sign of the
  // numerator and `|remainder| < denominator` always holds.
  const truncated = numerator / denominator;
  const remainder = numerator - truncated * denominator;

  if (remainder === 0n) {
    return { value: truncated, residual: 0n, denominator };
  }

  const step = remainder > 0n ? 1n : -1n;
  const twiceRemainder = remainder < 0n ? -remainder * 2n : remainder * 2n;

  let value: bigint;
  switch (policy) {
    case "trunc":
      value = truncated;
      break;
    case "floor":
      value = remainder < 0n ? truncated - 1n : truncated;
      break;
    case "ceil":
      value = remainder > 0n ? truncated + 1n : truncated;
      break;
    case "half-up":
      value = twiceRemainder >= denominator ? truncated + step : truncated;
      break;
    case "half-even":
      if (twiceRemainder > denominator) {
        value = truncated + step;
      } else if (twiceRemainder < denominator) {
        value = truncated;
      } else {
        // Exact half: settle on the even quotient.
        value = truncated % 2n === 0n ? truncated : truncated + step;
      }
      break;
  }

  return {
    value,
    residual: numerator - value * denominator,
    denominator,
  };
}

/**
 * Apply a basis-point ratio to an amount.
 *
 * The multiplication happens before the division so precision is never lost to
 * an intermediate rounding.
 *
 * @throws when `bps` is negative.
 */
export function applyBps(
  amount: bigint,
  bps: bigint,
  policy: RoundingPolicy = DEFAULT_ROUNDING,
): DivisionResult {
  if (bps < 0n) {
    throw new Error(`applyBps: bps must not be negative, received ${bps}`);
  }
  return divideWithPolicy(amount * bps, BPS_DIVISOR, policy);
}

/**
 * Carries the residual of one accrual window into the next.
 *
 * Truncating each window independently loses a fraction every time and the
 * loss compounds. Holding the residual and folding it into the next window's
 * numerator means the fractions accumulate until they add up to a whole
 * stroop, which is then paid out. Over any number of windows the total paid
 * differs from the exact total by less than one stroop, rather than by one
 * stroop per window.
 *
 * The ledger is per-stream (or per-claimant) state: construct one per accrual
 * series and persist `residual` alongside that series' balance.
 */
export class DustLedger {
  private residualNumerator: bigint;
  private readonly policy: RoundingPolicy;
  private readonly denominator: bigint;

  /**
   * @param policy      Rounding applied after the carried residual is folded in.
   * @param carriedIn   Residual persisted from a previous run, in numerator units.
   * @param denominator Fixed for the life of the ledger — a residual is only
   *                    meaningful against the denominator that produced it.
   */
  constructor(
    policy: RoundingPolicy = DEFAULT_ROUNDING,
    carriedIn: bigint = 0n,
    denominator: bigint = BPS_DIVISOR,
  ) {
    if (denominator <= 0n) {
      throw new Error(
        `DustLedger: denominator must be positive, received ${denominator}`,
      );
    }
    this.policy = policy;
    this.residualNumerator = carriedIn;
    this.denominator = denominator;
  }

  /** The residual currently held. Persist this between runs. */
  get residual(): bigint {
    return this.residualNumerator;
  }

  /**
   * Accrue one window: fold in the carried residual, divide, retain the new
   * residual, and return the whole stroops payable now.
   */
  accrue(numerator: bigint): DivisionResult {
    const result = divideWithPolicy(
      numerator + this.residualNumerator,
      this.denominator,
      this.policy,
    );
    this.residualNumerator = result.residual;
    return result;
  }

  /**
   * Accrue a bps-denominated window — the common case.
   */
  accrueBps(amount: bigint, bps: bigint): DivisionResult {
    return this.accrue(amount * bps);
  }

  /**
   * Release any whole units held in the residual, leaving the sub-stroop
   * fraction behind. Call this when a stream closes so a held stroop is not
   * stranded.
   */
  settle(): bigint {
    const whole = this.residualNumerator / this.denominator;
    this.residualNumerator -= whole * this.denominator;
    return whole;
  }
}

export interface RoundingAuditContext {
  /** What was being computed, e.g. `"platform_fee"` or `"stream_accrual"`. */
  operation: string;
  /** Stream, trade, or claim this adjustment belongs to. */
  reference: string;
  policy: RoundingPolicy;
  /** The rounded value that will be paid or charged. */
  value: bigint;
  /** Residual left over, in numerator units. */
  residual: bigint;
  denominator: bigint;
  extra?: Record<string, unknown>;
}

/**
 * Record that rounding adjusted a monetary amount.
 *
 * Follows the flat, `audit: true` shape used by `escrowAudit.ts` so rounding
 * adjustments are queryable in the same place as escrow lifecycle events.
 * BigInts are serialised to strings — log transports cannot encode them.
 */
export function logRoundingAdjustment(ctx: RoundingAuditContext): void {
  appLogger.info(
    {
      audit: true,
      auditKind: "rounding_adjustment",
      operation: ctx.operation,
      reference: ctx.reference,
      policy: ctx.policy,
      value: ctx.value.toString(),
      residual: ctx.residual.toString(),
      denominator: ctx.denominator.toString(),
      timestamp: new Date().toISOString(),
      ...ctx.extra,
    },
    `[MoneyAudit] ${ctx.operation} rounded to ${ctx.value} (residual ${ctx.residual}/${ctx.denominator})`,
  );
}

/**
 * Divide and, when rounding adjusts the result, write the audit record.
 * Convenience wrapper for call sites that always want both.
 */
export function divideAndAudit(
  numerator: bigint,
  denominator: bigint,
  policy: RoundingPolicy,
  audit: Omit<
    RoundingAuditContext,
    "policy" | "value" | "residual" | "denominator"
  >,
): DivisionResult {
  const result = divideWithPolicy(numerator, denominator, policy);
  if (result.residual !== 0n) {
    logRoundingAdjustment({
      ...audit,
      policy,
      value: result.value,
      residual: result.residual,
      denominator: result.denominator,
    });
  }
  return result;
}
