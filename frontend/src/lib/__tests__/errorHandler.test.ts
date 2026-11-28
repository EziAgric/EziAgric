import { ApiError } from "../api/client";
import { getErrorInfo, isForbiddenError } from "../errorHandler";

describe("isForbiddenError", () => {
  it("returns true for a plain 403 ApiError with no structured backend code", () => {
    const error = new ApiError(403, "Forbidden: admin access required", {
      error: "Forbidden: admin access required",
    });

    expect(isForbiddenError(error)).toBe(true);
  });

  it("returns false for a 401 ApiError", () => {
    const error = new ApiError(401, "Unauthorized", { error: "Unauthorized" });

    expect(isForbiddenError(error)).toBe(false);
  });

  it("returns false for a structured backend error that isn't TRADE_ACCESS_DENIED", () => {
    const error = new ApiError(403, "Domain error", {
      code: "DOMAIN_ERROR",
      message: "Domain error",
      details: {},
      timestamp: new Date().toISOString(),
    });

    expect(isForbiddenError(error)).toBe(false);
  });

  it("returns true for a structured TRADE_ACCESS_DENIED backend error", () => {
    const error = new ApiError(403, "Access denied", {
      code: "TRADE_ACCESS_DENIED",
      message: "Access denied",
      details: {},
      timestamp: new Date().toISOString(),
    });

    expect(isForbiddenError(error)).toBe(true);
  });

  it("returns false for a generic (non-ApiError) Error", () => {
    expect(isForbiddenError(new Error("boom"))).toBe(false);
  });
});

describe("getErrorInfo — admin operation error codes (#59)", () => {
  it("maps CLAWBACK_TOO_LARGE to a tailored message", () => {
    const error = new ApiError(400, "Clawback too large", {
      code: "CLAWBACK_TOO_LARGE",
      message: "Requested clawback 7501 exceeds remaining vested amount 7500",
      details: { remainingVested: "7500" },
      timestamp: new Date().toISOString(),
    });

    const info = getErrorInfo(error);

    expect(info.title).toBe("Amount Too Large");
    expect(info.message).toBe(
      "Requested clawback 7501 exceeds remaining vested amount 7500",
    );
    expect(info.type).toBe("warning");
  });

  it("maps CLAWBACK_INVALID_AMOUNT to a tailored message", () => {
    const error = new ApiError(400, "Invalid amount", {
      code: "CLAWBACK_INVALID_AMOUNT",
      message: "Clawback amount must be a positive integer",
      details: {},
      timestamp: new Date().toISOString(),
    });

    const info = getErrorInfo(error);

    expect(info.title).toBe("Invalid Amount");
    expect(info.type).toBe("warning");
  });

  it("falls back to a generic 403 message for the legacy admin-forbidden shape", () => {
    const error = new ApiError(403, "Forbidden: admin access required", {
      error: "Forbidden: admin access required",
    });

    const info = getErrorInfo(error);

    expect(info.title).toBe("Error 403");
    expect(info.type).toBe("error");
  });

  it("falls back to a generic 400 message for an unmapped structured code", () => {
    const error = new ApiError(400, "Bad request", {
      code: "SOME_UNMAPPED_CODE",
      message: "Bad request",
      details: {},
      timestamp: new Date().toISOString(),
    });

    const info = getErrorInfo(error);

    expect(info.message).toBe("Bad request");
    expect(info.type).toBe("warning");
  });

  it("falls back to a generic 500 message for an internal error", () => {
    const error = new ApiError(500, "Something broke", {
      error: "Something broke",
    });

    const info = getErrorInfo(error);

    expect(info.title).toBe("Error 500");
    expect(info.type).toBe("error");
  });
});
