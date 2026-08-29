import { alertService } from "../services/alert.service";
import { env } from "../config/env";

interface FailureWindow {
  count: number;
  windowStart: number;
}

const windows = new Map<string, FailureWindow>();

/**
 * Tracks failures for admin Soroban transaction endpoints and dispatches an
 * alert once the configured threshold is exceeded within the configured
 * rolling window. Tune via ADMIN_TX_FAILURE_THRESHOLD / ADMIN_TX_FAILURE_WINDOW_MS.
 */
export function recordAdminSorobanTxFailure(endpoint: string, error: unknown): void {
  const now = Date.now();
  const errorClass = error instanceof Error ? error.constructor.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);

  const windowMs = env.ADMIN_TX_FAILURE_WINDOW_MS;
  const threshold = env.ADMIN_TX_FAILURE_THRESHOLD;

  let entry = windows.get(endpoint);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
    windows.set(endpoint, entry);
  }
  entry.count += 1;

  if (entry.count >= threshold) {
    void alertService.dispatch(
      "admin_soroban_tx_failure",
      `Admin Soroban transaction endpoint ${endpoint} failed ${entry.count} times in the last ${Math.round(windowMs / 1000)}s`,
      { endpoint, errorClass, message, count: entry.count },
    );
    entry.count = 0;
    entry.windowStart = now;
  }
}

export function resetAdminSorobanTxFailures(endpoint?: string): void {
  if (endpoint) {
    windows.delete(endpoint);
    return;
  }
  windows.clear();
}
