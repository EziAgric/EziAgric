import Link from "next/link";
import { type ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  adminAction?: {
    label: string;
    href: string;
    icon?: ReactNode;
  };
}

export function Breadcrumb({ items, adminAction }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center justify-between">
      <ol className="flex items-center space-x-2 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          
          return (
            <li key={item.path || item.label} className="flex items-center">
              {index > 0 && (
                <svg
                  className="mx-2 h-4 w-4 text-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
              {isLast || !item.path ? (
                <span
                  className={
                    isLast
                      ? "font-medium text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.path}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {adminAction && (
        <Link
          href={adminAction.href}
          className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-border-hover hover:bg-card hover:text-text-primary transition-colors"
        >
          {adminAction.icon}
          {adminAction.label}
        </Link>
      )}
    </nav>
  );
}
