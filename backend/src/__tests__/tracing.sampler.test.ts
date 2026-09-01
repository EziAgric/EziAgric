/**
 * tracing.sampler.test.ts
 *
 * Unit tests for the TailBasedSampler (#231).
 * Verifies the four sampling rules without requiring a live OTel pipeline.
 */

import { SpanKind } from "@opentelemetry/api";
import { TailBasedSampler, __resetSamplerForTests } from "../config/tracing";

// Pull in SamplingDecision from the real OTel API
const { SamplingDecision } = require("@opentelemetry/api") as typeof import("@opentelemetry/api");

function makeSampler(overrides: Record<string, number> = {}, baselineRate = 0.1) {
  return new TailBasedSampler({ baselineRate, routeOverrides: overrides });
}

function sample(
  sampler: TailBasedSampler,
  url: string,
  statusCode?: number,
  error?: boolean,
) {
  const attrs: Record<string, string | number | boolean> = {
    "http.url": url,
  };
  if (statusCode !== undefined) attrs["http.status_code"] = statusCode;
  if (error !== undefined) attrs["error"] = error;

  const fakeContext = {} as any;
  return sampler.shouldSample(fakeContext, "abc123", `GET ${url}`, SpanKind.SERVER, attrs);
}

describe("TailBasedSampler", () => {
  afterEach(() => {
    __resetSamplerForTests();
    delete process.env.TRACE_BASELINE_RATE;
    delete process.env.TRACE_SLOW_THRESHOLD_MS;
    delete process.env.TRACE_ROUTE_OVERRIDES;
  });

  describe("Rule 1 — never-sample routes", () => {
    it("drops /health requests", () => {
      const s = makeSampler();
      const result = sample(s, "/health");
      expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it("drops /health/detail requests", () => {
      const s = makeSampler();
      expect(sample(s, "/health/detail").decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it("drops /metrics requests", () => {
      const s = makeSampler();
      expect(sample(s, "/metrics").decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it("drops /api/docs requests", () => {
      const s = makeSampler();
      expect(sample(s, "/api/docs").decision).toBe(SamplingDecision.NOT_RECORD);
    });
  });

  describe("Rule 2 — high-value payout routes always kept", () => {
    const payoutRoutes = [
      "/trades/abc123/release",
      "/trades/T-99/deposit",
      "/trades/T-99/dispute",
      "/trades/T-99/confirm",
      "/escrow/payout",
      "/treasury/withdraw",
      "/admin/streams/s-1/clawback",
      "/admin/contract/mediators",
    ];

    it.each(payoutRoutes)("always keeps %s", (url) => {
      const s = makeSampler();
      const result = sample(s, url);
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(result.attributes?.["sampling.rule"]).toBe("high_value_route");
    });
  });

  describe("Rule 3 — error spans always kept", () => {
    it("keeps a 400 response on a non-high-value route", () => {
      const s = makeSampler();
      const result = sample(s, "/users/profile", 400);
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(result.attributes?.["sampling.rule"]).toBe("error");
    });

    it("keeps a 500 response", () => {
      const s = makeSampler();
      const result = sample(s, "/auth/login", 500);
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(result.attributes?.["sampling.rule"]).toBe("error");
    });

    it("keeps a span with error=true even if status code is missing", () => {
      const s = makeSampler();
      const result = sample(s, "/webhooks/1/logs", undefined, true);
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(result.attributes?.["sampling.rule"]).toBe("error");
    });
  });

  describe("Rule 4 — per-route overrides", () => {
    it("drops a route with override rate=0", () => {
      const s = makeSampler({ "/stellar/fees": 0 });
      const result = sample(s, "/stellar/fees");
      expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it("always keeps a route with override rate=1", () => {
      const s = makeSampler({ "/wallet": 1 });
      const result = sample(s, "/wallet/balance");
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(result.attributes?.["sampling.rule"]).toBe("route_override");
    });

    it("uses the longest matching prefix", () => {
      const s = makeSampler({ "/trades": 1, "/trades/export": 0 });
      // exact /trades/export prefix → rate 0 → drop
      const exportResult = sample(s, "/trades/export");
      expect(exportResult.decision).toBe(SamplingDecision.NOT_RECORD);
    });
  });

  describe("Rule 5 — baseline probabilistic sampling", () => {
    it("always keeps with baseline rate=1", () => {
      const s = new TailBasedSampler({ baselineRate: 1 });
      const result = sample(s, "/users/123");
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(result.attributes?.["sampling.rule"]).toBe("baseline");
    });

    it("never keeps with baseline rate=0", () => {
      const s = new TailBasedSampler({ baselineRate: 0 });
      // Run 20 times to confirm it never samples with rate=0
      for (let i = 0; i < 20; i++) {
        expect(sample(s, "/users/123").decision).toBe(SamplingDecision.NOT_RECORD);
      }
    });

    it("never-sample rules still override baseline rate=1", () => {
      const s = new TailBasedSampler({ baselineRate: 1 });
      expect(sample(s, "/health").decision).toBe(SamplingDecision.NOT_RECORD);
    });
  });

  describe("env-driven config", () => {
    it("reads TRACE_BASELINE_RATE from process.env", () => {
      process.env.TRACE_BASELINE_RATE = "1"; // 100%
      const s = new TailBasedSampler(); // reads env fresh
      // A generic route should always be kept with rate=1
      const result = sample(s, "/users/profile");
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it("reads TRACE_ROUTE_OVERRIDES JSON from process.env", () => {
      process.env.TRACE_ROUTE_OVERRIDES = JSON.stringify({ "/wallet": 0 });
      const s = new TailBasedSampler();
      const result = sample(s, "/wallet/balance");
      expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it("ignores malformed TRACE_ROUTE_OVERRIDES JSON without throwing", () => {
      process.env.TRACE_ROUTE_OVERRIDES = "not json {{";
      expect(() => new TailBasedSampler()).not.toThrow();
    });
  });

  describe("sampler description", () => {
    it("has a human-readable description", () => {
      const s = new TailBasedSampler();
      expect(s.description).toBe("TailBasedSampler");
    });
  });
});
