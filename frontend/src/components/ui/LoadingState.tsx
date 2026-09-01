import * as React from "react";
import { clsx } from "clsx";
import { Skeleton } from "./Skeleton";

export interface LoadingStateProps {
  variant?: "card" | "row" | "inline";
  rows?: number;
  className?: string;
}

/**
 * Standard loading placeholder for a route segment or panel. Composed entirely
 * from the shared `Skeleton` primitive so it shares the app-wide skeleton
 * language and design tokens. Sizes are fixed so swapping in real content does
 * not shift layout.
 */
export function LoadingState({
  variant = "card",
  rows = 3,
  className,
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <div
        className={clsx("flex flex-col gap-2", className)}
        aria-busy="true"
        aria-label="Loading"
      >
        <Skeleton variant="text" width="75%" height={16} />
        <Skeleton variant="text" width="50%" height={12} />
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg border border-border-default p-3",
          className,
        )}
        aria-busy="true"
        aria-label="Loading"
      >
        <Skeleton variant="circle" width={36} height={36} className="shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton variant="text" width="50%" height={12} />
          <Skeleton variant="text" width="75%" height={12} />
        </div>
        <Skeleton width={64} height={24} radius={9999} className="shrink-0" />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-xl border border-border-default bg-card p-6 shadow-card",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="mb-5 flex items-center gap-3">
        <Skeleton width={32} height={32} />
        <Skeleton variant="text" width={128} height={16} />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            variant="text"
            height={16}
            width={i % 3 === 2 ? "66%" : i % 3 === 1 ? "83%" : "100%"}
          />
        ))}
      </div>

      <Skeleton height={40} className="mt-6 w-full rounded-lg" />
    </div>
  );
}
