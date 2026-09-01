/**
 * Shared money-math tests (#177).
 *
 * Covers the rounding policies, the dust carry-forward ledger, and the
 * invariants that make the module safe to put in front of currency division:
 *   - The residual always reconstructs the exact numerator.
 *   - Truncation matches Soroban i128 division (contract parity).
 *   - Carrying dust forward bounds total drift below one stroop, where
 *     independent truncation loses up to one stroop per window.
 *
 * The property tests use a seeded generator rather than a property-testing
 * dependency, so they are deterministic and reproducible from the seed alone.
 */

import {
  BPS_DIVISOR,
  CONTRACT_ROUNDING,
  DEFAULT_ROUNDING,
  DustLedger,
  RoundingPolicy,
  applyBps,
  divideWithPolicy,
} from "../lib/money";

/**
 * Deterministic 32-bit LCG (Numerical Recipes constants). Seeded per test so a
 * failure reproduces exactly from the seed printed in the test name.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const ALL_POLICIES: RoundingPolicy[] = [
  "trunc",
  "floor",
  "ceil",
  "half-up",
  "half-even",
];

describe("divideWithPolicy — exact division", () => {
  it("returns a zero residual and the exact quotient for every policy", () => {
    for (const policy of ALL_POLICIES) {
      const result = divideWithPolicy(1_000n, 10n, policy);
      expect(result.value).toBe(100n);
      expect(result.residual).toBe(0n);
    }
  });

  it("handles zero numerator", () => {
    for (const policy of ALL_POLICIES) {
      const result = divideWithPolicy(0n, BPS_DIVISOR, policy);
      expect(result.value).toBe(0n);
      expect(result.residual).toBe(0n);
    }
  });
});

describe("divideWithPolicy — positive remainders", () => {
  // 7/2 = 3.5 exactly — the boundary that separates half-up from half-even.
  it("resolves an exact 0.5 boundary per policy", () => {
    expect(divideWithPolicy(7n, 2n, "trunc").value).toBe(3n);
    expect(divideWithPolicy(7n, 2n, "floor").value).toBe(3n);
    expect(divideWithPolicy(7n, 2n, "ceil").value).toBe(4n);
    expect(divideWithPolicy(7n, 2n, "half-up").value).toBe(4n);
    // 3 is odd, so half-even moves to the even 4.
    expect(divideWithPolicy(7n, 2n, "half-even").value).toBe(4n);
  });

  it("half-even settles a 0.5 boundary down when the quotient is already even", () => {
    // 5/2 = 2.5; 2 is even, so half-even stays at 2 while half-up goes to 3.
    expect(divideWithPolicy(5n, 2n, "half-even").value).toBe(2n);
    expect(divideWithPolicy(5n, 2n, "half-up").value).toBe(3n);
  });

  it("rounds below and above the halfway point identically for both half policies", () => {
    // 4/3 = 1.33 -> 1;  5/3 = 1.67 -> 2
    for (const policy of ["half-up", "half-even"] as RoundingPolicy[]) {
      expect(divideWithPolicy(4n, 3n, policy).value).toBe(1n);
      expect(divideWithPolicy(5n, 3n, policy).value).toBe(2n);
    }
  });
});

describe("divideWithPolicy — negative numerators", () => {
  it("distinguishes trunc from floor", () => {
    // -7/2 = -3.5
    expect(divideWithPolicy(-7n, 2n, "trunc").value).toBe(-3n);
    expect(divideWithPolicy(-7n, 2n, "floor").value).toBe(-4n);
    expect(divideWithPolicy(-7n, 2n, "ceil").value).toBe(-3n);
  });

  it("rounds exact halves away from zero under half-up", () => {
    expect(divideWithPolicy(-7n, 2n, "half-up").value).toBe(-4n);
    expect(divideWithPolicy(-5n, 2n, "half-up").value).toBe(-3n);
  });

  it("is symmetric under half-even", () => {
    // -7/2 = -3.5 -> -4 (even); -5/2 = -2.5 -> -2 (even)
    expect(divideWithPolicy(-7n, 2n, "half-even").value).toBe(-4n);
    expect(divideWithPolicy(-5n, 2n, "half-even").value).toBe(-2n);
  });
});

describe("divideWithPolicy — guards", () => {
  it("rejects a zero denominator", () => {
    expect(() => divideWithPolicy(1n, 0n, "trunc")).toThrow(
      /denominator must be positive/,
    );
  });

  it("rejects a negative denominator", () => {
    expect(() => divideWithPolicy(1n, -10n, "trunc")).toThrow(
      /denominator must be positive/,
    );
  });
});

describe("divideWithPolicy — i128 range", () => {
  // The contract stores amounts as i128; the backend must not lose precision
  // anywhere inside that range.
  const I128_MAX = 2n ** 127n - 1n;
  const I128_MIN = -(2n ** 127n);

  it("divides i128::MAX without precision loss", () => {
    const result = divideWithPolicy(I128_MAX, BPS_DIVISOR, "trunc");
    expect(result.value * BPS_DIVISOR + result.residual).toBe(I128_MAX);
  });

  it("divides i128::MIN without precision loss", () => {
    const result = divideWithPolicy(I128_MIN, BPS_DIVISOR, "half-even");
    expect(result.value * BPS_DIVISOR + result.residual).toBe(I128_MIN);
  });

  it("applies a bps ratio to a very large amount exactly", () => {
    const amount = 10n ** 30n;
    const { value, residual } = applyBps(amount, 250n, "trunc");
    expect(value).toBe((amount * 250n) / BPS_DIVISOR);
    expect(residual).toBe(0n);
  });
});

describe("applyBps", () => {
  it("computes a 2.5% fee", () => {
    expect(applyBps(1_000_000n, 250n, "trunc").value).toBe(25_000n);
  });

  it("returns the truncated fraction as the residual", () => {
    // 1001 * 250 = 250_250; 250_250 / 10_000 = 25 remainder 250
    const { value, residual } = applyBps(1_001n, 250n, "trunc");
    expect(value).toBe(25n);
    expect(residual).toBe(250n);
  });

  it("treats 10_000 bps as the identity", () => {
    const { value, residual } = applyBps(123_456_789n, BPS_DIVISOR, "trunc");
    expect(value).toBe(123_456_789n);
    expect(residual).toBe(0n);
  });

  it("treats 0 bps as zero", () => {
    expect(applyBps(123_456_789n, 0n, "trunc").value).toBe(0n);
  });

  it("rejects negative bps", () => {
    expect(() => applyBps(100n, -1n, "trunc")).toThrow(
      /bps must not be negative/,
    );
  });
});

describe("contract parity", () => {
  it("CONTRACT_ROUNDING truncates toward zero, matching Soroban i128 division", () => {
    expect(CONTRACT_ROUNDING).toBe("trunc");
    const cases: Array<[bigint, bigint]> = [
      [7n, 2n],
      [-7n, 2n],
      [999_999n, 10_000n],
      [-999_999n, 10_000n],
    ];
    for (const [numerator, denominator] of cases) {
      expect(divideWithPolicy(numerator, denominator, CONTRACT_ROUNDING).value)
        .toBe(numerator / denominator);
    }
  });

  it("DEFAULT_ROUNDING is banker's rounding for backend-authoritative money", () => {
    expect(DEFAULT_ROUNDING).toBe("half-even");
  });
});

describe("DustLedger — carry-forward", () => {
  it("pays a whole stroop once the carried fractions accumulate to one", () => {
    // Each window accrues 0.25 stroops (2_500/10_000). Truncated independently
    // every window pays 0, forever. Carried forward, the fourth window pays 1.
    const ledger = new DustLedger("trunc");
    const paid = [1, 2, 3, 4].map(() => ledger.accrue(2_500n).value);
    expect(paid).toEqual([0n, 0n, 0n, 1n]);
    expect(ledger.residual).toBe(0n);
  });

  it("keeps cumulative drift below one stroop across many windows", () => {
    const windows = 1_000;
    const perWindow = 3_333n; // 0.3333 stroops per window

    const ledger = new DustLedger("trunc");
    let carried = 0n;
    let dropped = 0n;
    for (let i = 0; i < windows; i++) {
      carried += ledger.accrue(perWindow).value;
      // What the same window pays when truncated in isolation, as the code
      // did before the ledger existed.
      dropped += perWindow / BPS_DIVISOR;
    }

    const exact = (perWindow * BigInt(windows)) / BPS_DIVISOR;
    // Carry-forward lands within one stroop of the exact total...
    expect(exact - carried).toBeLessThan(1n);
    // ...whereas truncating each window independently pays nothing at all.
    expect(dropped).toBe(0n);
  });

  it("resumes from a persisted residual", () => {
    const first = new DustLedger("trunc");
    first.accrue(7_500n); // pays 0, holds 7_500
    expect(first.residual).toBe(7_500n);

    const resumed = new DustLedger("trunc", first.residual);
    // 7_500 carried + 2_500 new == exactly one stroop.
    expect(resumed.accrue(2_500n).value).toBe(1n);
    expect(resumed.residual).toBe(0n);
  });

  it("accrueBps folds a bps ratio into the carried residual", () => {
    const ledger = new DustLedger("trunc");
    // 3 stroops at 5_000 bps == 1.5 stroops per window.
    expect(ledger.accrueBps(3n, 5_000n).value).toBe(1n);
    expect(ledger.accrueBps(3n, 5_000n).value).toBe(2n);
  });

  it("settle releases held whole units and keeps the fraction", () => {
    const ledger = new DustLedger("trunc", 25_000n);
    expect(ledger.settle()).toBe(2n);
    expect(ledger.residual).toBe(5_000n);
  });

  it("settle is a no-op when the residual is sub-stroop", () => {
    const ledger = new DustLedger("trunc", 9_999n);
    expect(ledger.settle()).toBe(0n);
    expect(ledger.residual).toBe(9_999n);
  });

  it("rejects a non-positive denominator", () => {
    expect(() => new DustLedger("trunc", 0n, 0n)).toThrow(
      /denominator must be positive/,
    );
  });
});

describe("property: residual always reconstructs the numerator", () => {
  const SEED = 20260828;

  it.each(ALL_POLICIES)(
    "value * denominator + residual == numerator (%s, seed 20260828)",
    (policy) => {
      const next = seededRandom(SEED);
      for (let i = 0; i < 500; i++) {
        // Mix magnitudes and signs; denominators stay positive by contract.
        const magnitude = BigInt(Math.floor(next() * 1_000_000_000));
        const sign = next() < 0.5 ? -1n : 1n;
        const numerator = sign * magnitude;
        const denominator = BigInt(Math.floor(next() * 10_000) + 1);

        const { value, residual } = divideWithPolicy(
          numerator,
          denominator,
          policy,
        );

        expect(value * denominator + residual).toBe(numerator);
        // Rounding never moves the result by a whole unit or more.
        const absResidual = residual < 0n ? -residual : residual;
        expect(absResidual).toBeLessThan(denominator);
      }
    },
  );
});

describe("property: carry-forward never overpays or underpays by a stroop", () => {
  it("total paid stays within one stroop of the exact total (seed 987654)", () => {
    const next = seededRandom(987654);

    for (let trial = 0; trial < 50; trial++) {
      const windows = Math.floor(next() * 200) + 1;
      const amount = BigInt(Math.floor(next() * 1_000_000) + 1);
      const bps = BigInt(Math.floor(next() * 10_000) + 1);

      const ledger = new DustLedger("trunc");
      let paid = 0n;
      for (let w = 0; w < windows; w++) {
        paid += ledger.accrueBps(amount, bps).value;
      }
      paid += ledger.settle();

      const exact = (amount * bps * BigInt(windows)) / BPS_DIVISOR;
      const drift = exact > paid ? exact - paid : paid - exact;
      expect(drift).toBeLessThanOrEqual(1n);
    }
  });
});
