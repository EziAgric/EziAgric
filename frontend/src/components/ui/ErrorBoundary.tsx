"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import {
  generateCorrelationId,
  resolveCorrelationId,
} from "@/lib/correlationId";
import { reportBoundaryError } from "@/lib/errorReporter";

// ─── Public API ────────────────────────────────────────────────────────────

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Custom fallback UI. Receives error details so callers can render
   * context-specific messages.
   */
  fallback?: ReactNode | ((props: FallbackRenderProps) => ReactNode);
  /**
   * Called after the error is captured. Receives the Error and React
   * ErrorInfo (component stack). Useful for route-level side effects.
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Called when the user triggers a reset (retry). */
  onReset?: () => void;
  /**
   * Label shown in the "back" action button.
   * @default "Back to dashboard"
   */
  backLabel?: string;
  /**
   * href for the "back" action button.
   * @default "/dashboard"
   */
  backHref?: string;
}

export interface FallbackRenderProps {
  error: Error;
  correlationId: string;
  reset: () => void;
}

// ─── State ─────────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  correlationId: string;
}

// ─── Default branded fallback ───────────────────────────────────────────────

function DefaultFallback({
  error,
  correlationId,
  onReset,
  backLabel,
  backHref,
}: {
  error: Error;
  correlationId: string;
  onReset: () => void;
  backLabel: string;
  backHref: string;
}) {
  function handleCopy() {
    navigator.clipboard.writeText(correlationId).catch(() => {
      /* best-effort */
    });
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="error-boundary-fallback"
      className="flex flex-col items-center justify-center min-h-[40vh] gap-6 p-8 text-center max-w-lg mx-auto"
    >
      {/* Icon */}
      <div className="h-14 w-14 rounded-full bg-status-danger/10 flex items-center justify-center flex-shrink-0">
        <svg
          className="h-7 w-7 text-status-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>

      {/* Heading + message */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-text-primary">
          Something went wrong
        </h2>
        <p className="text-sm text-text-secondary">
          {process.env.NODE_ENV !== "production" && error.message
            ? error.message
            : "An unexpected error occurred. Your funds are safe — this page could not be loaded."}
        </p>
      </div>

      {/* Correlation ID */}
      <div className="w-full rounded-lg bg-bg-elevated border border-border-default px-4 py-3 flex flex-col gap-1">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Error reference
        </span>
        <div className="flex items-center justify-between gap-2">
          <code
            data-testid="correlation-id"
            className="text-sm font-mono text-accent-gold break-all"
          >
            {correlationId}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy correlation ID"
            className="flex-shrink-0 rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-input transition-colors focus:outline-none focus:ring-2 focus:ring-accent-gold"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Quote this ID when contacting support so we can locate the trace.
        </p>
      </div>

      {/* Recovery actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
        <button
          type="button"
          onClick={onReset}
          data-testid="retry-button"
          className="w-full sm:w-auto flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold bg-accent-gold text-text-inverse hover:bg-accent-gold-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 focus:ring-offset-bg-primary"
        >
          Try again
        </button>
        <a
          href={backHref}
          data-testid="back-to-dashboard"
          className="w-full sm:w-auto flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold text-center bg-bg-elevated border border-border-default text-text-primary hover:bg-bg-elevated/80 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 focus:ring-offset-bg-primary"
        >
          {backLabel}
        </a>
      </div>
    </div>
  );
}

// ─── Error Boundary Class ───────────────────────────────────────────────────

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, correlationId: "" };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      // Correlation ID generated at capture time
      correlationId: generateCorrelationId(),
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const correlationId = resolveCorrelationId(error, this.state.correlationId);

    // Update state with resolved (possibly backend-origin) ID
    if (correlationId !== this.state.correlationId) {
      this.setState({ correlationId });
    }

    reportBoundaryError({
      error,
      componentStack: errorInfo.componentStack,
      correlationId,
      route:
        typeof window !== "undefined" ? window.location.pathname : "unknown",
    });

    this.props.onError?.(error, errorInfo);
  }

  handleReset(): void {
    this.setState({ hasError: false, error: null, correlationId: "" });
    this.props.onReset?.();
  }

  override render(): ReactNode {
    const { hasError, error, correlationId } = this.state;
    const {
      children,
      fallback,
      backLabel = "Back to dashboard",
      backHref = "/dashboard",
    } = this.props;

    if (!hasError || !error) {
      return children;
    }

    // Custom fallback: render-prop form
    if (typeof fallback === "function") {
      return fallback({
        error,
        correlationId,
        reset: this.handleReset,
      });
    }

    // Custom fallback: static ReactNode
    if (fallback !== undefined) {
      return fallback;
    }

    // Default branded fallback
    return (
      <DefaultFallback
        error={error}
        correlationId={correlationId}
        onReset={this.handleReset}
        backLabel={backLabel}
        backHref={backHref}
      />
    );
  }
}
