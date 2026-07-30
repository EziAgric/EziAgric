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

export default function AdminLayout({ children }: { children: ReactNode }) {
  // The admin layout is intentionally thin — it delegates visual chrome
  // (top nav, sidebar) to the root AppShell and only contributes metadata
  // and any future admin-specific shell elements (e.g. a sub-navigation bar).
  return <>{children}</>;
}
