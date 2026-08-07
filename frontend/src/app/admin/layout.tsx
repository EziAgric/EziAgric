"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

/**
 * Layout for every page under `/admin`. Wraps the route guard (redirects
 * unauthenticated/non-admin callers away before admin content renders) and
 * the ErrorBoundary so an unexpected error on an admin page shows a
 * recoverable fallback instead of crashing the app shell.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isAdmin = useIsAdmin();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !isAdmin) {
      router.replace("/access-denied");
    }
  }, [isLoading, isAuthenticated, isAdmin, router]);

  if (isLoading || !isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-6xl mx-auto" role="alert">
          <div className="mx-auto h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-content">Something went wrong</h2>
            <p className="text-sm text-muted">An unexpected error occurred on this page. Please try again.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg px-4 py-2 text-sm font-medium bg-danger text-white hover:bg-danger/90 transition-colors focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2"
          >
            Try again
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
