import { AdminNotificationService, AdminNotificationEvents, extractErrorInfo, StreamLockedPayload, StreamUnlockedPayload, StreamTerminatedPayload, OperationFailedPayload } from "../services/adminNotification.service";

describe("AdminNotificationService", () => {
  let service: AdminNotificationService;

  beforeEach(() => {
    service = new AdminNotificationService();
    service.removeAllListeners();
  });

  describe("notifyStreamLocked", () => {
    it("emits admin:stream:locked with correct payload", (done) => {
      const payload: StreamLockedPayload = {
        streamId: "stream-123",
        adminAddress: "GADMIN...",
        reason: "Maintenance",
        timestamp: "2026-07-30T12:00:00.000Z",
      };

      service.onSuccess(AdminNotificationEvents.STREAM_LOCKED, (received: StreamLockedPayload) => {
        expect(received).toEqual(payload);
        done();
      });

      service.notifyStreamLocked(payload);
    });
  });

  describe("notifyStreamUnlocked", () => {
    it("emits admin:stream:unlocked with correct payload", (done) => {
      const payload: StreamUnlockedPayload = {
        streamId: "stream-123",
        adminAddress: "GADMIN...",
        reason: "Maintenance complete",
        timestamp: "2026-07-30T12:00:00.000Z",
      };

      service.onSuccess(AdminNotificationEvents.STREAM_UNLOCKED, (received: StreamUnlockedPayload) => {
        expect(received).toEqual(payload);
        done();
      });

      service.notifyStreamUnlocked(payload);
    });
  });

  describe("notifyStreamTerminated", () => {
    it("emits admin:stream:terminated with correct payload", (done) => {
      const payload: StreamTerminatedPayload = {
        streamId: "stream-123",
        adminAddress: "GADMIN...",
        reason: "Fraud investigation",
        previousStatus: "ACTIVE",
        terminatedAt: "2026-07-30T12:00:00.000Z",
        unclaimed: "7500",
      };

      service.onSuccess(AdminNotificationEvents.STREAM_TERMINATED, (received: StreamTerminatedPayload) => {
        expect(received).toEqual(payload);
        done();
      });

      service.notifyStreamTerminated(payload);
    });
  });

  describe("notifyOperationFailed", () => {
    it("emits admin:operation:failed with correct payload", (done) => {
      const payload: OperationFailedPayload = {
        streamId: "stream-123",
        adminAddress: "GADMIN...",
        action: "STREAM_LOCK",
        error: { message: "Stream not found", code: "NOT_FOUND" },
        timestamp: "2026-07-30T12:00:00.000Z",
      };

      service.onFailure(AdminNotificationEvents.OPERATION_FAILED, (received: OperationFailedPayload) => {
        expect(received).toEqual(payload);
        done();
      });

      service.notifyOperationFailed(payload);
    });
  });

  describe("onSuccess / onFailure", () => {
    it("registers and fires a success listener", (done) => {
      service.onSuccess(AdminNotificationEvents.STREAM_LOCKED, () => done());
      service.notifyStreamLocked({
        streamId: "s1",
        adminAddress: "GA",
        reason: null,
        timestamp: "2026-01-01T00:00:00.000Z",
      });
    });

    it("registers and fires a failure listener", (done) => {
      service.onFailure(AdminNotificationEvents.OPERATION_FAILED, () => done());
      service.notifyOperationFailed({
        streamId: "s1",
        adminAddress: "GA",
        action: "STREAM_LOCK",
        error: { message: "fail" },
        timestamp: "2026-01-01T00:00:00.000Z",
      });
    });
  });
});

describe("extractErrorInfo", () => {
  it("extracts message from an AppError-like object", () => {
    const result = extractErrorInfo({ message: "Stream not found", code: "NOT_FOUND", details: { streamId: "s1" } });
    expect(result).toEqual({ message: "Stream not found", code: "NOT_FOUND", details: { streamId: "s1" } });
  });

  it("extracts message from an Error instance", () => {
    const result = extractErrorInfo(new Error("Something went wrong"));
    expect(result.message).toBe("Something went wrong");
    expect(result.code).toBeUndefined();
  });

  it("handles a string error", () => {
    const result = extractErrorInfo("raw error string");
    expect(result.message).toBe("raw error string");
    expect(result.code).toBeUndefined();
  });

  it("handles null error", () => {
    const result = extractErrorInfo(null);
    expect(result.message).toBe("null");
  });

  it("handles undefined error", () => {
    const result = extractErrorInfo(undefined);
    expect(result.message).toBe("undefined");
  });

  it("omits code when missing", () => {
    const result = extractErrorInfo({ message: "no code" });
    expect(result).toEqual({ message: "no code" });
  });

  it("omits details when missing", () => {
    const result = extractErrorInfo({ message: "no details" });
    expect(result).toEqual({ message: "no details" });
  });
});
