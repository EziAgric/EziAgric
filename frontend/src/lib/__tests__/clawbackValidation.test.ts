import { validateClawbackAmount } from "../clawbackValidation";

describe("validateClawbackAmount", () => {
  it("is invalid when the input is empty", () => {
    expect(validateClawbackAmount("", "7500")).toEqual({
      valid: false,
      error: "Enter an amount.",
    });
  });

  it("is invalid when the input is whitespace only", () => {
    expect(validateClawbackAmount("   ", "7500")).toEqual({
      valid: false,
      error: "Enter an amount.",
    });
  });

  it("rejects non-numeric input", () => {
    const result = validateClawbackAmount("abc", "7500");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/whole number/i);
  });

  it("rejects a decimal amount", () => {
    const result = validateClawbackAmount("100.5", "7500");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/whole number/i);
  });

  it("rejects a negative amount", () => {
    const result = validateClawbackAmount("-100", "7500");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/whole number/i);
  });

  it("rejects zero (non-positive boundary)", () => {
    const result = validateClawbackAmount("0", "7500");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/greater than zero/i);
  });

  it("rejects an amount greater than the remaining vested balance", () => {
    const result = validateClawbackAmount("7501", "7500");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot exceed/i);
    expect(result.error).toContain("7500");
  });

  it("accepts an amount exactly equal to the remaining vested balance (boundary)", () => {
    expect(validateClawbackAmount("7500", "7500")).toEqual({ valid: true, error: null });
  });

  it("accepts an amount of 1 (smallest positive boundary)", () => {
    expect(validateClawbackAmount("1", "7500")).toEqual({ valid: true, error: null });
  });

  it("accepts a valid amount strictly less than remaining", () => {
    expect(validateClawbackAmount("3000", "7500")).toEqual({ valid: true, error: null });
  });

  it("handles very large amounts without precision loss", () => {
    const huge = "123456789012345678901234567890";
    expect(validateClawbackAmount(huge, huge)).toEqual({ valid: true, error: null });
    expect(validateClawbackAmount(huge, "1")).toMatchObject({ valid: false });
  });

  it("treats an unparsable remainingVested as zero remaining", () => {
    const result = validateClawbackAmount("1", "not-a-number");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot exceed/i);
  });
});
