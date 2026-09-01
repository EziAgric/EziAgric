"use client";

/**
 * FlagDebugPanel — admin-only overlay showing all active feature flags.
 *
 * Gated behind `useIsAdmin()` so it never renders for non-staff users.
 * Accessible as a collapsible panel in the bottom-right corner of the app.
 *
 * Shows:
 *  - Each flag name and its current resolved value (green = on, red = off)
 *  - A "Refresh" button to force-fetch the latest flags from the server
 *  - A loading indicator while the SWR cache is revalidating
 */

import { useState } from "react";
import { useFlags } from "@/components/FeatureFlagsProvider";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { FLAG_CATALOG, type FlagName } from "@/lib/featureFlags";

export function FlagDebugPanel() {
  const isAdmin = useIsAdmin();
  const { isLoading, refresh, ...flags } = useFlags();
  const [isOpen, setIsOpen] = useState(false);

  // Only render for staff role — never visible to end users.
  if (!isAdmin) return null;

  const flagEntries = Object.keys(FLAG_CATALOG) as FlagName[];

  return (
    <div
      data-testid="flag-debug-panel"
      className="fixed bottom-4 right-4 z-50 font-mono text-xs"
    >
      {/* Toggle button */}
      <button
        aria-label={isOpen ? "Close feature flags panel" : "Open feature flags panel"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border-default bg-card px-3 py-2 text-xs font-semibold text-text-secondary shadow-lg hover:border-border-hover hover:text-text-primary transition-colors"
      >
        <span aria-hidden>🚩</span>
        <span>Flags</span>
        {isLoading && (
          <span
            aria-label="Refreshing flags"
            className="ml-1 inline-block h-2 w-2 animate-spin rounded-full border border-gold border-t-transparent"
          />
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Feature flags debug panel"
          className="absolute bottom-10 right-0 w-72 rounded-xl border border-border-default bg-card shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
            <span className="font-semibold text-text-primary text-sm">Feature Flags</span>
            <button
              onClick={() => { refresh(); }}
              disabled={isLoading}
              aria-label="Refresh feature flags from server"
              className="rounded px-2 py-0.5 text-[11px] font-medium text-gold hover:underline disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {/* Flag rows */}
          <ul className="max-h-72 overflow-y-auto divide-y divide-border-default" role="list">
            {flagEntries.map((name) => {
              const isEnabled = (flags as Record<FlagName, boolean>)[name];
              return (
                <li
                  key={name}
                  data-testid={`flag-debug-row-${name}`}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <span className="text-text-secondary">{name}</span>
                  <span
                    aria-label={isEnabled ? `${name} is enabled` : `${name} is disabled`}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      isEnabled
                        ? "bg-status-success/15 text-status-success"
                        : "bg-status-danger/15 text-status-danger"
                    }`}
                  >
                    {isEnabled ? "ON" : "OFF"}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Footer note */}
          <div className="border-t border-border-default px-4 py-2 text-[10px] text-text-muted">
            Flags resolve: backend → env → catalog default. Staff only.
          </div>
        </div>
      )}
    </div>
  );
}
