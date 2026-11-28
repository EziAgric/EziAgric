"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { api, type StreamRemainingResponse, ApiError } from "@/lib/api";
import { Breadcrumb, LoadingState, ErrorState } from "@/components/ui";
import {
  getAssetInfo,
  stroopsToAmount,
} from "@/lib/stellar/assets";

export default function StreamDetailPage() {
  const params = useParams();
  const streamId = params.id as string;
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const { canAccessAdmin } = useAdmin();

  const [streamData, setStreamData] = useState<StreamRemainingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get asset info from stream data
  const assetInfo = useMemo(() => {
    return getAssetInfo(streamData?.assetCode);
  }, [streamData?.assetCode]);

  const decimals = streamData?.decimals ?? assetInfo.decimals;

  useEffect(() => {
    if (!token || !streamId) return;

    const fetchStreamData = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await api.streams.getRemaining(token, streamId);
        setStreamData(data);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load stream data";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchStreamData();
  }, [token, streamId]);

  const breadcrumbItems = [
    { label: "Home", path: "/" },
    { label: "Streams", path: "/streams" },
    { label: streamId },
  ];

  const adminActionIcon = (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 1v3M8 12v3M15 8h-3M4 8H1M12.5 3.5l-2 2M5.5 10.5l-2 2M12.5 12.5l-2-2M5.5 5.5l-2-2" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  );

  if (authLoading) {
    return (
      <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <LoadingState variant="card" rows={4} />
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <ErrorState
            title="Authentication Required"
            message="Please connect your wallet and sign in to view stream details."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-full bg-bg-primary px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb with admin action */}
        <Breadcrumb
          items={breadcrumbItems}
          adminAction={
            canAccessAdmin
              ? {
                  label: "Manage Stream",
                  href: `/admin/streams/${streamId}`,
                  icon: adminActionIcon,
                }
              : undefined
          }
        />

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Stream Details</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              Vested token stream information • {assetInfo.symbol} ({decimals} decimals)
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && <LoadingState variant="card" rows={3} />}

        {/* Error state */}
        {error && !loading && (
          <ErrorState
            title="Failed to load stream"
            message={error}
          />
        )}

        {/* Stream data */}
        {!loading && !error && streamData && (
          <div className="space-y-4">
            {/* Stream ID card */}
            <div className="rounded-2xl border border-border-default bg-card p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">
                Stream ID
              </p>
              <p className="mt-2 font-mono text-sm text-text-primary break-all">
                {streamId}
              </p>
            </div>

            {/* Vesting information */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-border-default bg-card p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-text-secondary">
                  Total Vested
                </p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {stroopsToAmount(streamData.totalVested, decimals)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {assetInfo.symbol} • Total amount vested
                </p>
              </div>

              <div className="rounded-2xl border border-border-default bg-card p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-status-success">
                  Claimed
                </p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {stroopsToAmount(streamData.claimed, decimals)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {assetInfo.symbol} • Already claimed
                </p>
              </div>

              <div className="rounded-2xl border border-border-default bg-card p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-gold">
                  Unclaimed
                </p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {stroopsToAmount(streamData.unclaimed, decimals)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {assetInfo.symbol} • Available to claim
                </p>
              </div>

              <div className="rounded-2xl border border-border-default bg-card p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-status-warning">
                  Pending Clawback
                </p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {stroopsToAmount(streamData.pendingClawback, decimals)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {assetInfo.symbol} • Clawback pending
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="rounded-2xl border border-border-default bg-card p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-text-secondary mb-3">
                Vesting Progress
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-bg-elevated">
                <div
                  className="h-full bg-status-success transition-all"
                  style={{
                    width: `${
                      (Number(BigInt(streamData.claimed)) /
                        Number(BigInt(streamData.totalVested))) *
                      100
                    }%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-text-muted">
                <span>
                  {(
                    (Number(BigInt(streamData.claimed)) /
                      Number(BigInt(streamData.totalVested))) *
                    100
                  ).toFixed(2)}
                  % claimed
                </span>
                <span>
                  {(
                    (Number(BigInt(streamData.unclaimed)) /
                      Number(BigInt(streamData.totalVested))) *
                    100
                  ).toFixed(2)}
                  % remaining
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
