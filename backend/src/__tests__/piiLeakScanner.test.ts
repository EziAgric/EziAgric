import { scanForPiiLeaks } from "../lib/piiLeakScanner";
import { redactPii } from "../lib/logRedaction";

describe("scanForPiiLeaks", () => {
  it("reports a clean baseline for properly redacted log lines", () => {
    const record = redactPii({
      event: "trade.created",
      buyer: { email: "buyer@example.com", phone: "+15551234567" },
    });
    const line = JSON.stringify(record);

    expect(scanForPiiLeaks([line])).toEqual([]);
  });

  it("flags an email that leaked through unredacted", () => {
    const line = JSON.stringify({ event: "x", contact: "leak@example.com" });

    const findings = scanForPiiLeaks([line]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ lineIndex: 0, kind: "email", path: "contact" });
  });

  it("flags a phone number that leaked through unredacted", () => {
    const line = JSON.stringify({ event: "x", callback: "+442071838750" });

    const findings = scanForPiiLeaks([line]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "phone", path: "callback" });
  });

  it("flags a denylisted field name whose value wasn't redacted", () => {
    // Simulates a redaction-code regression: field named `email` present
    // but the value passed through unredacted.
    const line = JSON.stringify({ user: { email: "still-here@example.com" } });

    const findings = scanForPiiLeaks([line]);

    expect(findings.some((f) => f.path === "user.email" && f.kind === "unredacted_denylisted_field")).toBe(
      true,
    );
  });

  it("does not flag ids, amounts, or [REDACTED] markers", () => {
    const line = JSON.stringify({
      tradeId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 125000,
      email: "[REDACTED]",
      note: "call me [REDACTED_PHONE] or email [REDACTED_EMAIL]",
    });

    expect(scanForPiiLeaks([line])).toEqual([]);
  });

  it("skips lines that aren't valid JSON instead of throwing", () => {
    expect(() => scanForPiiLeaks(["not json", "{broken", ""])).not.toThrow();
    expect(scanForPiiLeaks(["not json"])).toEqual([]);
  });

  it("never includes the leaked value itself in a finding", () => {
    const line = JSON.stringify({ email: "should-not-appear@example.com" });
    const findings = scanForPiiLeaks([line]);

    const serializedFindings = JSON.stringify(findings);
    expect(serializedFindings).not.toContain("should-not-appear@example.com");
  });

  it("reports the correct lineIndex across a multi-line batch", () => {
    const lines = [
      JSON.stringify({ event: "clean" }),
      JSON.stringify({ event: "dirty", email: "leak@example.com" }),
      JSON.stringify({ event: "clean-again" }),
    ];

    const findings = scanForPiiLeaks(lines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.lineIndex).toBe(1);
  });
});
