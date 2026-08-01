/**
 * Feature flags configuration for gradual feature rollout
 * Flags are configured via environment variables
 */

export interface FeatureFlags {
  adminUI: boolean;
  // Add more feature flags here as needed
}

/**
 * Get the current feature flags configuration
 * Flags default to false (disabled) for safety
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    // Admin UI feature flag - controls visibility of all admin pages and features
    adminUI: process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI === "true",
  };
}

/**
 * Check if admin UI features are enabled
 */
export function isAdminUIEnabled(): boolean {
  return getFeatureFlags().adminUI;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return getFeatureFlags()[feature];
}
