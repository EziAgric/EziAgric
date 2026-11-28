/**
 * Tests for generateBreadcrumbs utility (#63).
 *
 * Covers:
 * - Home is always first
 * - Admin segment gets correct label "Admin"
 * - Admin sub-routes get friendly labels (Audit History, Stream Management)
 * - Dynamic segments are title-cased and hyphen-split
 * - Paths are cumulative
 */

import { generateBreadcrumbs } from "../breadcrumbs";

describe("generateBreadcrumbs", () => {
  it("returns [Home] for root path '/'", () => {
    const crumbs = generateBreadcrumbs("/");
    expect(crumbs).toEqual([{ label: "Home", path: "/" }]);
  });

  it("includes Home + Admin for /admin", () => {
    const crumbs = generateBreadcrumbs("/admin");
    expect(crumbs).toEqual([
      { label: "Home", path: "/" },
      { label: "Admin", path: "/admin" },
    ]);
  });

  it("uses 'Audit History' label for /admin/audit", () => {
    const crumbs = generateBreadcrumbs("/admin/audit");
    expect(crumbs[2]).toEqual({ label: "Audit History", path: "/admin/audit" });
  });

  it("uses 'Stream Management' label for /admin/streams", () => {
    const crumbs = generateBreadcrumbs("/admin/streams");
    expect(crumbs[2]).toEqual({ label: "Stream Management", path: "/admin/streams" });
  });

  it("builds cumulative paths for each segment", () => {
    const crumbs = generateBreadcrumbs("/admin/streams");
    expect(crumbs[0].path).toBe("/");
    expect(crumbs[1].path).toBe("/admin");
    expect(crumbs[2].path).toBe("/admin/streams");
  });

  it("title-cases hyphenated segments not in the override map", () => {
    const crumbs = generateBreadcrumbs("/my-account/profile");
    expect(crumbs[1].label).toBe("My Account");
    expect(crumbs[2].label).toBe("Profile");
  });

  it("uses 'Trades' label for /trades", () => {
    const crumbs = generateBreadcrumbs("/trades");
    expect(crumbs[1]).toEqual({ label: "Trades", path: "/trades" });
  });

  it("uses 'Dashboard' label for /dashboard", () => {
    const crumbs = generateBreadcrumbs("/dashboard");
    expect(crumbs[1]).toEqual({ label: "Dashboard", path: "/dashboard" });
  });
});
