"use client";

/**
 * Root route-segment error boundary (Next.js special file).
 *
 * This file is picked up automatically by Next.js App Router for any
 * unhandled render error in the root segment and its children, except those
 * caught by a nested error.tsx closer to the throwing component.
 *
 * It renders the shared branded fallback with full recovery actions and
 * exposes a correlation ID the user can quote to support.
 */

import { useEffect } from "react";
import { generateCorrelationId, resolveCorrelationId } from "@/lib/correlationId";
import { reportBoundaryError } from "@/lib/errorReporter";
import { ErrorBoundaryFallbackPage } from "@/components/ui/ErrorBoundaryFallbackPage";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  // Next.js injects `error.digest` as an opaque server-side trace token.
  // We prefer the backend correlationId if it is embedded on the error, then
  // fall back to the digest, then generate a fresh client-side ID.
  const correlationId =
    resolveCorrelationId(error, error.digest ?? generateCorrelationId());

  useEffect(() => {
    reportBoundaryError({
      error,
      componentStack: null,
      correlationId,
      route:
        typeof window !== "undefined" ? window.location.pathname : "unknown",
      meta: { digest: error.digest },
    });
    // Report once on mount — deps intentionally omit stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundaryFallbackPage
      correlationId={correlationId}
      onRetry={reset}
      errorMessage={
        process.env.NODE_ENV !== "production" ? error.message : undefined
      }
    />
  );
}
