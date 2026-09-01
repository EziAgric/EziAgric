import type { Request } from "express";
import {
  deviceFingerprint,
  ipPrefixClass,
  deviceContextFromRequest,
} from "../deviceContext";

function reqWith(headers: Record<string, string>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

describe("ipPrefixClass", () => {
  it("masks IPv4 to the configured prefix width", () => {
    expect(ipPrefixClass("203.0.113.42", 24, 48)).toBe("v4/203.0.113.0/24");
    expect(ipPrefixClass("203.0.113.42", 16, 48)).toBe("v4/203.0.0.0/16");
    expect(ipPrefixClass("203.0.113.42", 32, 48)).toBe("v4/203.0.113.42/32");
  });

  it("unwraps IPv4-mapped IPv6 addresses", () => {
    expect(ipPrefixClass("::ffff:203.0.113.42", 24, 48)).toBe("v4/203.0.113.0/24");
  });

  it("masks IPv6 to the configured prefix width", () => {
    expect(ipPrefixClass("2001:db8:abcd:1234::1", 24, 48)).toBe(
      "v6/2001:db8:abcd:0:0:0:0:0/48",
    );
  });

  it("returns 'unknown' for missing or malformed input", () => {
    expect(ipPrefixClass(undefined, 24, 48)).toBe("unknown");
    expect(ipPrefixClass(null, 24, 48)).toBe("unknown");
    expect(ipPrefixClass("not-an-ip", 24, 48)).toBe("unknown");
    expect(ipPrefixClass("10.0.0.999", 24, 48)).toBe("unknown");
  });
});

describe("deviceFingerprint", () => {
  const base = {
    "user-agent": "Mozilla/5.0 (Macintosh)",
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="120"',
  };

  it("is a stable 64-hex-char sha256 for identical headers", () => {
    const a = deviceFingerprint(reqWith(base));
    const b = deviceFingerprint(reqWith({ ...base }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a bound header changes", () => {
    const a = deviceFingerprint(reqWith(base));
    const b = deviceFingerprint(reqWith({ ...base, "user-agent": "curl/8.4.0" }));
    expect(a).not.toBe(b);
  });
});

describe("deviceContextFromRequest", () => {
  it("combines the fingerprint and masked IP class", () => {
    const ctx = deviceContextFromRequest(
      reqWith({ "user-agent": "UA", "accept-language": "en" }, "198.51.100.77"),
    );
    expect(ctx.deviceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx.ipClass).toBe("v4/198.51.100.0/24");
  });
});
