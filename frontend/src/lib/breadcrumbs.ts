/**
 * generateBreadcrumbs — builds a trail of { label, path } items from a
 * Next.js pathname string.
 *
 * The function is intentionally path-based (no router coupling) so it can
 * be called from any Server or Client component.
 *
 * Label overrides are applied for known route segments so the breadcrumb
 * reads naturally (e.g. "Admin" instead of "Admin", "Audit" instead of
 * "Audit", "Streams" instead of "Streams").
 *
 * Examples:
 *   generateBreadcrumbs("/admin/audit")
 *   → [{ label: "Home", path: "/" }, { label: "Admin", path: "/admin" },
 *      { label: "Audit History", path: "/admin/audit" }]
 *
 *   generateBreadcrumbs("/admin/streams")
 *   → [{ label: "Home", path: "/" }, { label: "Admin", path: "/admin" },
 *      { label: "Stream Management", path: "/admin/streams" }]
 */

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

/**
 * Human-readable label overrides for known route segments.
 * Keys are lowercase segment strings as they appear in the URL.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  admin: "Admin",
  audit: "Audit History",
  streams: "Stream Management",
  trades: "Trades",
  dashboard: "Dashboard",
  assets: "Assets",
  vault: "Vault",
  mediator: "Mediator",
  disputes: "Disputes",
  reputation: "Reputation",
  settings: "Settings",
};

function formatLabel(segment: string): string {
  if (LABEL_OVERRIDES[segment.toLowerCase()]) {
    return LABEL_OVERRIDES[segment.toLowerCase()];
  }
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [{ label: "Home", path: "/" }];

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    breadcrumbs.push({
      label: formatLabel(segments[i]),
      path: currentPath,
    });
  }

  return breadcrumbs;
}
