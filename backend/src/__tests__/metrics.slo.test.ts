/**
 * metrics.slo.test.ts
 *
 * Unit tests for SLO SLI metrics (docs/slo.md). Uses the injectable
 * SloMetricsRecorder pattern (same approach as KpiMetricsRecorder) so tests
 * never need a live Prometheus/OTel endpoint.
 */

import {
  __resetSloMetricsForTests,
  __setSloRecorderForTests,
  recordEventListenerLag,
  SloMetricsRecorder,
} from "../lib/metrics";

function makeSloRecorder(): SloMetricsRecorder & { lagSeconds: number[] } {
  const lagSeconds: number[] = [];
  return {
    lagSeconds,
    recordEventListenerLag(seconds) {
      lagSeconds.push(seconds);
    },
  };
}

describe("SLO SLI metrics", () => {
  let recorder: ReturnType<typeof makeSloRecorder>;

  beforeEach(() => {
    recorder = makeSloRecorder();
    __setSloRecorderForTests(recorder);
  });

  afterEach(() => {
    __resetSloMetricsForTests();
  });

  it("records the event-processing lag SLI with the raw seconds", () => {
    recordEventListenerLag(120);
    recordEventListenerLag(5_000);
    expect(recorder.lagSeconds).toEqual([120, 5_000]);
  });

  it("forwards fractional and zero lag values", () => {
    recordEventListenerLag(0.5);
    recordEventListenerLag(0);
    expect(recorder.lagSeconds).toEqual([0.5, 0]);
  });
});
