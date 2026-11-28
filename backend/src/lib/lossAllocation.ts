/**
 * Largest-remainder allocation for loss-ratio splits.
 *
 * When an escrow total is split according to BPS ratios, naive independent
 * rounding can leave dust (stroop-level remainders) that strand funds in the
 * contract or overpay one party. This module uses the largest-remainder method
 * (also known as Hamilton's method) to guarantee:
 *
 *   1. All allocations sum exactly to the total (zero-dust guarantee).
 *   2. Each party's share is within 1 stroop of its exact proportional share.
 *   3. Any remainder stroops are distributed to the parties with the largest
 *      fractional parts, which is the fairest deterministic allocation.
 *
 * The contract (Rust) and backend (TypeScript) should both use this algorithm
 * to guarantee parity. See ADR-002 addendum for the design rationale.
 */

const BPS_DIVISOR = 10_000n;

export interface AllocationInput {
  /** Total amount in stroops to be split. */
  total: bigint;
  /**
   * Basis-point shares for each party. Must sum to BPS_DIVISOR (10_000).
   * Example for 70/30 split: [7000, 3000]
   */
  sharesBps: bigint[];
}

export interface AllocationResult {
  /** Exact proportional amounts before rounding (for audit/debug). */
  exact: bigint[];
  /** Integer allocations that sum exactly to total. */
  allocated: bigint[];
  /** The total remainder stroops distributed. */
  remainder: bigint;
  /** Sum of allocated amounts — should equal total. */
  sum: bigint;
}

/**
 * Split `total` among parties according to `sharesBps` using the
 * largest-remainder method.
 *
 * @throws if sharesBps does not sum to BPS_DIVISOR
 * @throws if total or any share is negative
 */
export function largestRemainderAllocation(
  input: AllocationInput,
): AllocationResult {
  const { total, sharesBps } = input;

  if (total < 0n) {
    throw new Error("total must be non-negative");
  }

  const sharesSum = sharesBps.reduce((a, b) => a + b, 0n);
  if (sharesSum !== BPS_DIVISOR) {
    throw new Error(
      `sharesBps must sum to ${BPS_DIVISOR}, got ${sharesSum}`,
    );
  }

  if (sharesBps.some((s) => s < 0n)) {
    throw new Error("sharesBps must contain only non-negative values");
  }

  const n = sharesBps.length;

  // Step 1: Compute exact (fractional) allocations
  const exact: bigint[] = [];
  const floored: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];

  let assignedSum = 0n;

  for (let i = 0; i < n; i++) {
    const product = total * sharesBps[i];
    const exactValue = product; // keep as product for precision
    exact.push(exactValue);

    // Floor division: product / BPS_DIVISOR
    const floorValue = product / BPS_DIVISOR;
    floored.push(floorValue);
    assignedSum += floorValue;

    // Remainder = product mod BPS_DIVISOR
    const remainder = product - floorValue * BPS_DIVISOR;
    remainders.push({ index: i, remainder });
  }

  // Step 2: Distribute remaining stroops to parties with largest remainders
  let remainingStroops = total - assignedSum;

  // Sort by remainder descending (largest fractional parts first)
  remainders.sort((a, b) =>
    a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : 0,
  );

  const allocated = [...floored];
  for (let i = 0; i < n && remainingStroops > 0n; i++) {
    allocated[remainders[i].index] += 1n;
    remainingStroops -= 1n;
  }

  const sum = allocated.reduce((a, b) => a + b, 0n);

  return {
    exact: exact.map((e) => e / BPS_DIVISOR), // normalized for display
    allocated,
    remainder: total - assignedSum,
    sum,
  };
}

/**
 * Convenience wrapper for the common 2-party loss-ratio split.
 *
 * @param total - Escrow amount in stroops
 * @param buyerLossBps - Buyer's loss share (0..10_000)
 * @param sellerLossBps - Seller's loss share (0..10_000)
 * @returns [buyerAmount, sellerAmount] that sum exactly to total
 *
 * @throws if buyerLossBps + sellerLossBps !== 10_000
 */
export function splitLossRatio(
  total: bigint,
  buyerLossBps: bigint,
  sellerLossBps: bigint,
): [bigint, bigint] {
  if (buyerLossBps + sellerLossBps !== BPS_DIVISOR) {
    throw new Error(
      `buyerLossBps + sellerLossBps must equal ${BPS_DIVISOR}, got ${buyerLossBps + sellerLossBps}`,
    );
  }

  const result = largestRemainderAllocation({
    total,
    sharesBps: [buyerLossBps, sellerLossBps],
  });

  return [result.allocated[0], result.allocated[1]];
}

/**
 * Assert that allocations sum to total (zero-dust invariant).
 */
export function assertZeroDust(result: AllocationResult, total: bigint): void {
  if (result.sum !== total) {
    throw new Error(
      `zero-dust invariant violated: sum ${result.sum} ≠ total ${total}`,
    );
  }
}
