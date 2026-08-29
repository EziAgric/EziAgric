import { clsx } from "clsx";

/**
 * The single skeleton primitive for the whole app. Every loading placeholder
 * (cards, lists, page headers, inline text) is composed from this so the
 * "skeleton language" — colour, radius, motion — stays uniform and is driven by
 * design tokens (`skeleton-base`, `skeleton-sheen`, `animate-skeleton-*`).
 *
 * CLS safety: a skeleton must occupy the same box its real content will. Pass
 * `width`/`height` (number → px, string → raw CSS) sized from real layout
 * metrics, or Tailwind sizing via `className`. The shimmer/pulse animations are
 * opacity/transform only and never reflow.
 */
type SkeletonVariant = "text" | "rect" | "circle";

export type SkeletonProps = {
  variant?: SkeletonVariant;
  /** number → px, string → raw CSS value (e.g. "60%"). */
  width?: number | string;
  height?: number | string;
  /** Render N stacked lines (text variant). Last line is shortened. */
  lines?: number;
  /** Border radius override (number → px, string → raw). */
  radius?: number | string;
  /** Sweeping highlight on top of the resting pulse. Default true. */
  shimmer?: boolean;
  className?: string;
  "aria-label"?: string;
};

function toCss(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

const VARIANT_RADIUS_CLASS: Record<SkeletonVariant, string> = {
  text: "rounded-sm",
  rect: "rounded-md",
  circle: "rounded-full",
};

export function Skeleton({
  variant = "rect",
  width,
  height,
  lines,
  radius,
  shimmer = true,
  className,
  "aria-label": ariaLabel,
}: SkeletonProps) {
  const base = clsx(
    "relative isolate block overflow-hidden bg-skeleton-base",
    // Inline radius (when provided) wins; otherwise a token class that a
    // caller's own `rounded-*` in className can still override.
    radius === undefined && VARIANT_RADIUS_CLASS[variant],
    "motion-safe:animate-skeleton-pulse motion-reduce:animate-none",
    shimmer &&
      "after:absolute after:inset-0 after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-skeleton-sheen after:to-transparent motion-safe:after:animate-skeleton-shimmer",
    className,
  );

  const style: React.CSSProperties = {
    width: toCss(width),
    height: toCss(height ?? (variant === "text" ? "1em" : undefined)),
    borderRadius: toCss(radius),
  };

  if (variant === "text" && lines && lines > 1) {
    return (
      <span role="status" aria-label={ariaLabel ?? "Loading"} className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={base}
            style={{
              ...style,
              width: index === lines - 1 ? "60%" : (style.width ?? "100%"),
            }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      role={ariaLabel ? "status" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : "true"}
      className={base}
      style={style}
    />
  );
}

/** Convenience wrapper for multi-line paragraph placeholders. */
export function SkeletonText({
  lines = 3,
  className,
  ...props
}: Omit<SkeletonProps, "variant" | "lines"> & { lines?: number }) {
  return <Skeleton variant="text" lines={lines} className={className} {...props} />;
}
