/**
 * Unified platform fee computation for all trade outcomes.
 *
 * The on-chain contract applies fees differently depending on the outcome:
 *   - release_funds:  fee = amount * fee_bps / 10_000 (full amount)
 *   - resolve_dispute: fee = seller_raw * fee_bps / 10_000 (seller's portion only)
 *
 * This module centralises the backend mirror of that logic so every code path
 * (release, refund, split, clawback) references a single audited function.
 *
 * All division here goes through `money.ts` under `CONTRACT_ROUNDING`, which
 * truncates toward zero exactly as Soroban i128 division does. The rounding
 * policy is deliberately *not* the fairer banker's rounding used elsewhere in
 * the backend: this module's job is to predict what the chain will do, and a
 * backend that rounds more fairly than the contract simply disagrees with it.
 * The truncated fraction is returned as `feeDust` rather than dropped, so the
 * platform's under-collection on each trade is a recorded quantity (#177).
 *
 * Fee matrix per trade outcome:
 *   ┌──────────────┬────────────────────────────────────────────────────┐
 *   │ Outcome       │ Fee calculation                                   │
 *   ├──────────────┼────────────────────────────────────────────────────┤
 *   │ RELEASE       │ fee = amount * fee_bps / 10_000                   │
 *   │               │ seller_net = amount - fee                         │
 *   │               │ buyer_refund = 0                                  │
 *   ├──────────────┼────────────────────────────────────────────────────┤
 *   │ REFUND        │ fee = 0 (buyer gets full refund, no fee)          │
 *   │               │ seller_net = 0                                    │
 *   │               │ buyer_refund = amount                             │
 *   ├──────────────┼────────────────────────────────────────────────────┤
 *   │ SPLIT         │ loss_bps = 10_000 - seller_gets_bps               │
 *   │ (dispute)     │ seller_loss = amount * loss_bps * seller_loss_bps │
 *   │               │                    / (10_000 * 10_000)            │
 *   │               │ seller_raw = amount - seller_loss                 │
 *   │               │ fee = seller_raw * fee_bps / 10_000              │
 *   │               │ seller_net = seller_raw - fee                    │
 *   │               │ buyer_refund = amount - seller_raw               │
 *   ├──────────────┼────────────────────────────────────────────────────┤
 *   │ FULL_SELLER   │ fee = amount * fee_bps / 10_000                   │
 *   │               │ seller_net = amount - fee                         │
 *   │               │ buyer_refund = 0                                  │
 *   ├──────────────┼────────────────────────────────────────────────────┤
 *   │ FULL_BUYER    │ fee = 0                                           │
 *   │               │ seller_net = 0                                    │
 *   │               │ buyer_refund = amount                             │
 *   └──────────────┴────────────────────────────────────────────────────┘
 */

import {
  BPS_DIVISOR,
  CONTRACT_ROUNDING,
  applyBps,
  divideWithPolicy,
} from "./money";

export type TradeOutcome =
  | "release"
  | "refund"
  | "split"
  | "full_seller"
  | "full_buyer";

export interface FeeBreakdown {
  outcome: TradeOutcome;
  total: string;
  fee: string;
  sellerNet: string;
  buyerRefund: string;
  feeBps: number;
  /**
   * Fractional stroops discarded by truncating the fee, expressed in
   * ten-thousandths of a stroop (the bps numerator's units). Always in
   * `[0, 10_000)`; zero when the fee divided evenly.
   *
   * This is fee the platform does not collect because the chain truncates.
   * It is reported rather than corrected — correcting it here would put the
   * backend out of step with the contract. Sum it across trades to size the
   * cumulative shortfall.
   */
  feeDust: string;
  /** ISO-8601 timestamp of when this calculation was performed. */
  calculatedAt: string;
}

/**
 * Compute platform fee for a release (happy path — no dispute).
 * Mirrors on-chain `release_funds()`.
 */
export function computeReleaseFee(
  amount: bigint,
  feeBps: number,
): FeeBreakdown {
  const { value: fee, residual } = applyBps(
    amount,
    BigInt(feeBps),
    CONTRACT_ROUNDING,
  );
  const sellerNet = amount - fee;

  return {
    outcome: "release",
    total: amount.toString(),
    fee: fee.toString(),
    sellerNet: sellerNet.toString(),
    buyerRefund: "0",
    feeBps,
    feeDust: residual.toString(),
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Compute platform fee for a full refund (buyer wins entirely).
 * No fee is charged on refunds.
 */
export function computeRefundFee(
  amount: bigint,
  feeBps: number,
): FeeBreakdown {
  return {
    outcome: "refund",
    total: amount.toString(),
    fee: "0",
    sellerNet: "0",
    buyerRefund: amount.toString(),
    feeBps,
    feeDust: "0",
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Compute platform fee for a dispute resolution with loss-sharing split.
 * Mirrors on-chain `resolve_dispute()`.
 *
 * @param amount - Total escrowed amount in stroops
 * @param sellerGetsBps - Mediator's ruling: 0..10_000
 * @param sellerLossBps - Pre-agreed seller loss share: 0..10_000
 * @param feeBps - Platform fee in basis points
 */
export function computeSplitFee(
  amount: bigint,
  sellerGetsBps: bigint,
  sellerLossBps: bigint,
  feeBps: number,
): FeeBreakdown {
  const lossBps = BPS_DIVISOR - sellerGetsBps;
  // Both bps factors are applied in one division so the intermediate product
  // is never rounded — rounding twice would compound the truncation.
  const { value: sellerLoss } = divideWithPolicy(
    amount * lossBps * sellerLossBps,
    BPS_DIVISOR * BPS_DIVISOR,
    CONTRACT_ROUNDING,
  );
  const sellerRaw = amount - sellerLoss;
  const buyerRefund = amount - sellerRaw;
  const { value: fee, residual } = applyBps(
    sellerRaw,
    BigInt(feeBps),
    CONTRACT_ROUNDING,
  );
  const sellerNet = sellerRaw - fee;

  return {
    outcome: "split",
    total: amount.toString(),
    fee: fee.toString(),
    sellerNet: sellerNet.toString(),
    buyerRefund: buyerRefund.toString(),
    feeBps,
    feeDust: residual.toString(),
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Compute platform fee for a full seller win (seller_gets_bps = 10_000).
 * Mirrors on-chain `resolve_dispute()` with seller_gets_bps = 10_000.
 */
export function computeFullSellerFee(
  amount: bigint,
  feeBps: number,
): FeeBreakdown {
  const { value: fee, residual } = applyBps(
    amount,
    BigInt(feeBps),
    CONTRACT_ROUNDING,
  );
  const sellerNet = amount - fee;

  return {
    outcome: "full_seller",
    total: amount.toString(),
    fee: fee.toString(),
    sellerNet: sellerNet.toString(),
    buyerRefund: "0",
    feeBps,
    feeDust: residual.toString(),
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Compute platform fee for a full buyer win (seller_gets_bps = 0).
 * Mirrors on-chain `resolve_dispute()` with seller_gets_bps = 0.
 */
export function computeFullBuyerFee(
  amount: bigint,
  feeBps: number,
): FeeBreakdown {
  return {
    outcome: "full_buyer",
    total: amount.toString(),
    fee: "0",
    sellerNet: "0",
    buyerRefund: amount.toString(),
    feeBps,
    feeDust: "0",
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Dispatch to the correct fee computation based on outcome.
 */
export function computeFee(
  outcome: TradeOutcome,
  amount: bigint,
  feeBps: number,
  sellerGetsBps: bigint = 10_000n,
  sellerLossBps: bigint = 5_000n,
): FeeBreakdown {
  switch (outcome) {
    case "release":
      return computeReleaseFee(amount, feeBps);
    case "refund":
      return computeRefundFee(amount, feeBps);
    case "split":
      return computeSplitFee(amount, sellerGetsBps, sellerLossBps, feeBps);
    case "full_seller":
      return computeFullSellerFee(amount, feeBps);
    case "full_buyer":
      return computeFullBuyerFee(amount, feeBps);
  }
}

/**
 * Assert the conservation invariant: seller_net + buyer_refund + fee == total.
 * Throws if violated.
 */
export function assertFeeConservation(breakdown: FeeBreakdown): void {
  const total = BigInt(breakdown.total);
  const sum =
    BigInt(breakdown.sellerNet) +
    BigInt(breakdown.buyerRefund) +
    BigInt(breakdown.fee);

  if (sum !== total) {
    throw new Error(
      `[${breakdown.outcome}] fee conservation violated: ` +
        `${breakdown.sellerNet} + ${breakdown.buyerRefund} + ${breakdown.fee} = ${sum} ` +
        `≠ ${breakdown.total}`,
    );
  }
}
