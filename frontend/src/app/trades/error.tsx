"use client";

/**
 * Route-level error boundary for the /trades segment.
 *
 * Trade flows are wallet-critical (Issue description calls them out
 * explicitly). This boundary renders the same branded fallback as the root
 * boundary but uses "Back to trades" as the recovery link.
 */

import { useEffect } from "react";
import { generateCorrelationId, resolveCorrelationId } from "@/lib/correlationId";
import { reportBoundaryError } from "@/lib/errorReporter";
import { ErrorBoundaryFallbackPage } from "@/components/ui/ErrorBoundaryFallbackPage";

interface TradesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TradesError({ error, reset }: TradesErrorProps) {
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
        typeof window !== "undefined" ? window.location.pathname : "/trades",
      meta: { segment: "trades", digest: error.digest },
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
      backLabel="Back to trades"
      backHref="/trades"
    />
  );
}
