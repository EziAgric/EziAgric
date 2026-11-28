/**
 * Buffered Stellar fee estimation for congestion resilience.
 *
 * Tracking: issue #184 ("Buffer Soroban resource fee estimation for network
 * congestion"). The raw `GET /stellar/fees` proxy returned Horizon's numbers
 * verbatim; during congestion a base-fee estimate is not enough to get a
 * transaction included. This module:
 *
 *   1. picks a percentile from recent-ledger fee stats,
 *   2. applies a configurable safety multiplier (larger when congested),
 *   3. clamps the result to a sane [min, max] stroop range,
 *   4. exposes a `bumpFee` step and a `withFeeBumpRetry` wrapper for the
 *      "retry with a higher fee on timeout-style failure" path,
 *   5. exposes `sizeResourceFee` to fold a simulation's `minResourceFee` into
 *      the total for Soroban invocations.
 *
 * It is deliberately free of network / SDK imports so it is pure and unit
 * testable with plain objects.
 */

import { runtimeEnvValue } from "../config/env";

/** Percentile keys present on Horizon `fee_charged` / `max_fee` objects. */
export type FeePercentile =
  | "p10" | "p20" | "p30" | "p40" | "p50"
  | "p60" | "p70" | "p80" | "p90" | "p95" | "p99";

/** Structural subset of Horizon's `FeeStatsResponse` we depend on. */
export interface FeeStatsLike {
  last_ledger?: string;
  last_ledger_base_fee?: string;
  ledger_capacity_usage?: string;
  fee_charged?: Partial<Record<FeePercentile | "min" | "max" | "mode", string>>;
  max_fee?: Partial<Record<FeePercentile | "min" | "max" | "mode", string>>;
}

export interface FeeBufferOptions {
  /** Percentile of `fee_charged` to base the estimate on. */
  percentile: FeePercentile;
  /** Multiplier applied to the percentile fee under normal conditions. */
  safetyMultiplier: number;
  /** Extra factor multiplied on top of `safetyMultiplier` when congested. */
  congestionBoost: number;
  /** `ledger_capacity_usage` (0..1) at or above which the network is "congested". */
  congestionCapacity: number;
  /** percentileFee / baseFee ratio at or above which the network is "congested". */
  congestionFeeRatio: number;
  /** Lower clamp, stroops. */
  minStroops: number;
  /** Upper clamp, stroops. */
  maxStroops: number;
}

export interface BufferedFeeEstimate {
  /** `last_ledger_base_fee`, or 100 if absent. */
  baseFee: number;
  percentile: FeePercentile;
  /** `fee_charged[percentile]`, falling back to `fee_charged.max` then `baseFee`. */
  percentileFee: number;
  /** `ledger_capacity_usage` as a number in [0, 1] (0 if absent/unparseable). */
  ledgerCapacityUsage: number;
  congested: boolean;
  /** Effective multiplier actually applied (`safetyMultiplier` or that × `congestionBoost`). */
  multiplier: number;
  /** Final recommended per-operation inclusion fee, stroops, clamped. */
  bufferedFee: number;
  /** True when the clamp to `maxStroops` was the binding constraint. */
  cappedAtMax: boolean;
}

const DEFAULT_BASE_FEE = 100;

export function feeBufferOptionsFromEnv(): FeeBufferOptions {
  return {
    percentile: runtimeEnvValue("STELLAR_FEE_PERCENTILE") as FeePercentile,
    safetyMultiplier: runtimeEnvValue("STELLAR_FEE_SAFETY_MULTIPLIER"),
    congestionBoost: runtimeEnvValue("STELLAR_FEE_CONGESTION_BOOST"),
    congestionCapacity: runtimeEnvValue("STELLAR_FEE_CONGESTION_CAPACITY"),
    congestionFeeRatio: runtimeEnvValue("STELLAR_FEE_CONGESTION_FEE_RATIO"),
    minStroops: runtimeEnvValue("STELLAR_FEE_MIN_STROOPS"),
    maxStroops: runtimeEnvValue("STELLAR_FEE_MAX_STROOPS"),
  };
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Returns whether the network looks congested given fee stats and thresholds.
 * Congested when ledger capacity usage is high OR the chosen percentile fee has
 * pulled well above the base fee.
 */
export function isCongested(
  feeStats: FeeStatsLike,
  opts: FeeBufferOptions = feeBufferOptionsFromEnv(),
): boolean {
  const baseFee = toInt(feeStats.last_ledger_base_fee, DEFAULT_BASE_FEE) || DEFAULT_BASE_FEE;
  const capacity = clamp(toFloat(feeStats.ledger_capacity_usage, 0), 0, 1);
  const percentileFee =
    toInt(feeStats.fee_charged?.[opts.percentile], 0) ||
    toInt(feeStats.fee_charged?.max, baseFee);
  return (
    capacity >= opts.congestionCapacity ||
    percentileFee >= baseFee * opts.congestionFeeRatio
  );
}

/**
 * Compute a buffered per-operation inclusion fee from recent-ledger fee stats.
 */
export function computeBufferedFee(
  feeStats: FeeStatsLike,
  opts: FeeBufferOptions = feeBufferOptionsFromEnv(),
): BufferedFeeEstimate {
  const baseFee = toInt(feeStats.last_ledger_base_fee, DEFAULT_BASE_FEE) || DEFAULT_BASE_FEE;
  const ledgerCapacityUsage = clamp(toFloat(feeStats.ledger_capacity_usage, 0), 0, 1);
  const percentileFee =
    toInt(feeStats.fee_charged?.[opts.percentile], 0) ||
    toInt(feeStats.fee_charged?.max, 0) ||
    baseFee;

  const congested = isCongested(feeStats, opts);
  const multiplier = congested
    ? opts.safetyMultiplier * opts.congestionBoost
    : opts.safetyMultiplier;

  const raw = Math.ceil(Math.max(percentileFee, baseFee) * multiplier);
  const bufferedFee = clamp(raw, opts.minStroops, opts.maxStroops);

  return {
    baseFee,
    percentile: opts.percentile,
    percentileFee,
    ledgerCapacityUsage,
    congested,
    multiplier,
    bufferedFee,
    cappedAtMax: raw > opts.maxStroops,
  };
}

/** One retry step: raise a fee by `bumpFactor`, clamped to `maxStroops`. */
export function bumpFee(
  currentFee: number,
  opts?: { bumpFactor?: number; maxStroops?: number },
): number {
  const bumpFactor = opts?.bumpFactor ?? runtimeEnvValue("STELLAR_FEE_BUMP_FACTOR");
  const maxStroops = opts?.maxStroops ?? runtimeEnvValue("STELLAR_FEE_MAX_STROOPS");
  return Math.min(maxStroops, Math.ceil(currentFee * bumpFactor));
}

/**
 * Fold a Soroban simulation's `minResourceFee` into a total transaction fee.
 * `inclusionFee` is the buffered per-op fee from {@link computeBufferedFee}.
 */
export function sizeResourceFee(
  minResourceFee: string | number | undefined,
  inclusionFee: number,
): number {
  const resource =
    typeof minResourceFee === "number"
      ? minResourceFee
      : toInt(minResourceFee, 0);
  return Math.max(inclusionFee, resource + inclusionFee);
}

const TIMEOUT_LIKE = /timeout|timed out|tx_too_late|txtoolate|too late|504|502|try again|deadline exceeded/i;

/** Whether an error from a submit attempt is the "bump the fee and retry" kind. */
export function isTimeoutLikeFailure(err: unknown): boolean {
  if (err == null) return false;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  return TIMEOUT_LIKE.test(msg);
}

export interface FeeBumpRetryOptions {
  maxRetries?: number;
  bumpFactor?: number;
  maxStroops?: number;
  /** Called before each retry with the attempt index (1-based) and the new fee. */
  onRetry?: (attempt: number, nextFee: number, err: unknown) => void;
}

/**
 * Run `submit(fee)`, and on a timeout-style failure bump the fee and retry,
 * up to `maxRetries` times. Non-timeout errors propagate immediately.
 */
export async function withFeeBumpRetry<T>(
  submit: (fee: number) => Promise<T>,
  initialFee: number,
  opts: FeeBumpRetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? runtimeEnvValue("STELLAR_FEE_MAX_RETRIES");
  let fee = initialFee;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await submit(fee);
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isTimeoutLikeFailure(err)) {
        throw err;
      }
      fee = bumpFee(fee, { bumpFactor: opts.bumpFactor, maxStroops: opts.maxStroops });
      opts.onRetry?.(attempt + 1, fee, err);
    }
  }

  throw lastErr;
}
