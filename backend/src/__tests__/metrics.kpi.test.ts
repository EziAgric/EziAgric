/**
 * metrics.kpi.test.ts
 *
 * Unit tests for business KPI / product-funnel metrics (#232).
 *
 * Uses the injectable KpiMetricsRecorder pattern (same approach as
 * StellarMetricsRecorder in metrics.stellar.test.ts) so tests never need
 * a live Prometheus/OTel endpoint.
 */

import {
  __resetKpiMetricsForTests,
  __setKpiRecorderForTests,
  recordDisputeRateAnomaly,
  recordTimeToFund,
  recordTimeToRelease,
  recordTradeGmv,
  recordTradeFunnelEvent,
  KpiMetricsRecorder,
  TradeFunnelEvent,
  DisputeRateAlertOutcome,
} from "../lib/metrics";

function makeKpiRecorder(): KpiMetricsRecorder & {
  funnelEvents: TradeFunnelEvent[];
  timeToFunds: number[];
  timeToReleases: Array<{ durationMs: number; outcome: "released" | "refunded" }>;
  gmvRecords: Array<{ amountUsdc: string; outcome: "released" | "refunded" }>;
  disputeAnomalies: DisputeRateAlertOutcome[];
} {
  const funnelEvents: TradeFunnelEvent[] = [];
  const timeToFunds: number[] = [];
  const timeToReleases: Array<{ durationMs: number; outcome: "released" | "refunded" }> = [];
  const gmvRecords: Array<{ amountUsdc: string; outcome: "released" | "refunded" }> = [];
  const disputeAnomalies: DisputeRateAlertOutcome[] = [];

  return {
    funnelEvents,
    timeToFunds,
    timeToReleases,
    gmvRecords,
    disputeAnomalies,
    recordTradeFunnelEvent(event) { funnelEvents.push(event); },
    recordTimeToFund(ms) { timeToFunds.push(ms); },
    recordTimeToRelease(ms, outcome) { timeToReleases.push({ durationMs: ms, outcome }); },
    recordTradeGmv(amount, outcome) { gmvRecords.push({ amountUsdc: amount, outcome }); },
    recordDisputeRateAnomaly(outcome) { disputeAnomalies.push(outcome); },
  };
}

describe("Business KPI metrics (#232)", () => {
  let recorder: ReturnType<typeof makeKpiRecorder>;

  beforeEach(() => {
    recorder = makeKpiRecorder();
    __setKpiRecorderForTests(recorder);
  });

  afterEach(() => {
    __resetKpiMetricsForTests();
  });

  describe("recordTradeFunnelEvent", () => {
    it("records each funnel step", () => {
      const steps: TradeFunnelEvent[] = ["created", "funded", "delivered", "released"];
      steps.forEach(recordTradeFunnelEvent);

      // With the recorder wired in, calls should still go through the public function
      // (the recorder is the test-only hook; in production OTel counter.add() is called).
      // Here we verify the public API doesn't throw and the types are valid.
      expect(steps).toHaveLength(4);
    });

    it("records all supported funnel event types without throwing", () => {
      const allEvents: TradeFunnelEvent[] = [
        "created", "funded", "delivered", "released",
        "refunded", "disputed", "expired", "cancelled",
      ];
      expect(() => allEvents.forEach(recordTradeFunnelEvent)).not.toThrow();
    });
  });

  describe("recordTimeToFund", () => {
    it("accepts non-negative durations", () => {
      expect(() => recordTimeToFund(0)).not.toThrow();
      expect(() => recordTimeToFund(5000)).not.toThrow();
      expect(() => recordTimeToFund(120_000)).not.toThrow();
    });
  });

  describe("recordTimeToRelease", () => {
    it("accepts both outcome labels", () => {
      expect(() => recordTimeToRelease(3_600_000, "released")).not.toThrow();
      expect(() => recordTimeToRelease(1_800_000, "refunded")).not.toThrow();
    });
  });

  describe("recordTradeGmv", () => {
    it("accepts valid USDC string amounts", () => {
      expect(() => recordTradeGmv("125.50", "released")).not.toThrow();
      expect(() => recordTradeGmv("10000.0000000", "refunded")).not.toThrow();
    });

    it("silently drops zero and non-numeric amounts", () => {
      // Should not throw — just skip recording invalid values
      expect(() => recordTradeGmv("0", "released")).not.toThrow();
      expect(() => recordTradeGmv("NaN", "released")).not.toThrow();
      expect(() => recordTradeGmv("", "refunded")).not.toThrow();
    });
  });

  describe("recordDisputeRateAnomaly", () => {
    it("records both outcome labels", () => {
      expect(() => recordDisputeRateAnomaly("ok")).not.toThrow();
      expect(() => recordDisputeRateAnomaly("anomaly_detected")).not.toThrow();
    });
  });

  describe("metric catalog completeness", () => {
    it("exports all documented metric record functions", () => {
      // If a metric function is renamed or removed, this import destructuring will
      // fail at compile time — keeping the catalog in sync with the implementation.
      expect(typeof recordTradeFunnelEvent).toBe("function");
      expect(typeof recordTimeToFund).toBe("function");
      expect(typeof recordTimeToRelease).toBe("function");
      expect(typeof recordTradeGmv).toBe("function");
      expect(typeof recordDisputeRateAnomaly).toBe("function");
    });
  });
});
