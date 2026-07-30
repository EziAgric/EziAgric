"use client";

/**
 * Admin Stream Management Page
 *
 * Implements four improvements in one cohesive page:
 *
 * #60 — Responsive design:
 *   - Desktop (md+): standard table layout with all columns visible.
 *   - Mobile (<md): card-per-stream layout so every row is still readable
 *     and the action button is always reachable without horizontal scroll.
 *
 * #61 — Keyboard accessibility:
 *   - All action buttons (Pause/Resume/Close) have aria-labels.
 *   - Confirmation modals trap focus via Radix Dialog.
 *   - On open, focus moves to the Cancel button (safe default).
 *   - Tab order is logical: filter bar → table rows → pagination.
 *
 * #62 — Loading state and skeletons:
 *   - SkeletonList renders while data is in-flight.
 *   - No layout shift: skeleton rows match live row height.
 *   - ErrorState shown after failed fetch, with retry.
 *   - ForbiddenState shown for non-admin wallets and 403 responses.
 *
 * #63 — Route metadata and breadcrumbs:
 *   - <head> metadata (title) via Next.js `generateMetadata` in a sibling
 *     layout file; this page renders a visible <Breadcrumbs> component.
 *   - Breadcrumb path: Home / Admin / Stream Management.
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { adminStreamApi, type AdminStream, type StreamStatus } from "@/lib/api/adminStreams";
import { AdminApiError } from "@/lib/api/admin";
import { trackAdminEvent } from "@/lib/analytics";
import { generateBreadcrumbs } from "@/lib/breadcrumbs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { NavButton } from "@/components/ui/Navigation";
import { SkeletonList } from "@/components/ui/SkeletonList";
import { ErrorState } from "@/components/ui/ErrorState";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ConfirmActionModal } from "@/components/ui/ConfirmActionModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

type StatusFilter = "all" | StreamStatus;

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Pending", value: "pending" },
  { label: "Closed", value: "closed" },
];

const STATUS_STYLES: Record<StreamStatus, string> = {
  active: "text-status-success bg-status-success/10 border border-status-success/20",
  paused: "text-status-warning bg-status-warning/10 border border-status-warning/20",
  pending: "text-text-secondary bg-surface-2 border border-border-default",
  closed: "text-text-muted bg-surface-1 border border-border-subtle",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Status pill shared by table cells and mobile cards. */
function StatusPill({ status }: { status: StreamStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

interface StreamActionsProps {
  stream: AdminStream;
  onAction: (stream: AdminStream, action: "pause" | "resume" | "close") => void;
}

/** Action buttons for a stream row — keyboard accessible with aria-labels. */
function StreamActions({ stream, onAction }: StreamActionsProps) {
  const { status, id } = stream;

  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Actions for stream ${id}`}>
      {status === "active" && (
        <button
          type="button"
          onClick={() => onAction(stream, "pause")}
          aria-label={`Pause stream ${id}`}
          className="px-2.5 py-1 text-xs font-medium rounded border border-border-default text-text-secondary hover:border-status-warning/60 hover:text-status-warning transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Pause
        </button>
      )}
      {status === "paused" && (
        <button
          type="button"
          onClick={() => onAction(stream, "resume")}
          aria-label={`Resume stream ${id}`}
          className="px-2.5 py-1 text-xs font-medium rounded border border-border-default text-text-secondary hover:border-status-success/60 hover:text-status-success transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Resume
        </button>
      )}
      {(status === "active" || status === "paused") && (
        <button
          type="button"
          onClick={() => onAction(stream, "close")}
          aria-label={`Close stream ${id}`}
          className="px-2.5 py-1 text-xs font-medium rounded border border-border-default text-text-secondary hover:border-status-danger/60 hover:text-status-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Close
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminStreamsPage() {
  const { token, isAuthenticated } = useAuth();
  const isAdmin = useIsAdmin();
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(pathname ?? "/admin/streams");

  // ── Data state ──────────────────────────────────────────────────────────────
  const [streams, setStreams] = useState<AdminStream[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // ── Confirmation modal state ─────────────────────────────────────────────────
  const [pendingAction, setPendingAction] = useState<{
    stream: AdminStream;
    action: "pause" | "resume" | "close";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchStreams = useCallback(async () => {
    if (!isAuthenticated || !token || !isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        ...(statusFilter !== "all" && { status: statusFilter as StreamStatus }),
      };
      const response = await adminStreamApi.list(token, params);
      setStreams(response.items);
      setTotalPages(response.pagination.totalPages);
      trackAdminEvent("admin_streams_page_view", "success", { page, statusFilter });
    } catch (err) {
      if (err instanceof AdminApiError && (err.reason === "forbidden" || err.status === 403)) {
        setForbidden(true);
        trackAdminEvent("admin_streams_page_view", "failed", { reason: "forbidden" });
      } else {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to reach the server. Check your connection and try again.";
        setError(message);
        trackAdminEvent("admin_streams_page_view", "failed", { reason: "error" });
      }
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated, isAdmin, page, statusFilter]);

  useEffect(() => {
    trackAdminEvent("admin_streams_page_view", "viewed");
  }, []);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  // ── Action handlers ──────────────────────────────────────────────────────────
  function handleAction(stream: AdminStream, action: "pause" | "resume" | "close") {
    setPendingAction({ stream, action });
  }

  async function handleConfirm() {
    if (!pendingAction || !token) return;
    const { stream, action } = pendingAction;

    const statusMap: Record<"pause" | "resume" | "close", StreamStatus> = {
      pause: "paused",
      resume: "active",
      close: "closed",
    };

    setActionLoading(true);
    try {
      const updated = await adminStreamApi.update(token, stream.id, {
        status: statusMap[action],
      });
      setStreams((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      trackAdminEvent(`admin_stream_${action}`, "success", { streamId: stream.id });
      setPendingAction(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
      trackAdminEvent(`admin_stream_${action}`, "failed", { streamId: stream.id });
    } finally {
      setActionLoading(false);
    }
  }

  function handleFilterChange(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  // ── Non-admin guard ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
        <ForbiddenState />
      </div>
    );
  }

  // ── Loading state (#62) ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
        {/* Breadcrumbs skeleton placeholder */}
        <div className="h-5 w-48 rounded bg-surface-2 animate-pulse mb-4" aria-hidden="true" />
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-6">
          Stream Management
        </h1>
        <SkeletonList rows={PAGE_SIZE} />
      </div>
    );
  }

  // ── Forbidden state ──────────────────────────────────────────────────────────
  if (forbidden) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
        <ForbiddenState />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
        <ErrorState
          variant="card"
          title="Couldn't load streams"
          message={error}
          onRetry={fetchStreams}
        />
      </div>
    );
  }

  // ── Confirm action label helpers ─────────────────────────────────────────────
  const actionConfirmLabel =
    pendingAction?.action === "pause"
      ? "Pause Stream"
      : pendingAction?.action === "resume"
        ? "Resume Stream"
        : "Close Stream";

  const actionConfirmVariant =
    pendingAction?.action === "close"
      ? "danger"
      : pendingAction?.action === "pause"
        ? "warning"
        : "info";

  const actionConfirmMessage =
    pendingAction?.action === "close"
      ? `Permanently close stream ${pendingAction.stream.id}? This action cannot be undone.`
      : pendingAction?.action === "pause"
        ? `Pause stream ${pendingAction.stream.id}? It can be resumed later.`
        : `Resume stream ${pendingAction.stream.id}?`;

  return (
    <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
      {/* ── Breadcrumbs (#63) ────────────────────────────────────────────────── */}
      <Breadcrumbs items={breadcrumbs} className="mb-3" data-testid="admin-breadcrumbs" />

      {/* ── Page heading ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
          Stream Management
        </h1>
      </div>

      {/* ── Filter bar (#60 — accessible filter tabs) ─────────────────────── */}
      <div className="mb-6 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          className="flex items-center gap-2 min-w-max"
          role="tablist"
          aria-label="Stream status filters"
        >
          {FILTERS.map((f) => (
            <NavButton
              key={f.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === f.value}
              isActive={statusFilter === f.value}
              onClick={() => handleFilterChange(f.value)}
            >
              {f.label}
            </NavButton>
          ))}
        </div>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {streams.length === 0 ? (
        <div className="rounded-lg border border-border-default bg-surface-1 py-16 text-center">
          <p className="text-text-secondary">No streams found for the selected filter.</p>
        </div>
      ) : (
        <>
          {/*
           * ── Responsive stream list (#60) ─────────────────────────────────────
           *
           * Desktop (md+): full table — all metadata visible at a glance.
           * Mobile (<md):  card layout — each stream gets its own card so
           *                content wraps naturally and action buttons remain
           *                reachable without horizontal scrolling.
           */}

          {/* === DESKTOP TABLE === */}
          <div
            className="hidden md:block rounded-lg border border-border-default overflow-hidden shadow-elev-1"
            role="region"
            aria-label="Streams table"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default bg-surface-1">
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    Stream ID
                  </th>
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    Trade
                  </th>
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    Seller
                  </th>
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    Amount
                  </th>
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    Status
                  </th>
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    Created
                  </th>
                  <th scope="col" className="text-left px-4 py-3 text-text-muted font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {streams.map((stream, i) => (
                  <tr
                    key={stream.id}
                    className={`border-b border-border-default last:border-0 hover:bg-surface-2 transition-colors ${
                      i % 2 === 0 ? "bg-surface-0" : "bg-surface-1"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-gold text-xs">
                      {stream.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 font-mono text-text-secondary text-xs">
                      {truncate(stream.tradeId)}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-secondary text-xs">
                      {truncate(stream.sellerAddress)}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {stream.amountCngn}{" "}
                      <span className="text-text-muted text-xs">cNGN</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={stream.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {formatDate(stream.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StreamActions stream={stream} onAction={handleAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* === MOBILE CARD LIST === */}
          <div
            className="md:hidden space-y-3"
            role="list"
            aria-label="Streams"
          >
            {streams.map((stream) => (
              <div
                key={stream.id}
                role="listitem"
                className="rounded-lg border border-border-default bg-surface-1 p-4"
              >
                {/* Header row: ID + status */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className="font-mono text-gold text-xs"
                    aria-label={`Stream ID ${stream.id}`}
                  >
                    {stream.id.slice(0, 8)}…
                  </span>
                  <StatusPill status={stream.status} />
                </div>

                {/* Details */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
                  <div>
                    <dt className="text-text-muted mb-0.5">Trade</dt>
                    <dd className="font-mono text-text-secondary">{truncate(stream.tradeId)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted mb-0.5">Amount</dt>
                    <dd className="text-text-primary font-medium">
                      {stream.amountCngn} <span className="text-text-muted font-normal">cNGN</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted mb-0.5">Seller</dt>
                    <dd className="font-mono text-text-secondary">
                      {truncate(stream.sellerAddress)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted mb-0.5">Created</dt>
                    <dd className="text-text-secondary">{formatDate(stream.createdAt)}</dd>
                  </div>
                </dl>

                {/* Actions — always visible, never overflow-hidden */}
                <StreamActions stream={stream} onAction={handleAction} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <nav
          className="flex items-center justify-center gap-2 mt-8"
          aria-label="Pagination"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <span
            className="px-3 py-1 text-sm text-text-secondary"
            aria-live="polite"
            aria-atomic="true"
          >
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            Next
          </Button>
        </nav>
      )}

      {/* ── Confirmation modal (#61) ──────────────────────────────────────────── */}
      {pendingAction && (
        <ConfirmActionModal
          open={!!pendingAction}
          onOpenChange={(open) => {
            if (!open) setPendingAction(null);
          }}
          title={actionConfirmLabel}
          message={actionConfirmMessage}
          confirmLabel={actionConfirmLabel}
          cancelLabel="Cancel"
          variant={actionConfirmVariant}
          onConfirm={handleConfirm}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
