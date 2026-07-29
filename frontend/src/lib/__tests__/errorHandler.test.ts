import { ApiError } from "../api/client";
import { isForbiddenError } from "../errorHandler";

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
