"use client";

import * as React from "react";
import { clsx } from "clsx";

function LockIcon() {
  return (
    <div className="mx-auto h-12 w-12 rounded-full bg-status-warning/10 flex items-center justify-center">
      <svg
        className="h-6 w-6 text-status-warning"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v4h8z"
        />
      </svg>
    </div>
  );
}

export interface ForbiddenStateProps {
  title?: string;
  message?: string;
  supportContact?: string;
  className?: string;
}

/**
 * Dedicated "access denied" state for admin-only pages that receive a 403
 * from `adminMiddleware`. Distinct from `ErrorState` (transient/retryable
 * failures) since a 403 here isn't something a retry will fix.
 */
export function ForbiddenState({
  title = "Admin Access Required",
  message = "You don't have permission to view this page.",
  supportContact,
  className,
}: ForbiddenStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
      role="alert"
      data-testid="forbidden-state"
    >
      <LockIcon />
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-content">{title}</h2>
        <p className="text-sm text-muted">{message}</p>
        <p className="text-sm text-muted">
          {supportContact
            ? `If you believe this is a mistake, contact support at ${supportContact}.`
            : "If you believe this is a mistake, contact support."}
        </p>
      </div>
    </div>
  );
}
