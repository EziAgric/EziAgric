import {
  AdminApiError,
  AdminErrorAction,
  AdminErrorView,
  RawBackendErrorBody,
} from './errors';

/**
 * Backend admin action guidance keyed by backend `code`.
 *
 * Each entry tells the UI exactly what to say and which button (or none)
 * to render. Update this map whenever a new admin error code is added
 * on the backend so screens show next-step guidance instead of the raw
 * backend message.
 *
 * Keys are intentionally left as `string` (not a TS enum) so the mobile
 * build keeps working if a backend deployment ships a code the mobile
 * bundle hasn't been recompiled for yet — the lookup falls through to
 * the `INTERNAL_ERROR` default below.
 */
const ADMIN_ERROR_MAP: Record<string, Omit<AdminErrorView, 'code' | 'requestId'>> = {
  // --- Authorization / role ---
  AUTH_ERROR: {
    title: 'Admin access required',
    message:
      "Your account doesn't have permission for this admin action. Sign in with an admin account or ask your team lead to grant access.",
    action: 'sign_out_required',
  },
  TRADE_ACCESS_DENIED: {
    title: 'Not allowed',
    message: "You don't have permission to do this. Contact support if you think this is wrong.",
    action: 'contact_support',
  },

  // --- Quota / rate limiting ---
  ADMIN_QUOTA_EXCEEDED: {
    title: 'Too many admin actions',
    message:
      "You've hit the limit for this admin operation. Wait for the window to reset and try again.",
    action: 'wait_then_retry',
  },
  RATE_LIMIT_EXCEEDED: {
    title: 'Slow down',
    message: 'Too many requests in a short time. Please wait a moment and try again.',
    action: 'wait_then_retry',
  },

  // --- Timeouts ---
  ADMIN_OPERATION_TIMEOUT: {
    title: 'Network timed out',
    message:
      "The Stellar network didn't respond in time. Check your connection and try again — the operation may still have succeeded.",
    action: 'retry',
  },
  PAYMENT_PROVIDER_TIMEOUT: {
    title: 'Network timed out',
    message:
      'The payment provider took too long to respond. Check your connection and try again.',
    action: 'retry',
  },

  // --- Not found / conflict ---
  NOT_FOUND: {
    title: 'Not found',
    message: "That item couldn't be found. It may have been removed or already completed.",
    action: 'go_back',
  },
  TRADE_NOT_FOUND: {
    title: 'Trade not found',
    message: "This trade couldn't be found. It may have been completed or removed.",
    action: 'go_back',
  },
  DISPUTE_NOT_FOUND: {
    title: 'Dispute not found',
    message: "This dispute couldn't be found. It may have been resolved.",
    action: 'go_back',
  },
  DOMAIN_ERROR: {
    title: 'Action not allowed',
    message:
      "This action isn't allowed in the current state. Refresh to see the latest status.",
    action: 'refresh',
  },
  TRADE_INVALID_STATUS: {
    title: 'Action not allowed',
    message:
      "This trade isn't in the right state for that action. Refresh to see the latest status.",
    action: 'refresh',
  },
  DISPUTE_STATUS_TRANSITION_INVALID: {
    title: 'Action not allowed',
    message:
      "This dispute can't move to that state from here. Refresh to see what's available.",
    action: 'refresh',
  },
  DISPUTE_STATUS_CONFLICT: {
    title: 'Already updated',
    message:
      'Another admin updated this dispute. Refresh to see the latest state before retrying.',
    action: 'refresh',
  },
  DISPUTE_INVALID_CATEGORY: {
    title: 'Invalid category',
    message: 'The chosen dispute category is not valid here. Pick another category and try again.',
    action: 'dismiss',
  },

  // --- Validation ---
  VALIDATION_ERROR: {
    title: 'Check your input',
    message:
      'Some of the information looks off. Review the form and try again — your changes were not saved.',
    action: 'dismiss',
  },
  CLAWBACK_INVALID_AMOUNT: {
    title: 'Invalid amount',
    message: 'The clawback amount must be a positive whole number. Adjust it and try again.',
    action: 'dismiss',
  },
  CLAWBACK_TOO_LARGE: {
    title: 'Amount too large',
    message:
      "This clawback would exceed the stream's remaining vested balance. Lower the amount and try again.",
    action: 'dismiss',
  },

  // --- Payment / Stellar ---
  PAYMENT_INSUFFICIENT_FUNDS: {
    title: "Not enough balance",
    message:
      "The system account doesn't have enough balance for this operation. Contact support to top it up.",
    action: 'contact_support',
  },
  PAYMENT_PROVIDER_ERROR: {
    title: 'Payment service unavailable',
    message:
      "The payment service is having trouble. Wait a moment and try again — if it keeps failing, contact support.",
    action: 'wait_then_retry',
  },

  // --- Infrastructure / internal ---
  INFRA_ERROR: {
    title: 'Service unavailable',
    message:
      "A backend service is unavailable right now. Wait a few seconds and try again — if it keeps failing, contact support.",
    action: 'wait_then_retry',
  },
  INTERNAL_ERROR: {
    title: 'Something went wrong',
    message:
      'We hit an unexpected error processing that action. Try again, and contact support with the request id if it keeps happening.',
    action: 'contact_support',
  },
  TRADE_BUILD_FAILED: {
    title: "Couldn't build transaction",
    message:
      'The blockchain transaction could not be built. Try again — if it keeps failing, contact support with the request id.',
    action: 'contact_support',
  },

  // --- Mobile-synthesised codes ---
  NETWORK_ERROR: {
    title: 'Connection problem',
    message: "You appear to be offline. Check your connection and try again.",
    action: 'retry',
  },
  TIMEOUT_ERROR: {
    title: 'Network timed out',
    message: 'The request timed out. Check your connection and try again.',
    action: 'retry',
  },
  UNKNOWN: {
    title: 'Something went wrong',
    message:
      'We hit an unexpected error. Try again, and contact support with the request id if it keeps happening.',
    action: 'contact_support',
  },
};

const DEFAULT_VIEW: Omit<AdminErrorView, 'code' | 'requestId'> = {
  title: 'Something went wrong',
  message:
    'We hit an unexpected error. Try again, and contact support with the request id if it keeps happening.',
  action: 'contact_support',
};

/**
 * Returns the human-friendly view for a backend `ErrorCode`. Falls back
 * to `DEFAULT_VIEW` for unknown codes so the UI is never blank — but
 * bizarre codes should make it back to support via the included requestId.
 */
export function mapAdminErrorCode(code: string | undefined, retryAfterSeconds?: number): Omit<AdminErrorView, 'requestId'> {
  const key = (code ?? '').toUpperCase();
  const entry = ADMIN_ERROR_MAP[key] ?? DEFAULT_VIEW;
  const action: AdminErrorAction =
    key === 'ADMIN_QUOTA_EXCEEDED' || key === 'RATE_LIMIT_EXCEEDED'
      ? 'wait_then_retry'
      : entry.action;

  return {
    title: entry.title,
    message: entry.message,
    action,
    code: key || 'UNKNOWN',
    ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
  };
}

/** Convenience: turn a parsed backend error body into an `AdminApiError`. */
export function buildAdminApiError(
  body: RawBackendErrorBody | undefined,
  status: number | undefined,
  fallbackMessage: string,
): AdminApiError {
  const code = body?.code ?? 'INTERNAL_ERROR';
  const message = body?.message ?? fallbackMessage;
  const retryAfterSeconds = extractRetryAfterSeconds(body?.details);
  return new AdminApiError({
    code,
    message,
    status,
    details: body?.details ?? {},
    ...(body?.requestId ? { requestId: body.requestId } : {}),
    ...(body?.correlationId ? { correlationId: body.correlationId } : {}),
    ...(body?.path ? { path: body.path } : {}),
    ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
  });
}

/**
 * Pulls `retryAfterSeconds` out of `details` when the backend puts it
 * there (adminQuota middleware does). Backend uses the property
 * `retryAfterSeconds`; we accept it under a few aliases for safety.
 */
function extractRetryAfterSeconds(
  details: Record<string, unknown> | undefined,
): number | undefined {
  if (!details) return undefined;
  const candidate =
    (details['retryAfterSeconds'] as unknown) ??
    (details['retryAfter'] as unknown) ??
    (details['retry_after'] as unknown);
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
    return Math.ceil(candidate);
  }
  return undefined;
}
