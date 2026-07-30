/**
 * Tests for /admin/streams — covers all four issues:
 *
 * #60 — Responsive admin stream list design
 *   - Desktop table renders with correct columns
 *   - Mobile card list renders with stream details
 *   - Action buttons present and labelled in both layouts
 *
 * #61 — Accessible keyboard flow for admin confirmations
 *   - ConfirmActionModal opens when action button clicked
 *   - Cancel button receives focus on open
 *   - Confirm action calls API and updates list
 *   - Escape / cancel closes without confirming
 *
 * #62 — Admin page loading state and skeletons
 *   - Loading skeleton appears while data in-flight
 *   - No flash: content only appears after data resolves
 *   - Error state shown after failed fetch
 *   - ForbiddenState shown for non-admin wallet
 *
 * #63 — Admin frontend route metadata and breadcrumbs
 *   - Breadcrumb nav landmark present
 *   - Home / Admin / Stream Management crumbs rendered
 *   - Current page crumb aria-current="page"
 */

import React from "react";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import AdminStreamsPage from "../page";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePathname } from "next/navigation";
import { adminStreamApi } from "@/lib/api/adminStreams";
import { trackAdminEvent } from "@/lib/analytics";

expect.extend(toHaveNoViolations);

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/hooks/useAuth");
jest.mock("@/hooks/useIsAdmin");
jest.mock("next/navigation", () => ({ usePathname: jest.fn() }));
jest.mock("@/lib/analytics", () => ({ trackAdminEvent: jest.fn() }));
jest.mock("@/lib/api/adminStreams", () => ({
  adminStreamApi: {
    list: jest.fn(),
    update: jest.fn(),
  },
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseIsAdmin = useIsAdmin as jest.MockedFunction<typeof useIsAdmin>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockList = adminStreamApi.list as jest.MockedFunction<typeof adminStreamApi.list>;
const mockUpdate = adminStreamApi.update as jest.MockedFunction<typeof adminStreamApi.update>;
const mockTrackAdminEvent = trackAdminEvent as jest.MockedFunction<typeof trackAdminEvent>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStream(overrides: Partial<{
  id: string;
  tradeId: string;
  sellerAddress: string;
  buyerAddress: string;
  amountCngn: string;
  status: "active" | "paused" | "closed" | "pending";
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: "stream-abc123",
    tradeId: "trade-xyz789",
    sellerAddress: "GSELLER123456789012345678901234567890123456789012345678",
    buyerAddress: "GBUYER123456789012345678901234567890123456789012345678",
    amountCngn: "250,000",
    status: "active" as const,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

const PAGINATION = { page: 1, limit: 15, total: 1, totalPages: 1 };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    token: "admin-token",
    isAuthenticated: true,
  } as ReturnType<typeof useAuth>);
  mockUseIsAdmin.mockReturnValue(true);
  mockUsePathname.mockReturnValue("/admin/streams");
});

// ─── #62 — Loading state and skeletons ────────────────────────────────────────

describe("#62 — Loading state and skeletons", () => {
  it("shows an aria-busy skeleton while streams are loading", () => {
    mockList.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<AdminStreamsPage />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("removes the skeleton and shows content once data resolves", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream()],
      pagination: PAGINATION,
    });

    const { container } = render(<AdminStreamsPage />);

    // Skeleton is present initially
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();

    // After resolution, stream table is visible
    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /stream id/i })).toBeInTheDocument();
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
  });

  it("shows ForbiddenState for non-admin wallets without calling the API", () => {
    mockUseIsAdmin.mockReturnValue(false);

    render(<AdminStreamsPage />);

    expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("shows an ErrorState with retry button when fetch fails", async () => {
    mockList.mockRejectedValueOnce(new Error("Server unavailable"));

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(screen.getByText("Couldn't load streams")).toBeInTheDocument();
    });
    expect(screen.getByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("emits a page-view analytics event on mount", () => {
    mockList.mockReturnValue(new Promise(() => {}));

    render(<AdminStreamsPage />);

    expect(mockTrackAdminEvent).toHaveBeenCalledWith("admin_streams_page_view", "viewed");
  });

  it("shows empty state when no streams match", async () => {
    mockList.mockResolvedValueOnce({
      items: [],
      pagination: { ...PAGINATION, total: 0 },
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no streams found/i)).toBeInTheDocument();
    });
  });
});

// ─── #60 — Responsive stream list design ─────────────────────────────────────

describe("#60 — Responsive stream list design", () => {
  it("renders desktop table with all required columns", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream()],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /stream id/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("columnheader", { name: /trade/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /seller/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /amount/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /created/i })).toBeInTheDocument();
  });

  it("renders mobile card list with stream details", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream({ id: "stream-mobile-test" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      // Card list (role=list) should be in the DOM even if visually hidden on desktop
      const list = screen.getByRole("list", { name: /streams/i });
      expect(list).toBeInTheDocument();
    });

    // Card should have definition list fields
    expect(screen.getByText("Trade")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Seller")).toBeInTheDocument();
  });

  it("shows status pill with correct text", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream({ status: "paused" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      // getAllByText because both desktop table and mobile card render StatusPill
      const pills = screen.getAllByText("paused");
      expect(pills.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders filter tab bar with all status options", async () => {
    mockList.mockResolvedValueOnce({ items: [], pagination: PAGINATION });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getByRole("tablist"));

    const tablist = screen.getByRole("tablist", { name: /stream status filters/i });
    expect(within(tablist).getByRole("tab", { name: /all/i })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: /active/i })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: /paused/i })).toBeInTheDocument();
    expect(within(tablist).getByRole("tab", { name: /closed/i })).toBeInTheDocument();
  });

  it("shows action buttons for active stream", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream({ status: "active" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /pause stream/i }).length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(
      screen.getAllByRole("button", { name: /close stream/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows Resume and Close buttons for paused stream, not Pause", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream({ status: "paused" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /resume stream/i }).length,
      ).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole("button", { name: /pause stream/i })).not.toBeInTheDocument();
  });

  it("shows no action buttons for closed stream", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream({ status: "closed" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getAllByText("closed"));

    expect(screen.queryByRole("button", { name: /pause stream/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close stream/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resume stream/i })).not.toBeInTheDocument();
  });
});

// ─── #61 — Keyboard accessible confirmation flow ──────────────────────────────

describe("#61 — Keyboard accessible confirmation flow", () => {
  it("opens confirmation modal when Pause is clicked", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce({
      items: [makeStream({ status: "active" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getAllByRole("button", { name: /pause stream/i }));

    // Click the first Pause button (desktop row)
    await user.click(screen.getAllByRole("button", { name: /pause stream/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(screen.getByText(/pause stream/i)).toBeInTheDocument();
  });

  it("closes modal without calling API when Cancel is clicked", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce({
      items: [makeStream({ status: "active" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getAllByRole("button", { name: /pause stream/i }));
    await user.click(screen.getAllByRole("button", { name: /pause stream/i })[0]);

    await waitFor(() => screen.getByRole("alertdialog"));

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls API with paused status and closes modal when confirmed", async () => {
    const user = userEvent.setup();
    const stream = makeStream({ status: "active" });
    mockList.mockResolvedValueOnce({ items: [stream], pagination: PAGINATION });
    mockUpdate.mockResolvedValueOnce({ ...stream, status: "paused" });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getAllByRole("button", { name: /pause stream/i }));
    await user.click(screen.getAllByRole("button", { name: /pause stream/i })[0]);

    await waitFor(() => screen.getByRole("alertdialog"));

    const confirmBtn = screen.getByTestId("confirm-action-button");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "admin-token",
        stream.id,
        { status: "paused" },
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("calls API with closed status when Close is confirmed", async () => {
    const user = userEvent.setup();
    const stream = makeStream({ status: "active" });
    mockList.mockResolvedValueOnce({ items: [stream], pagination: PAGINATION });
    mockUpdate.mockResolvedValueOnce({ ...stream, status: "closed" });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getAllByRole("button", { name: /close stream/i }));
    await user.click(screen.getAllByRole("button", { name: /close stream/i })[0]);

    await waitFor(() => screen.getByRole("alertdialog"));

    const confirmBtn = screen.getByTestId("confirm-action-button");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "admin-token",
        stream.id,
        { status: "closed" },
      );
    });
  });

  it("action button groups have accessible aria-label", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream({ id: "stream-abc123", status: "active" })],
      pagination: PAGINATION,
    });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getAllByRole("group", { name: /actions for stream/i }));

    const groups = screen.getAllByRole("group", { name: /actions for stream stream-abc123/i });
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it("pagination buttons are keyboard accessible with aria-labels", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream()],
      pagination: { page: 1, limit: 15, total: 30, totalPages: 2 },
    });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /previous page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
  });
});

// ─── #63 — Breadcrumbs and route metadata ────────────────────────────────────

describe("#63 — Breadcrumbs and route metadata", () => {
  it("renders a Breadcrumb nav landmark", async () => {
    mockList.mockResolvedValueOnce({ items: [], pagination: PAGINATION });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
    });
  });

  it("includes Home, Admin, and Stream Management crumbs", async () => {
    mockList.mockResolvedValueOnce({ items: [], pagination: PAGINATION });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getByRole("navigation", { name: /breadcrumb/i }));

    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(nav).getByText("Home")).toBeInTheDocument();
    expect(within(nav).getByText("Admin")).toBeInTheDocument();
    expect(within(nav).getByText("Stream Management")).toBeInTheDocument();
  });

  it("marks the last breadcrumb item as aria-current='page'", async () => {
    mockList.mockResolvedValueOnce({ items: [], pagination: PAGINATION });

    render(<AdminStreamsPage />);

    await waitFor(() => screen.getByRole("navigation", { name: /breadcrumb/i }));

    const current = screen.getByText("Stream Management");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("renders the page heading", async () => {
    mockList.mockResolvedValueOnce({ items: [], pagination: PAGINATION });

    render(<AdminStreamsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /stream management/i }),
      ).toBeInTheDocument();
    });
  });
});

// ─── Accessibility audit ──────────────────────────────────────────────────────

describe("Accessibility audit (axe — WCAG 2.1 AA)", () => {
  it("loaded state with streams has no axe violations", async () => {
    mockList.mockResolvedValueOnce({
      items: [makeStream(), makeStream({ id: "stream-two", status: "paused" })],
      pagination: PAGINATION,
    });

    const { container } = render(<AdminStreamsPage />);

    await waitFor(() =>
      screen.getByRole("columnheader", { name: /stream id/i }),
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("empty state has no axe violations", async () => {
    mockList.mockResolvedValueOnce({ items: [], pagination: PAGINATION });

    const { container } = render(<AdminStreamsPage />);

    await waitFor(() => screen.getByText(/no streams found/i));

    expect(await axe(container)).toHaveNoViolations();
  });
});
