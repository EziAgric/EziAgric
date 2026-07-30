"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ForbiddenState } from "@/components/ui/ForbiddenState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";

interface ClawbackPreview {
  streamId: string;
  remainingVested: string;
  requestedClawback: string;
  postClawbackBalance: string;
  preview: boolean;
  timestamp: string;
}

export default function AdminStreamsPage() {
  const { token, isAuthenticated } = useAuth();
  const isAdmin = useIsAdmin();

  const [streamId, setStreamId] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<ClawbackPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClawbackPreview = useCallback(async () => {
    if (!isAuthenticated || !token || !streamId || !amount) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    setPreview(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api/admin/streams/${encodeURIComponent(streamId)}/clawback/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }

      const data: ClawbackPreview = await res.json();
      setPreview(data);
      setSuccess("Clawback preview generated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview clawback");
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated, streamId, amount]);

  if (!isAdmin) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
        <ForbiddenState />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="admin-streams-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-text-primary">Stream Admin</h1>
      </div>

      <div className="p-6 bg-bg-elevated rounded-lg border border-border-default mb-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">Clawback Preview</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="streamId" className="block text-sm font-medium text-text-secondary mb-1">
              Stream ID
            </label>
            <input
              id="streamId"
              type="text"
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              placeholder="Enter stream ID"
              className="w-full px-3 py-2 border border-border-default rounded-md bg-bg-default text-text-primary"
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-text-secondary mb-1">
              Amount
            </label>
            <input
              id="amount"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-3 py-2 border border-border-default rounded-md bg-bg-default text-text-primary"
            />
          </div>
          <Button
            variant="primary"
            onClick={handleClawbackPreview}
            disabled={loading || !streamId || !amount}
          >
            {loading ? "Processing..." : "Preview Clawback"}
          </Button>
        </div>
      </div>

      {error && (
        <ErrorState
          variant="card"
          title="Clawback preview failed"
          message={error}
          onRetry={handleClawbackPreview}
        />
      )}

      {success && preview && (
        <div className="p-6 bg-bg-elevated rounded-lg border border-border-default" data-testid="clawback-result">
          <h3 className="text-lg font-semibold text-text-primary mb-3">Preview Result</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">Stream ID</dt>
              <dd className="text-text-primary font-mono">{preview.streamId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Remaining Vested</dt>
              <dd className="text-text-primary font-mono">{preview.remainingVested}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Requested Clawback</dt>
              <dd className="text-text-primary font-mono">{preview.requestedClawback}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">Post-Clawback Balance</dt>
              <dd className="text-text-primary font-mono">{preview.postClawbackBalance}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-text-secondary">
            Clawback preview generated successfully
          </p>
        </div>
      )}
    </div>
  );
}
