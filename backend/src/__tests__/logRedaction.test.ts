import { redactPii } from "../lib/logRedaction";

describe("redactPii", () => {
  it("redacts denylisted field names regardless of value shape", () => {
    const input = {
      email: "trader@example.com",
      phoneNumber: "+15551234567",
      driverIdNumber: "A1234567",
      password: "hunter2",
      note: "call me on my mobile",
    };

    const result = redactPii(input);

    expect(result.email).toBe("[REDACTED]");
    expect(result.phoneNumber).toBe("[REDACTED]");
    expect(result.driverIdNumber).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.note).toBe("call me on my mobile");
  });

  it("scrubs email/phone-shaped substrings embedded in free text", () => {
    const input = {
      message: "Dispute filed by trader (contact: jane.doe@example.com, +2348012345678) re trade #42",
    };

    const result = redactPii(input);

    expect(result.message).not.toMatch(/jane\.doe@example\.com/);
    expect(result.message).not.toMatch(/\+2348012345678/);
    expect(result.message).toContain("[REDACTED_EMAIL]");
    expect(result.message).toContain("[REDACTED_PHONE]");
    expect(result.message).toContain("trade #42");
  });

  it("recurses through nested objects and arrays", () => {
    const input = {
      trade: {
        id: "T-1",
        parties: [
          { role: "buyer", email: "buyer@example.com" },
          { role: "seller", email: "seller@example.com" },
        ],
      },
    };

    const result = redactPii(input) as typeof input;

    expect(result.trade.parties[0].email).toBe("[REDACTED]");
    expect(result.trade.parties[1].email).toBe("[REDACTED]");
    expect(result.trade.id).toBe("T-1");
  });

  it("does not redact ids, amounts, or Stellar addresses that merely contain digits", () => {
    const input = {
      tradeId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 125000,
      ledgerSequence: 48213093,
      stellarAddress: "GABCDEFGH1234567890IJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP",
    };

    const result = redactPii(input);

    expect(result).toEqual(input);
  });

  it("leaves null/undefined field values as-is instead of stamping REDACTED", () => {
    const input = { email: null, phone: undefined };
    const result = redactPii(input);
    expect(result.email).toBeNull();
    expect(result.phone).toBeUndefined();
  });

  it("redacts error messages but preserves stack/name for debuggability", () => {
    const err = new Error("failed webhook delivery to owner alice@example.com");
    const result = redactPii({ err }).err as Error;

    expect(result.message).toContain("[REDACTED_EMAIL]");
    expect(result.message).not.toContain("alice@example.com");
    expect(result.name).toBe("Error");
  });

  it("does not mutate the input object", () => {
    const input = { email: "test@example.com" };
    redactPii(input);
    expect(input.email).toBe("test@example.com");
  });

  it("handles circular references without throwing", () => {
    const input: Record<string, unknown> = { email: "test@example.com" };
    input.self = input;

    expect(() => redactPii(input)).not.toThrow();
    const result = redactPii(input) as Record<string, unknown>;
    expect(result.self).toBe("[CIRCULAR]");
  });

  it("passes representative full request-cycle payloads with PII fully absent", () => {
    // Representative of a real trade-dispute payload flowing through the app.
    const payload = {
      event: "dispute.filed",
      trade: {
        id: "T-9001",
        buyerAddress: "GBUYERADDRXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        buyerContact: { email: "buyer@example.com", phone: "+14155552671" },
        sellerContact: { email: "seller@example.com", phone: "+442071838750" },
      },
      manifest: {
        driverName: "John Doe",
        driverIdNumber: "DL-99881",
        deliveryNotes: "Left with neighbour, they can be reached at 555-987-6543",
      },
    };

    const serialized = JSON.stringify(redactPii(payload));

    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("seller@example.com");
    expect(serialized).not.toContain("+14155552671");
    expect(serialized).not.toContain("+442071838750");
    expect(serialized).not.toContain("555-987-6543");
    expect(serialized).not.toContain("John Doe");
    expect(serialized).not.toContain("DL-99881");
    expect(serialized).toContain("T-9001");
  });
});
