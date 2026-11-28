/**
 * Tests for the Breadcrumbs component (#63).
 *
 * Covers:
 * - Correct landmark and list structure
 * - Home link and intermediate links rendered
 * - Last item is plain text with aria-current="page"
 * - ARIA attributes are present
 * - axe accessibility audit passes
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Breadcrumbs } from "../Breadcrumbs";
import type { BreadcrumbItem } from "@/lib/breadcrumbs";

expect.extend(toHaveNoViolations);

const ADMIN_STREAMS_CRUMBS: BreadcrumbItem[] = [
  { label: "Home", path: "/" },
  { label: "Admin", path: "/admin" },
  { label: "Stream Management", path: "/admin/streams" },
];

const SINGLE_CRUMB: BreadcrumbItem[] = [{ label: "Home", path: "/" }];

describe("Breadcrumbs component", () => {
  it("renders a <nav> with aria-label='Breadcrumb'", () => {
    render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it("renders an ordered list inside the nav", () => {
    const { container } = render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);
    const nav = container.querySelector("nav");
    expect(nav?.querySelector("ol")).toBeInTheDocument();
  });

  it("renders links for all items except the last", () => {
    render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);

    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });

    // Home and Admin should be links
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("renders the last item as plain text, not a link", () => {
    render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);

    // "Stream Management" should not be a link
    const link = screen.queryByRole("link", { name: "Stream Management" });
    expect(link).not.toBeInTheDocument();

    // But the text should be present
    expect(screen.getByText("Stream Management")).toBeInTheDocument();
  });

  it("marks the last item with aria-current='page'", () => {
    render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);

    const current = screen.getByText("Stream Management");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("does not mark non-last items with aria-current", () => {
    render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);

    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).not.toHaveAttribute("aria-current");

    const adminLink = screen.getByRole("link", { name: "Admin" });
    expect(adminLink).not.toHaveAttribute("aria-current");
  });

  it("renders nothing when items array is empty", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("works with a single item (current page only)", () => {
    render(<Breadcrumbs items={SINGLE_CRUMB} />);

    // With a single item that is also the last, it should be plain text
    const current = screen.getByText("Home");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  it("has no axe violations for multi-level breadcrumbs", async () => {
    const { container } = render(<Breadcrumbs items={ADMIN_STREAMS_CRUMBS} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations for single-level breadcrumb", async () => {
    const { container } = render(<Breadcrumbs items={SINGLE_CRUMB} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
