/**
 * Admin section layout — applies to all /admin/* pages.
 *
 * #63 — Route metadata:
 *   Provides a default page title for the admin section. Individual admin
 *   pages that need a more specific title can export their own `metadata`
 *   object which will override this default (Next.js metadata merging).
 *
 *   Navigation structure:
 *     /admin              → Admin Dashboard (future)
 *     /admin/audit        → Admin Action History
 *     /admin/streams      → Stream Management
 *
 *   Breadcrumbs are rendered by each page component using the shared
 *   `generateBreadcrumbs()` utility and `<Breadcrumbs>` component so they
 *   are fully client-side and path-aware without requiring a Server Component
 *   to pass the pathname down.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    template: "%s | Admin — Amana",
    default: "Admin — Amana",
  },
  description: "Amana admin management area",
  robots: {
    index: false,
    follow: false,
  },
};

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
