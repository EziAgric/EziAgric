/**
 * Error reporting pipeline for render exceptions caught by error boundaries.
 *
 * In production this ships structured payloads to the backend `/api/errors`
 * endpoint (same reporting channel consumed by issue #54 alerting).
 * In development and test it writes to console.error so nothing is silently
 * swallowed and no spurious network traffic is generated.
 *
 * Usage:
 *   reportBoundaryError({ error, componentStack, correlationId, route });
 */

import type { ErrorInfo } from "react";

export interface ErrorReport {
  /** The thrown error. */
  error: Error;
  /** React component stack from ErrorInfo. */
  componentStack: ErrorInfo["componentStack"];
  /** Correlation ID surfaced in the fallback UI (client or backend origin). */
  correlationId: string;
  /** window.location.pathname at the time of the crash. */
  route: string;
  /** Additional metadata callers may attach. */
  meta?: Record<string, unknown>;
}

/** Shape POSTed to /api/errors. */
interface ErrorPayload {
  correlationId: string;
  message: string;
  stack?: string;
  componentStack?: string | null;
  route: string;
  userAgent: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

const REPORT_ENDPOINT = "/api/errors";

/** Whether we are in a browser environment. */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Fire-and-forget POST to the error reporting endpoint.
 * Silently swallows network failures so the reporter never causes a
 * secondary crash.
 */
async function postReport(payload: ErrorPayload): Promise<void> {
  try {
    await fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive allows the request to outlive the page in some browsers
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // Intentionally ignored — reporter must never throw
  }
}

/**
 * Report a render exception from an error boundary.
 *
 * - In production: POSTs structured payload to REPORT_ENDPOINT.
 * - In development/test: logs to console.error only (no network).
 */
export function reportBoundaryError(report: ErrorReport): void {
  const { error, componentStack, correlationId, route, meta } = report;

  const payload: ErrorPayload = {
    correlationId,
    message: error.message,
    stack: error.stack,
    componentStack,
    route: isBrowser() ? route || window.location.pathname : route,
    userAgent: isBrowser() ? navigator.userAgent : "ssr",
    timestamp: new Date().toISOString(),
    meta,
  };

  if (process.env.NODE_ENV === "production") {
    void postReport(payload);
  } else {
    // Dev/test: surface full detail without console noise in prod
    // (next.config.ts strips console.log/info/debug in prod builds)
    console.error(
      `[ErrorBoundary] ${correlationId} @ ${payload.route}\n`,
      error,
      "\nComponent stack:",
      componentStack,
    );
  }
}
