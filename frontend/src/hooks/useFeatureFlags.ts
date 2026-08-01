"use client";

import { useMemo } from "react";
import { getFeatureFlags, type FeatureFlags } from "@/lib/featureFlags";

interface UseFeatureFlagsResult extends FeatureFlags {
  isFeatureEnabled: (feature: keyof FeatureFlags) => boolean;
}

/**
 * Hook to access feature flags in React components
 * Feature flags are read from environment variables and cached
 */
export function useFeatureFlags(): UseFeatureFlagsResult {
  const flags = useMemo(() => getFeatureFlags(), []);

  const isFeatureEnabled = useMemo(() => {
    return (feature: keyof FeatureFlags) => flags[feature];
  }, [flags]);

  return {
    ...flags,
    isFeatureEnabled,
  };
}
