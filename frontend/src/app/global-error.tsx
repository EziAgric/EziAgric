"use client";

/**
 * Global error boundary (Next.js special file).
 *
 * `global-error.tsx` catches errors thrown by the root layout itself.
 * It replaces the entire document, so it must include its own <html> and
 * <body> tags and cannot rely on layout providers (fonts, theme, etc.).
 *
 * We keep this intentionally minimal so it cannot crash itself.
 */

import { useEffect } from "react";
import { generateCorrelationId, resolveCorrelationId } from "@/lib/correlationId";
import { reportBoundaryError } from "@/lib/errorReporter";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
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
        typeof window !== "undefined" ? window.location.pathname : "unknown",
      meta: { level: "global", digest: error.digest },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1A14",
          color: "#F0F5F1",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div
          role="alert"
          aria-live="assertive"
          data-testid="global-error-fallback"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              borderRadius: "50%",
              background: "rgba(239,68,68,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="28"
              height="28"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#EF4444"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
              Application error
            </h1>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#8BA89A" }}>
              The app encountered a critical error. Your funds are safe.
            </p>
          </div>

          {/* Correlation ID */}
          <div
            style={{
              width: "100%",
              background: "#1A3D2C",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#5A7A6A",
              }}
            >
              Error reference
            </span>
            <code
              data-testid="global-correlation-id"
              style={{
                fontSize: "0.8rem",
                fontFamily: "monospace",
                color: "#D4A853",
                wordBreak: "break-all",
              }}
            >
              {correlationId}
            </code>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              width: "100%",
            }}
          >
            <button
              type="button"
              onClick={reset}
              data-testid="global-retry-button"
              style={{
                padding: "0.625rem 1.25rem",
                background: "#D4A853",
                color: "#0B1A14",
                border: "none",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              style={{
                padding: "0.625rem 1.25rem",
                background: "#1A3D2C",
                color: "#F0F5F1",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
                display: "block",
              }}
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
