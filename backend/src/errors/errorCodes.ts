export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTH_ERROR = "AUTH_ERROR",
  DOMAIN_ERROR = "DOMAIN_ERROR",
  INFRA_ERROR = "INFRA_ERROR",
  NOT_FOUND = "NOT_FOUND",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  // Transaction-specific codes
  TRADE_NOT_FOUND = "TRADE_NOT_FOUND",
  TRADE_ACCESS_DENIED = "TRADE_ACCESS_DENIED",
  TRADE_INVALID_STATUS = "TRADE_INVALID_STATUS",
  TRADE_BUILD_FAILED = "TRADE_BUILD_FAILED",
  // Dispute-specific codes
  DISPUTE_INVALID_CATEGORY = "DISPUTE_INVALID_CATEGORY",
  DISPUTE_STATUS_TRANSITION_INVALID = "DISPUTE_STATUS_TRANSITION_INVALID",
  DISPUTE_NOT_FOUND = "DISPUTE_NOT_FOUND",
  // Payment provider codes
  PAYMENT_PROVIDER_ERROR = "PAYMENT_PROVIDER_ERROR",
  PAYMENT_PROVIDER_TIMEOUT = "PAYMENT_PROVIDER_TIMEOUT",
  PAYMENT_INSUFFICIENT_FUNDS = "PAYMENT_INSUFFICIENT_FUNDS",
}

export interface StructuredErrorPayload {
  code: ErrorCode | string;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
  path?: string;
  requestId?: string;
  correlationId?: string;
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AppError";
  }

  toPayload(path?: string, requestId?: string, correlationId?: string): StructuredErrorPayload {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: new Date().toISOString(),
      ...(path && { path }),
      ...(requestId && { requestId }),
      ...(correlationId && { correlationId }),
    };
  }
}
