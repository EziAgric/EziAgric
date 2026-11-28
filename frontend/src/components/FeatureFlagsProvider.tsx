"use client";

/**
 * FeatureFlagsProvider
 *
 * Wraps the app and ensures flags are bootstrapped from the server on first
 * mount. Components can call `useFeatureFlags()` anywhere inside this tree.
 *
 * This is a thin wrapper — the actual fetch + cache lives in
 * `src/lib/featureFlags.ts` and `src/hooks/useFeatureFlags.ts`.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import type { FeatureFlags, FlagName } from "@/lib/featureFlags";

interface FlagContextValue extends FeatureFlags {
  isLoading: boolean;
  isFeatureEnabled: (flag: FlagName) => boolean;
  refresh: () => void;
}

const FlagContext = createContext<FlagContextValue | null>(null);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const flags = useFeatureFlags();
  return <FlagContext.Provider value={flags}>{children}</FlagContext.Provider>;
}

/** Consume flags from the nearest FeatureFlagsProvider. */
export function useFlags(): FlagContextValue {
  const ctx = useContext(FlagContext);
  if (!ctx) {
    throw new Error("useFlags must be used within a FeatureFlagsProvider");
  }
  return ctx;
}
