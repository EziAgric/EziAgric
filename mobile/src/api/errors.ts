/**
 * Mobile-friendly error types for backend admin operations.
 *
 * Backend admin endpoints return structured errors as
 * `{ code, message, details, timestamp, path, requestId, correlationId }`
 * (see `backend/src/errors/errorCodes.ts`). Those raw payloads are useful
 * for logs but not for end users; this module wraps them in a typed
 * `AdminApiError` so screens and stores can pick the right action
 * (`retry`, `wait_then_retry`, `contact_support`, `sign_out_required`,
 * `refresh`, `go_back`, `dismiss`) and show a clear, actionable message.
 */

export type AdminErrorAction =
  /** Retry the same operation now (transient network/server blip). */
  | 'retry'
  /** Wait a known number of seconds (from `Retry-After` / quota details), then retry. */
  | 'wait_then_retry'
  /** This is a bug or unsupported case; tell user to contact support with the request id. */
  | 'contact_support'
  /** User's session is no longer valid; they must sign out and back in. */
  | 'sign_out_required'
  /** Just reload the current screen to pick up fresh data after a state change. */
  | 'refresh'
  /** Recoverable refusal — user should go back (e.g. lock conflict, unknown stream). */
  | 'go_back'
  /** Informational only. No button required — caller renders the message inline. */
  | 'dismiss';

export interface AdminErrorView {
  /** Short headline (1–4 words). */
  title: string;
  /** Full user-friendly sentence explaining what went wrong. */
  message: string;
  /** Suggested next-step action that drives buttons. */
  action: AdminErrorAction;
  /** Seconds the user should wait before retrying (only relevant for `wait_then_retry`). */
  retryAfterSeconds?: number;
  /** Backend's machine-readable code, kept so support/log tools can correlate. */
  code: string;
  /** Backend request id to show alongside "Contact support" so support can find logs. */
  requestId?: string;
}

export interface RawBackendErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  path?: string;
  requestId?: string;
  correlationId?: string;
}

/**
 * Error thrown from the axios response interceptor for any admin (or
 * general) backend call. Carries enough context to render, log, or
 * surface a "contact support" prompt without re-parsing the response.
 *
 * `status` is preserved even when we wrap the original axios error so
 * downstream checks like `e.status === 403` keep working.
 */
export class AdminApiError extends Error {
  public readonly status: number | undefined;
  public readonly code: string;
  public readonly details: Record<string, unknown>;
  public readonly requestId?: string;
  public readonly correlationId?: string;
  public readonly path?: string;
  public readonly retryAfterSeconds?: number;

  constructor(opts: {
    code: string;
    message: string;
    status?: number;
    details?: Record<string, unknown>;
    requestId?: string;
    correlationId?: string;
    path?: string;
    retryAfterSeconds?: number;
  }) {
    super(opts.message);
    this.name = 'AdminApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details ?? {};
    if (opts.requestId) this.requestId = opts.requestId;
    if (opts.correlationId) this.correlationId = opts.correlationId;
    if (opts.path) this.path = opts.path;
    if (typeof opts.retryAfterSeconds === 'number') {
      this.retryAfterSeconds = opts.retryAfterSeconds;
    }
  }

  /** Promoted to a render-ready view by `mapAdminError` (see adminErrorMap.ts). */
  toView(): AdminErrorView {
    // Defer to the mapper so updates to the map automatically benefit consumers.
    // We only inline a minimal fallback here to break a circular import risk.
    return {
      title: 'Something went wrong',
      message: this.message,
      action: 'retry',
      code: this.code,
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...(typeof this.retryAfterSeconds === 'number'
        ? { retryAfterSeconds: this.retryAfterSeconds }
        : {}),
    };
  }
}
