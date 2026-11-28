import { validateAdminReason, ADMIN_REASON_CODES } from "../lib/adminReason";
import { AppError } from "../errors/errorCodes";

describe("validateAdminReason (Issue #47)", () => {
  it("allows optional reason when omitted", () => {
    expect(validateAdminReason(undefined, { required: false })).toBeUndefined();
    expect(validateAdminReason(null, { required: false })).toBeUndefined();
    expect(validateAdminReason("", { required: false })).toBeUndefined();
  });

  it("throws AppError 400 when required reason is missing or empty", () => {
    expect(() => validateAdminReason(undefined, { required: true })).toThrow(AppError);
    expect(() => validateAdminReason("", { required: true })).toThrow(AppError);
    expect(() => validateAdminReason("   ", { required: true })).toThrow(AppError);
  });

  it("trims and returns valid reason text within min/max bounds", () => {
    const valid = "  Resolving dispute #123 compliance requirement  ";
    expect(validateAdminReason(valid)).toBe("Resolving dispute #123 compliance requirement");
  });

  it("enforces minimum and maximum length constraints", () => {
    expect(() => validateAdminReason("ab", { minLength: 3 })).toThrow(AppError);
    expect(() => validateAdminReason("a".repeat(501), { maxLength: 500 })).toThrow(AppError);
  });

  it("exports standard admin reason codes", () => {
    expect(ADMIN_REASON_CODES.COMPLIANCE_HOLD).toBe("COMPLIANCE_HOLD");
    expect(ADMIN_REASON_CODES.SECURITY_INCIDENT).toBe("SECURITY_INCIDENT");
    expect(ADMIN_REASON_CODES.CLAWBACK_DISBURSED_FUNDS).toBe("CLAWBACK_DISBURSED_FUNDS");
  });
});
