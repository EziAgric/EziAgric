"use client";

/**
 * Route-level error boundary for the /dashboard segment.
 */

import { useEffect } from "react";
import { generateCorrelationId, resolveCorrelationId } from "@/lib/correlationId";
import { reportBoundaryError } from "@/lib/errorReporter";
import { ErrorBoundaryFallbackPage } from "@/components/ui/ErrorBoundaryFallbackPage";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const correlationId = resolveCorrelationId(
    error,
    error.digest ?? generateCorrelationId(),
  );

  useEffect(() => {
    reportBoundaryError({
      error,
      componentStack: null,
      correlationId,
      route:
        typeof window !== "undefined" ? window.location.pathname : "/dashboard",
      meta: { segment: "dashboard", digest: error.digest },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundaryFallbackPage
      correlationId={correlationId}
      onRetry={reset}
      errorMessage={
        process.env.NODE_ENV !== "production" ? error.message : undefined
      }
      backLabel="Back to dashboard"
      backHref="/dashboard"
    />
  );
}
