/**
 * Frontend fee-math parity (#423).
 *
 * The frontend must predict the same 1% (truncating) fee the backend
 * (`backend/src/lib/feeComputation.ts`) and the Soroban contract produce. The
 * shared corpus in `shared-test-fixtures/` is the same fixture the Rust and
 * backend parity tests replay, so agreeing with it means agreeing everywhere.
 */
import * as fs from "fs";
import * as path from "path";
import {
  BPS_DIVISOR,
  DEFAULT_PLATFORM_FEE_BPS,
  computeFeeBreakdown,
  computeFeeBreakdownFromDecimal,
  formatFeeAmount,
  formatFeePercent,
} from "../feeBreakdown";

interface FeeCase {
  id: number;
  amount: number;
  fee_bps: number;
  expected_fee: number;
  expected_seller_amount: number;
}

interface ReleaseCase {
  id: number;
  amount: number;
  fee_bps: number;
  seller_amount: number;
  fee_amount: number;
}

interface Corpus {
  generator: { bps_divisor: number };
  fixtures: {
    fee_boundary: FeeCase[];
    fee_generated: FeeCase[];
    release_funds_conservation: ReleaseCase[];
  };
}

function loadCorpus(): Corpus {
  const corpusPath = path.resolve(
    __dirname,
    "../../../../shared-test-fixtures/money_math_corpus.json",
  );
  return JSON.parse(fs.readFileSync(corpusPath, "utf-8"));
}

describe("computeFeeBreakdown", () => {
  it("uses the same bps divisor as the contract/backend", () => {
    expect(BPS_DIVISOR).toBe(BigInt(10_000));
    expect(DEFAULT_PLATFORM_FEE_BPS).toBe(100);
  });

  it("takes exactly 1% of an even amount", () => {
    const result = computeFeeBreakdown(BigInt(10_000));
    expect(result).toEqual({
      gross: "10000",
      fee: "100",
      net: "9900",
      feeBps: 100,
    });
  });

  it("truncates (never over-collects the platform fee)", () => {
    // 9_999 * 100 / 10_000 = 99.99 -> 99, mirroring Soroban i128 division.
    expect(computeFeeBreakdown(BigInt(9_999)).fee).toBe("99");
    // 1 stroop at 1% floors to zero — the seller keeps everything.
    expect(computeFeeBreakdown(BigInt(1)).fee).toBe("0");
    expect(computeFeeBreakdown(BigInt(1)).net).toBe("1");
  });

  it("conserves value: fee + net === gross", () => {
    const { gross, fee, net } = computeFeeBreakdown(BigInt(123_456), 100);
    expect(BigInt(fee) + BigInt(net)).toBe(BigInt(gross));
  });

  it("accepts an amount as a string", () => {
    expect(computeFeeBreakdown("20000").fee).toBe("200");
  });

  it("rejects negative amounts and invalid bps", () => {
    expect(() => computeFeeBreakdown(BigInt(-1))).toThrow(/negative/);
    expect(() => computeFeeBreakdown(BigInt(100), -1)).toThrow(/non-negative integer/);
    expect(() => computeFeeBreakdown(BigInt(100), 1.5)).toThrow(/non-negative integer/);
  });
});

describe("computeFeeBreakdownFromDecimal", () => {
  it("matches the integer path for whole-number input", () => {
    expect(computeFeeBreakdownFromDecimal("5000")).toEqual(
      computeFeeBreakdown(BigInt(5_000)),
    );
    expect(computeFeeBreakdownFromDecimal(5000)).toEqual(
      computeFeeBreakdown(BigInt(5_000)),
    );
  });

  it("keeps decimal precision without floating-point drift", () => {
    // Scaled to the input's own precision (1 dp): 125 tenths * 1% = 1.25
    // tenths -> truncated to 1 tenth = 0.1.
    const result = computeFeeBreakdownFromDecimal("12.5");
    expect(result.fee).toBe("0.1");
    expect(result.net).toBe("12.4");
  });

  it("does not use floating point for large amounts", () => {
    // 12.5 * 1% as a float is 0.125; truncating the exact decimal must give
    // 0.12, not a binary-float artefact.
    const result = computeFeeBreakdownFromDecimal("12.50");
    expect(result.fee).toBe("0.12");
    expect(result.net).toBe("12.38");
  });

  it("rejects malformed amounts", () => {
    expect(() => computeFeeBreakdownFromDecimal("abc")).toThrow(/invalid/);
    expect(() => computeFeeBreakdownFromDecimal("-5")).toThrow(/invalid/);
  });
});

describe("formatting helpers", () => {
  it("formats bps as a percentage", () => {
    expect(formatFeePercent(100)).toBe("1%");
    expect(formatFeePercent(250)).toBe("2.5%");
    expect(formatFeePercent(50)).toBe("0.5%");
  });

  it("groups amounts with thousands separators", () => {
    expect(formatFeeAmount(1_234_567)).toBe("1,234,567");
    expect(formatFeeAmount("5000")).toBe("5,000");
    expect(formatFeeAmount("12.5")).toBe("12.5");
  });
});

describe("shared money-math corpus parity", () => {
  const corpus = loadCorpus();

  it("has a matching bps divisor", () => {
    expect(corpus.generator.bps_divisor).toBe(Number(BPS_DIVISOR));
  });

  it("matches every fee_boundary case", () => {
    for (const { id, amount, fee_bps, expected_fee, expected_seller_amount } of corpus.fixtures.fee_boundary) {
      const result = computeFeeBreakdown(BigInt(amount), fee_bps);
      expect({ id, fee: result.fee, net: result.net }).toEqual({
        id,
        fee: String(expected_fee),
        net: String(expected_seller_amount),
      });
    }
  });

  /**
   * The corpus computes `expected_fee` with `Math.floor((amount * bps) / 10_000)`
   * on JS numbers, so for amounts whose `amount * bps` product exceeds
   * `Number.MAX_SAFE_INTEGER` its expectation carries a float rounding error.
   * Within the safe range we must agree with it exactly.
   */
  const productIsSafe = (amount: number, bps: number) =>
    Number.isSafeInteger(amount * bps);

  it("matches every fee_generated case inside the exact-float range", () => {
    const cases = corpus.fixtures.fee_generated.filter((c) =>
      productIsSafe(c.amount, c.fee_bps),
    );
    expect(cases.length).toBeGreaterThan(0);

    for (const { id, amount, fee_bps, expected_fee, expected_seller_amount } of cases) {
      const result = computeFeeBreakdown(BigInt(amount), fee_bps);
      expect({ id, fee: result.fee, net: result.net }).toEqual({
        id,
        fee: String(expected_fee),
        net: String(expected_seller_amount),
      });
    }
  });

  it("matches every release_funds_conservation case and conserves value", () => {
    for (const { id, amount, fee_bps, seller_amount, fee_amount } of corpus.fixtures.release_funds_conservation) {
      const result = computeFeeBreakdown(BigInt(amount), fee_bps);

      if (productIsSafe(amount, fee_bps)) {
        expect({ id, fee: result.fee, net: result.net }).toEqual({
          id,
          fee: String(fee_amount),
          net: String(seller_amount),
        });
      }

      // Conservation holds regardless of the corpus' float precision.
      expect(BigInt(result.fee) + BigInt(result.net)).toBe(BigInt(result.gross));
    }
  });

  it("stays exact beyond the float-precision boundary (better than the corpus)", () => {
    const unsafe = [
      ...corpus.fixtures.fee_generated,
      ...corpus.fixtures.release_funds_conservation,
    ].filter((c) => !productIsSafe(c.amount, c.fee_bps));

    expect(unsafe.length).toBeGreaterThan(0);

    for (const c of unsafe) {
      // Exact integer math — what the contract's i128 division produces.
      const exactFee = (BigInt(c.amount) * BigInt(c.fee_bps)) / BPS_DIVISOR;
      const result = computeFeeBreakdown(BigInt(c.amount), c.fee_bps);
      expect(result.fee).toBe(exactFee.toString());
      expect(result.net).toBe((BigInt(c.amount) - exactFee).toString());
    }
  });
});
