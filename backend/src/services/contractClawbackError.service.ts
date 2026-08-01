/**
 * Contract clawback error mapping service (Issue #97).
 *
 * The on-chain `admin_clawback` function panics with deterministic string
 * codes when invalid conditions are detected. This service parses those
 * strings from Soroban invoke-result error payloads and maps them to
 * backend-level `AppError` instances with appropriate HTTP status codes and
 * user-facing messages.
 *
 * On-chain error codes (defined in `contracts/amana_escrow/src/lib.rs`):
 *   CLAWBACK_UNAUTHORIZED         – caller is not the registered admin
 *   CLAWBACK_STREAM_NOT_FOUND     – no trade record for the given trade_id
 *   CLAWBACK_INVALID_AMOUNT       – requested amount is zero or negative
 *   CLAWBACK_INSUFFICIENT_VESTED  – amount exceeds the escrowed balance
 *   CLAWBACK_INVALID_STATUS       – trade is not in Funded status
 */

import { AppError, ErrorCode } from "../errors/errorCodes";

/**
 * Known on-chain panic message strings emitted by `admin_clawback()`.
 * These must stay in sync with the `clawback_errors` module in lib.rs.
 */
export const CONTRACT_CLAWBACK_ERROR_CODES = {
  UNAUTHORIZED: "CLAWBACK_UNAUTHORIZED",
  INSUFFICIENT_VESTED: "CLAWBACK_INSUFFICIENT_VESTED",
  INVALID_AMOUNT: "CLAWBACK_INVALID_AMOUNT",
  STREAM_NOT_FOUND: "CLAWBACK_STREAM_NOT_FOUND",
  INVALID_STATUS: "CLAWBACK_INVALID_STATUS",
} as const;

export type ContractClawbackErrorCode =
  (typeof CONTRACT_CLAWBACK_ERROR_CODES)[keyof typeof CONTRACT_CLAWBACK_ERROR_CODES];

/**
 * Parse the on-chain error code from a Soroban invocation error message.
 *
 * Soroban wraps contract panics in a result envelope; the panic string is
 * usually present somewhere in the serialised error. This function scans
 * `rawMessage` for known clawback error code substrings.
 *
 * @param rawMessage - Raw error string from the Soroban RPC response.
 * @returns The matched error code string, or `null` if unrecognised.
 */
export function parseContractClawbackErrorCode(
  rawMessage: string,
): ContractClawbackErrorCode | null {
  for (const code of Object.values(CONTRACT_CLAWBACK_ERROR_CODES)) {
    if (rawMessage.includes(code)) {
      return code as ContractClawbackErrorCode;
    }
  }
  return null;
}

/**
 * Map an on-chain clawback error code to a user-friendly `AppError`.
 *
 * @param code - On-chain error code string (e.g. `"CLAWBACK_UNAUTHORIZED"`).
 * @param details - Optional extra context to attach to the error payload.
 * @returns An `AppError` with the appropriate HTTP status and message.
 */
export function mapClawbackErrorCode(
  code: ContractClawbackErrorCode,
  details: Record<string, unknown> = {},
): AppError {
  switch (code) {
    case CONTRACT_CLAWBACK_ERROR_CODES.UNAUTHORIZED:
      return new AppError(
        ErrorCode.CLAWBACK_UNAUTHORIZED,
        "Admin clawback failed: caller is not the authorised contract admin.",
        403,
        { contractErrorCode: code, ...details },
      );

    case CONTRACT_CLAWBACK_ERROR_CODES.STREAM_NOT_FOUND:
      return new AppError(
        ErrorCode.CLAWBACK_STREAM_NOT_FOUND,
        "Admin clawback failed: no escrow trade record was found for the given ID.",
        404,
        { contractErrorCode: code, ...details },
      );

    case CONTRACT_CLAWBACK_ERROR_CODES.INVALID_AMOUNT:
      return new AppError(
        ErrorCode.CLAWBACK_INVALID_AMOUNT,
        "Admin clawback failed: the requested amount must be greater than zero.",
        400,
        { contractErrorCode: code, ...details },
      );

    case CONTRACT_CLAWBACK_ERROR_CODES.INSUFFICIENT_VESTED:
      return new AppError(
        ErrorCode.CLAWBACK_INSUFFICIENT_VESTED,
        "Admin clawback failed: the requested amount exceeds the vested (escrowed) balance.",
        422,
        { contractErrorCode: code, ...details },
      );

    case CONTRACT_CLAWBACK_ERROR_CODES.INVALID_STATUS:
      return new AppError(
        ErrorCode.CLAWBACK_INVALID_STATUS,
        "Admin clawback failed: the trade is not in Funded status and cannot be clawed back.",
        409,
        { contractErrorCode: code, ...details },
      );

    default: {
      // Exhaustive check — TypeScript will flag unhandled variants at compile time.
      const _exhaustive: never = code;
      void _exhaustive;
      return new AppError(
        ErrorCode.INTERNAL_ERROR,
        "Admin clawback failed: unknown contract error.",
        500,
        { contractErrorCode: code, ...details },
      );
    }
  }
}

/**
 * Convert a raw Soroban invocation error into an `AppError`.
 *
 * Attempts to parse an on-chain clawback error code from the message. If a
 * known code is found, it is mapped to a structured user-facing error.
 * Otherwise a generic `DOMAIN_ERROR` is returned so callers always get an
 * `AppError` back regardless of the contract panic text.
 *
 * @param error - The raw error from the Soroban RPC client.
 * @param details - Optional context to attach (e.g. `{ tradeId, adminAddress }`).
 * @returns A classified `AppError`.
 */
export function mapContractClawbackError(
  error: unknown,
  details: Record<string, unknown> = {},
): AppError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  const code = parseContractClawbackErrorCode(message);
  if (code) {
    return mapClawbackErrorCode(code, details);
  }

  return new AppError(
    ErrorCode.DOMAIN_ERROR,
    `Admin clawback failed: ${message}`,
    500,
    { contractErrorCode: "UNKNOWN", rawMessage: message, ...details },
  );
}
