import { runPiiScan } from "../jobs/workers/piiLogScanner.worker";
import * as logSampleBuffer from "../lib/logSampleBuffer";
import { alertService } from "../services/alert.service";

jest.mock("../services/alert.service", () => ({
  alertService: { dispatch: jest.fn().mockResolvedValue(undefined) },
}));

describe("runPiiScan", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("reports a clean result and does not alert when the sample has no leaks", async () => {
    jest
      .spyOn(logSampleBuffer, "getRecentLogSample")
      .mockReturnValue([JSON.stringify({ event: "trade.created", email: "[REDACTED]" })]);

    const result = await runPiiScan();

    expect(result.findingCount).toBe(0);
    expect(result.linesScanned).toBe(1);
    expect(alertService.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches a pii_log_leak_detected alert without leaking the value when findings exist", async () => {
    jest
      .spyOn(logSampleBuffer, "getRecentLogSample")
      .mockReturnValue([JSON.stringify({ event: "webhook.failed", contact: "leaked@example.com" })]);

    const result = await runPiiScan();

    expect(result.findingCount).toBe(1);
    expect(alertService.dispatch).toHaveBeenCalledWith(
      "pii_log_leak_detected",
      expect.stringContaining("1 suspected leak"),
      expect.objectContaining({
        findingsByKind: { email: 1 },
        affectedPaths: ["contact"],
      }),
    );

    const alertCallArgs = JSON.stringify((alertService.dispatch as jest.Mock).mock.calls[0]);
    expect(alertCallArgs).not.toContain("leaked@example.com");
  });

  it("handles an empty sample without error", async () => {
    jest.spyOn(logSampleBuffer, "getRecentLogSample").mockReturnValue([]);

    const result = await runPiiScan();

    expect(result).toEqual({ linesScanned: 0, findingCount: 0, findingsByKind: {} });
  });
});
