/**
 * Shared dispute resolution math for the mediator resolution form.
 *
 * The preview shown to mediators MUST match the on-chain contract math so that
 * what a mediator signs is exactly what the parties receive. Keep this module
 * dependency-free and pure so it can be unit tested and reused by the form.
 */

export type ResolutionOutcome =
  | "full_buyer"
  | "full_seller"
  | "loss_ratio_split"
  | "custom";

/** Basis points denominator (100% = 10_000 bps). */
export const BPS_DENOMINATOR = 10_000;

/**
 * Platform fee applied to the escrowed amount, expressed in basis points.
 * Mirrors the contract's `platform_fee_bps` default.
 */
export const DEFAULT_PLATFORM_FEE_BPS = 250;

export interface SplitPreviewInput {
  /** Total amount held in escrow, in the smallest unit (stroops). */
  escrowAmount: bigint;
  /** Outcome selected by the mediator. */
  outcome: ResolutionOutcome;
  /**
   * Buyer share in basis points. Required for `loss_ratio_split` and `custom`.
   * Ignored for the full-payout outcomes.
   */
  buyerShareBps?: number;
  /** Platform fee in basis points. Defaults to {@link DEFAULT_PLATFORM_FEE_BPS}. */
  platformFeeBps?: number;
}

export interface SplitPreview {
  outcome: ResolutionOutcome;
  /** Gross escrow amount before fees. */
  grossAmount: bigint;
  /** Fee deducted from the escrow before distribution. */
  feeAmount: bigint;
  /** Amount routed to the buyer, net of fees. */
  buyerAmount: bigint;
  /** Amount routed to the seller, net of fees. */
  sellerAmount: bigint;
  /** Buyer share actually applied, in basis points. */
  buyerShareBps: number;
  /** Seller share actually applied, in basis points. */
  sellerShareBps: number;
}

/**
 * Resolve the buyer share (in bps) for a given outcome.
 *
 * - `full_buyer`  -> 100% to the buyer
 * - `full_seller` -> 0% to the buyer
 * - `loss_ratio_split` / `custom` -> caller supplied share
 */
export function resolveBuyerShareBps(
  outcome: ResolutionOutcome,
  buyerShareBps?: number,
): number {
  switch (outcome) {
    case "full_buyer":
      return BPS_DENOMINATOR;
    case "full_seller":
      return 0;
    case "loss_ratio_split":
    case "custom": {
      if (buyerShareBps === undefined) {
        throw new Error(
          `buyerShareBps is required for outcome "${outcome}"`,
        );
      }
      if (!Number.isInteger(buyerShareBps)) {
        throw new Error("buyerShareBps must be an integer");
      }
      if (buyerShareBps < 0 || buyerShareBps > BPS_DENOMINATOR) {
        throw new Error(
          `buyerShareBps must be between 0 and ${BPS_DENOMINATOR}`,
        );
      }
      return buyerShareBps;
    }
    default: {
      const exhaustive: never = outcome;
      throw new Error(`Unsupported outcome: ${String(exhaustive)}`);
    }
  }
}

/**
 * Compute the net-of-fee split preview for a resolution.
 *
 * Contract math:
 *   fee          = floor(gross * platformFeeBps / 10_000)
 *   distributable = gross - fee
 *   buyer        = floor(distributable * buyerShareBps / 10_000)
 *   seller       = distributable - buyer   (remainder goes to seller, no dust lost)
 */
export function computeSplitPreview({
  escrowAmount,
  outcome,
  buyerShareBps,
  platformFeeBps = DEFAULT_PLATFORM_FEE_BPS,
}: SplitPreviewInput): SplitPreview {
  if (escrowAmount < 0n) {
    throw new Error("escrowAmount must not be negative");
  }
  if (!Number.isInteger(platformFeeBps)) {
    throw new Error("platformFeeBps must be an integer");
  }
  if (platformFeeBps < 0 || platformFeeBps > BPS_DENOMINATOR) {
    throw new Error(
      `platformFeeBps must be between 0 and ${BPS_DENOMINATOR}`,
    );
  }

  const appliedBuyerShareBps = resolveBuyerShareBps(outcome, buyerShareBps);
  const appliedSellerShareBps = BPS_DENOMINATOR - appliedBuyerShareBps;

  const feeAmount =
    (escrowAmount * BigInt(platformFeeBps)) / BigInt(BPS_DENOMINATOR);
  const distributable = escrowAmount - feeAmount;

  const buyerAmount =
    (distributable * BigInt(appliedBuyerShareBps)) / BigInt(BPS_DENOMINATOR);
  const sellerAmount = distributable - buyerAmount;

  return {
    outcome,
    grossAmount: escrowAmount,
    feeAmount,
    buyerAmount,
    sellerAmount,
    buyerShareBps: appliedBuyerShareBps,
    sellerShareBps: appliedSellerShareBps,
  };
}

/**
 * A resolution submission is only valid when a written rationale is present.
 * The rationale is persisted to the dispute audit trail.
 */
export function isRationaleValid(rationale: string): boolean {
  return rationale.trim().length > 0;
}

export interface ResolutionSubmission {
  outcome: ResolutionOutcome;
  buyerShareBps?: number;
  rationale: string;
}

/**
 * Validate a mediator resolution submission before it is signed.
 * Returns a list of human readable errors; empty means valid.
 */
export function validateResolutionSubmission(
  submission: ResolutionSubmission,
): string[] {
  const errors: string[] = [];

  if (!isRationaleValid(submission.rationale)) {
    errors.push("A written rationale is required.");
  }

  try {
    resolveBuyerShareBps(submission.outcome, submission.buyerShareBps);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
}
