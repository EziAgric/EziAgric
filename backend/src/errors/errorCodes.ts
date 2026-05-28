export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTH_ERROR = "AUTH_ERROR",
  DOMAIN_ERROR = "DOMAIN_ERROR",
  INFRA_ERROR = "INFRA_ERROR",
  NOT_FOUND = "NOT_FOUND",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 400,
    public details: any = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Robust AppError type guard.
 *
 * `error instanceof AppError` can return `false` for an AppError that crossed a
 * module or async boundary (e.g. a duplicated module instance under bundling or
 * transpilation), which would cause callers to drop the error's real
 * `statusCode`/`message` and fall back to a generic response. `AuthService`
 * already recognises AppError by `name`; this guard applies the same structural
 * check everywhere so a failed authorization keeps its intended status code and
 * message instead of being masked as a generic 401.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AppError" &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
