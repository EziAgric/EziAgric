import { AppError, ErrorCode } from "./errorCodes";
import { classifyStellarError, StellarErrorCategory } from "../services/stellar.service";
import { ClassifiedServiceError } from "./service.errors";

/**
 * Maps a Stellar error category to the corresponding admin submission error
 * code and HTTP status. This classification distinguishes between validation,
 * network, contract, and authorization failures so the client receives
 * actionable feedback instead of a generic 500.
 */
const CATEGORY_MAP: Record<
  StellarErrorCategory,
  { code: ErrorCode; httpStatus: number; userMessage: string }
> = {
  invalid_xdr: {
    code: ErrorCode.SUBMISSION_VALIDATION_ERROR,
    httpStatus: 400,
    userMessage: "The transaction is malformed and cannot be submitted.",
  },
  timeout: {
    code: ErrorCode.SUBMISSION_NETWORK_ERROR,
    httpStatus: 504,
    userMessage: "The Stellar network timed out. Please try again.",
  },
  connection_refused: {
    code: ErrorCode.SUBMISSION_NETWORK_ERROR,
    httpStatus: 503,
    userMessage: "The Stellar service is temporarily unavailable.",
  },
  rate_limited: {
    code: ErrorCode.SUBMISSION_NETWORK_ERROR,
    httpStatus: 429,
    userMessage: "Rate limit exceeded. Please wait before retrying.",
  },
  not_found: {
    code: ErrorCode.SUBMISSION_CONTRACT_ERROR,
    httpStatus: 404,
    userMessage: "The requested on-chain resource was not found.",
  },
  contract_panic: {
    code: ErrorCode.SUBMISSION_CONTRACT_ERROR,
    httpStatus: 502,
    userMessage: "The smart contract rejected the transaction.",
  },
  rpc_error: {
    code: ErrorCode.SUBMISSION_CONTRACT_ERROR,
    httpStatus: 502,
    userMessage: "The Stellar RPC node returned an error.",
  },
  network_error: {
    code: ErrorCode.SUBMISSION_NETWORK_ERROR,
    httpStatus: 502,
    userMessage: "A network error occurred while communicating with Stellar.",
  },
};

/**
 * Classify an admin transaction submission failure into a specific error
 * category (validation, network, contract, or authorization) with an
 * appropriate HTTP status code and user-facing message.
 *
 * Uses the shared `classifyStellarError` helper from `stellar.service.ts`
 * for the actual error analysis, then maps the result to admin-specific
 * error codes.
 *
 * @param error - The caught error from a Soroban submission attempt
 * @param context - Optional context string for logging (e.g. "stream_terminate")
 * @returns An AppError with the classified error code, HTTP status, and user message
 */
export function classifyAdminSubmissionError(
  error: unknown,
  context?: string,
): AppError {
  // Already a classified service error (e.g. StellarError) — preserve its code
  if (error instanceof ClassifiedServiceError) {
    const category = (error.details?.category as StellarErrorCategory) || "network_error";
    const mapping = CATEGORY_MAP[category] || CATEGORY_MAP.network_error;

    return new AppError(
      error.code || mapping.code,
      error.message || mapping.userMessage,
      error.statusCode || mapping.httpStatus,
      {
        category,
        retryable: error.retryable,
        service: "stellar",
        ...(context && { context }),
      },
    );
  }

  // Already an AppError — pass through with submission classification added
  if (
    error instanceof AppError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "AppError")
  ) {
    const appErr = error as AppError;
    return new AppError(
      appErr.code,
      appErr.message,
      appErr.statusCode,
      {
        ...appErr.details,
        classified: true,
        ...(context && { context }),
      },
    );
  }

  // Use the shared Stellar error classifier for raw errors
  const classified = classifyStellarError(error);
  const mapping = CATEGORY_MAP[classified.category] || CATEGORY_MAP.network_error;

  return new AppError(
    mapping.code,
    classified.message || mapping.userMessage,
    mapping.httpStatus,
    {
      category: classified.category,
      retryable: classified.isRetryable,
      service: "stellar",
      ...(context && { context }),
    },
  );
}

/**
 * Human-readable mapping of error codes to user-facing text.
 * Used by documentation and error response enrichment.
 */
export const SUBMISSION_ERROR_DESCRIPTIONS: Partial<Record<ErrorCode, string>> & Record<string, string> = {
  [ErrorCode.SUBMISSION_VALIDATION_ERROR]:
    "The transaction is malformed. Check the XDR and try again.",
  [ErrorCode.SUBMISSION_NETWORK_ERROR]:
    "A network or connectivity issue prevented the submission. Retry after a short wait.",
  [ErrorCode.SUBMISSION_CONTRACT_ERROR]:
    "The smart contract rejected the transaction. Verify the contract state and parameters.",
  [ErrorCode.SUBMISSION_AUTHORIZATION_ERROR]:
    "The transaction was not authorized. Ensure the correct signing key is configured.",
};
