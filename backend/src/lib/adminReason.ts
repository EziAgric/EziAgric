import { AppError, ErrorCode } from "../errors/errorCodes";

export interface AdminReasonOptions {
  /** Whether the reason field is strictly required for this operation */
  required?: boolean;
  /** Minimum allowed character length for reason text */
  minLength?: number;
  /** Maximum allowed character length for reason text */
  maxLength?: number;
}

/**
 * Validates and normalizes administrative audit reason text.
 *
 * @param reason Raw reason parameter from request body or query
 * @param options Validation constraints (required, length limits)
 * @returns Trimmed valid reason string, or undefined if optional and omitted
 * @throws AppError 400 if reason is missing when required, or fails length checks
 */
export function validateAdminReason(
  reason: unknown,
  options: AdminReasonOptions = {}
): string | undefined {
  const { required = false, minLength = 3, maxLength = 500 } = options;

  if (reason === undefined || reason === null || (typeof reason === "string" && reason.trim() === "")) {
    if (required) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Bad Request: Audit reason is required for this administrative operation",
        400
      );
    }
    return undefined;
  }

  if (typeof reason !== "string") {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Bad Request: Audit reason must be a string",
      400
    );
  }

  const trimmed = reason.trim();
  if (trimmed.length < minLength) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Bad Request: Audit reason must be at least ${minLength} characters`,
      400
    );
  }

  if (trimmed.length > maxLength) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Bad Request: Audit reason must not exceed ${maxLength} characters`,
      400
    );
  }

  return trimmed;
}

/**
 * Standard admin reason codes for audit logging and compliance tagging.
 */
export const ADMIN_REASON_CODES = {
  COMPLIANCE_HOLD: "COMPLIANCE_HOLD",
  DISPUTE_RESOLUTION: "DISPUTE_RESOLUTION",
  SECURITY_INCIDENT: "SECURITY_INCIDENT",
  TREASURY_MAINTENANCE: "TREASURY_MAINTENANCE",
  CLAWBACK_DISBURSED_FUNDS: "CLAWBACK_DISBURSED_FUNDS",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
} as const;

export type AdminReasonCode = keyof typeof ADMIN_REASON_CODES;
