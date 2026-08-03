"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Route guard for every page under `/admin`. Unlike each page's own
 * `ForbiddenState` fallback (defense in depth once already on the page),
 * this redirects away before an unauthenticated or non-admin caller ever
 * sees admin content rendered.
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

  return <>{children}</>;
}
