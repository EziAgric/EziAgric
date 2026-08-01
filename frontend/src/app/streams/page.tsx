"use client";

import Link from "next/link";
import { Breadcrumb } from "@/components/ui";

export default function StreamsPage() {
  const breadcrumbItems = [
    { label: "Home", path: "/" },
    { label: "Streams" },
  ];

  return (
    <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} />

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Vested Token Streams</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              View and manage your vested token streams
            </p>
          </div>
        </div>

        {/* Coming soon placeholder */}
        <div className="rounded-2xl border border-border-default bg-card p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-medium text-text-primary">Stream List Coming Soon</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Stream listing and filtering features are under development.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex rounded-lg border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-secondary hover:border-border-hover hover:bg-card hover:text-text-primary transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>

        {/* Example stream navigation */}
        <div className="rounded-2xl border border-border-default bg-card p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-text-secondary mb-3">
            Quick Access
          </p>
          <p className="text-sm text-text-muted mb-4">
            To view a specific stream, navigate to:{" "}
            <code className="rounded bg-bg-elevated px-2 py-1 text-xs text-text-primary font-mono">
              /streams/[streamId]
            </code>
          </p>
          <div className="flex gap-3">
            <Link
              href="/streams/example-stream-123"
              className="rounded-lg border border-border-default bg-bg-elevated px-4 py-2 text-sm font-medium text-text-secondary hover:border-border-hover hover:bg-card hover:text-text-primary transition-colors"
            >
              View Example Stream
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
