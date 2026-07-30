"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { Breadcrumb, LoadingState, ErrorState } from "@/components/ui";

export default function AdminStreamsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isAdmin } = useAdmin();

  const breadcrumbItems = [
    { label: "Home", path: "/" },
    { label: "Admin", path: "/admin" },
    { label: "Streams" },
  ];

  if (authLoading) {
    return (
      <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <LoadingState variant="card" rows={4} />
        </div>
      </section>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <ErrorState
            title="Access Denied"
            message="You must be an admin to access this page."
          />
          <div className="mt-6 text-center">
            <Link
              href="/streams"
              className="inline-flex rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-gold-hover transition-colors"
            >
              View Streams
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} />

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Admin Stream Management</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              Manage all vested token streams in the system
            </p>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-border-hover hover:bg-card hover:text-text-primary transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 12l-4-4 4-4" />
            </svg>
            Back to Admin
          </Link>
        </div>

        {/* Coming soon placeholder */}
        <div className="rounded-2xl border border-border-default bg-card p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gold"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-medium text-text-primary">Admin Stream List Coming Soon</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Comprehensive stream listing, search, and bulk management features are under development.
          </p>
        </div>

        {/* Quick access */}
        <div className="rounded-2xl border border-border-default bg-card p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-text-secondary mb-3">
            Quick Access
          </p>
          <p className="text-sm text-text-muted mb-4">
            To manage a specific stream, navigate to:{" "}
            <code className="rounded bg-bg-elevated px-2 py-1 text-xs text-text-primary font-mono">
              /admin/streams/[streamId]
            </code>
          </p>
          <div className="flex gap-3">
            <Link
              href="/admin/streams/example-stream-123"
              className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-gold-hover transition-colors"
            >
              Manage Example Stream
            </Link>
          </div>
        </div>

        {/* Admin capabilities */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border-default bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-status-warning/10 p-2">
                <svg className="h-5 w-5 text-status-warning" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Clawback</h3>
            </div>
            <p className="text-xs text-text-muted">
              Preview and execute clawback operations on unclaimed vested tokens
            </p>
          </div>

          <div className="rounded-2xl border border-border-default bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-status-danger/10 p-2">
                <svg className="h-5 w-5 text-status-danger" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Suspend</h3>
            </div>
            <p className="text-xs text-text-muted">
              Temporarily suspend stream vesting without clawback
            </p>
          </div>

          <div className="rounded-2xl border border-border-default bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-status-success/10 p-2">
                <svg className="h-5 w-5 text-status-success" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Resume</h3>
            </div>
            <p className="text-xs text-text-muted">
              Restore previously suspended stream vesting
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
