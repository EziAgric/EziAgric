"use client";

/**
 * Breadcrumbs — page-level navigation trail.
 *
 * Uses the standard <nav aria-label="Breadcrumb"> + <ol> pattern so screen
 * readers announce "Breadcrumb navigation" and enumerate the steps correctly.
 * The last item is marked aria-current="page" and is rendered as plain text
 * (not a link) so it matches the WCAG "Location" success criterion (2.4.8).
 *
 * Usage:
 *   import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
 *   import { generateBreadcrumbs } from "@/lib/breadcrumbs";
 *
 *   const crumbs = generateBreadcrumbs(pathname);
 *   <Breadcrumbs items={crumbs} />
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { BreadcrumbItem } from "@/lib/breadcrumbs";

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={clsx("flex items-center", className)}>
      <ol className="flex items-center flex-wrap gap-y-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.path ?? item.label}-${index}`} className="flex items-center">
              {index > 0 && (
                <ChevronRight
                  size={14}
                  className="mx-1.5 text-text-muted flex-shrink-0"
                  aria-hidden="true"
                />
              )}

              {isLast || !item.path ? (
                // Current page — plain text, no link
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={clsx(
                    isLast
                      ? "text-text-primary font-medium"
                      : "text-text-secondary",
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.path}
                  className="text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 rounded-sm"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
