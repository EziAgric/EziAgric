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
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    <ErrorBoundary backLabel="Back to admin" backHref="/admin">
      {children}
    </ErrorBoundary>
  );
}
