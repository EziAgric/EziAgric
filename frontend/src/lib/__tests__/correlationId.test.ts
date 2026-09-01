/**
 * Tests for src/lib/correlationId.ts
 */

import {
  generateCorrelationId,
  extractBackendCorrelationId,
  resolveCorrelationId,
} from "../correlationId";

describe("generateCorrelationId", () => {
  it("returns a string matching amana-<base36>-<hex8> format", () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^amana-[0-9a-z]+-[0-9a-f]{8}$/);
  });

  it("generates unique IDs on successive calls", () => {
    const ids = Array.from({ length: 50 }, generateCorrelationId);
    const unique = new Set(ids);
    expect(unique.size).toBe(50);
  });
});

describe("extractBackendCorrelationId", () => {
  it("returns undefined for null", () => {
    expect(extractBackendCorrelationId(null)).toBeUndefined();
  });

  it("returns undefined for a plain string", () => {
    expect(extractBackendCorrelationId("oops")).toBeUndefined();
  });

  it("extracts correlationId from error.backendError", () => {
    const err = Object.assign(new Error("test"), {
      backendError: { correlationId: "backend-abc", requestId: "req-xyz" },
    });
    expect(extractBackendCorrelationId(err)).toBe("backend-abc");
  });

  it("falls back to requestId when correlationId absent on backendError", () => {
    const err = Object.assign(new Error("test"), {
      backendError: { requestId: "req-xyz" },
    });
    expect(extractBackendCorrelationId(err)).toBe("req-xyz");
  });

  it("extracts correlationId from error.data", () => {
    const err = Object.assign(new Error("test"), {
      data: { correlationId: "data-trace-001" },
    });
    expect(extractBackendCorrelationId(err)).toBe("data-trace-001");
  });

  it("returns undefined when neither backendError nor data present", () => {
    expect(extractBackendCorrelationId(new Error("bare"))).toBeUndefined();
  });
});

describe("resolveCorrelationId", () => {
  it("prefers backend ID over client-generated ID", () => {
    const err = Object.assign(new Error("test"), {
      backendError: { correlationId: "backend-prefer-me" },
    });
    expect(resolveCorrelationId(err, "client-fallback")).toBe(
      "backend-prefer-me",
    );
  });

  it("falls back to clientId when no backend ID on error", () => {
    expect(resolveCorrelationId(new Error("bare"), "client-id-123")).toBe(
      "client-id-123",
    );
  });

  it("falls back to clientId when error is null", () => {
    expect(resolveCorrelationId(null, "client-id-456")).toBe("client-id-456");
  });
});
