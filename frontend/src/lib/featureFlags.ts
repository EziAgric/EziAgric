/**
 * Feature flags — typed catalog shared with backend definitions.
 *
 * Architecture:
 *  1. `FLAG_CATALOG`  — single source of truth for all flag names + defaults.
 *  2. `getFeatureFlags()` — static env-var snapshot (SSR / build time).
 *  3. `fetchServerFlags()` — fetches the live catalog from /api/flags with
 *     stale-while-revalidate caching. On fetch failure the catalog default
 *     (fail-safe) is returned — kill-switch semantics.
 *
 * The flag names in FLAG_CATALOG MUST stay in sync with the backend's
 * feature-flags service. A CI script (`scripts/check-flag-catalog-drift.ts`)
 * enforces this by comparing against the backend endpoint.
 */

// ---------------------------------------------------------------------------
// Catalog — edit only here; both client code and CI drift-check use this.
// ---------------------------------------------------------------------------

/**
 * All known feature flags.
 * Default value is the FAIL-SAFE: what the flag resolves to when the server
 * cannot be reached or the flag is absent from the response.
 *
 * Convention:
 *  - UI-facing flags: `false` default (feature is OFF until explicitly enabled)
 *  - Kill-switch flags: `true` default (feature is ON unless disabled)
 */
export const FLAG_CATALOG = {
  /** Admin UI pages (streams, batch actions, feature toggles). */
  adminUI: false,
  /** Clawback action on admin stream detail screen. */
  clawbackUI: false,
  /** Advanced reporting dashboard tab. */
  advancedReporting: false,
  /** Offline-mode banner shown when NetInfo reports no connectivity. */
  offlineBanner: true,
  /** New trade-creation wizard (multi-step). */
  tradeWizardV2: false,
} as const satisfies Record<string, boolean>;

export type FlagName = keyof typeof FLAG_CATALOG;

/** Runtime flag map — every key is a FlagName, value is boolean. */
export type FeatureFlags = { [K in FlagName]: boolean };

// ---------------------------------------------------------------------------
// Static env-var snapshot (SSR / jest / build-time use)
// ---------------------------------------------------------------------------

/**
 * Get the current feature flags from NEXT_PUBLIC_* environment variables.
 * Falls back to the catalog default for any flag not set in env.
 *
 * Use `useLiveFeatureFlags()` in React components for the server-fetched,
 * SWR-cached version.
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    adminUI:
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI === "true" ||
      FLAG_CATALOG.adminUI,
    clawbackUI:
      process.env.NEXT_PUBLIC_ENABLE_CLAWBACK_UI === "true" ||
      FLAG_CATALOG.clawbackUI,
    advancedReporting:
      process.env.NEXT_PUBLIC_ENABLE_ADVANCED_REPORTING === "true" ||
      FLAG_CATALOG.advancedReporting,
    offlineBanner:
      process.env.NEXT_PUBLIC_DISABLE_OFFLINE_BANNER !== "true" &&
      FLAG_CATALOG.offlineBanner,
    tradeWizardV2:
      process.env.NEXT_PUBLIC_ENABLE_TRADE_WIZARD_V2 === "true" ||
      FLAG_CATALOG.tradeWizardV2,
  };
}

/** Check if a specific feature is enabled via env var. */
export function isFeatureEnabled(feature: FlagName): boolean {
  return getFeatureFlags()[feature];
}

/** @deprecated Use the FlagName-typed overload. */
export function isAdminUIEnabled(): boolean {
  return getFeatureFlags().adminUI;
}

// ---------------------------------------------------------------------------
// Server-fetched cache with stale-while-revalidate semantics
// ---------------------------------------------------------------------------

const SERVER_FLAGS_TTL_MS = 30_000; // 30 s — revalidate in background after this

interface CacheEntry {
  flags: FeatureFlags;
  fetchedAt: number;
  /** True while a background revalidation is in flight. */
  revalidating: boolean;
}

let _cache: CacheEntry | null = null;
let _inFlight: Promise<FeatureFlags> | null = null;

/**
 * Fetch flags from the Next.js /api/flags bootstrap route.
 *
 * Kill-switch guarantee: if the request fails for any reason the function
 * returns the fail-safe catalog defaults instead of throwing. This means a
 * backend outage or network error disables risky features rather than
 * crashing the app.
 */
async function fetchFlagsFromServer(): Promise<FeatureFlags> {
  try {
    const res = await fetch("/api/flags", {
      // No-store so the browser does not cache this behind Next.js; the
      // module-level cache above provides the SWR layer instead.
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.warn(
        `[featureFlags] /api/flags responded ${res.status} — using catalog defaults`,
      );
      return catalogDefaults();
    }

    const json = (await res.json()) as { flags?: Partial<FeatureFlags> };
    return mergeFlagsWithDefaults(json.flags ?? {});
  } catch (err) {
    // Network error, parse error, etc. — fail safe.
    console.warn(
      "[featureFlags] Failed to fetch server flags — using catalog defaults",
      err,
    );
    return catalogDefaults();
  }
}

/** Merge server-provided flags with catalog defaults for any missing keys. */
function mergeFlagsWithDefaults(partial: Partial<FeatureFlags>): FeatureFlags {
  const result = {} as FeatureFlags;
  for (const key of Object.keys(FLAG_CATALOG) as FlagName[]) {
    result[key] =
      key in partial ? (partial[key] as boolean) : FLAG_CATALOG[key];
  }
  return result;
}

/** Return the catalog defaults as a plain FeatureFlags object. */
function catalogDefaults(): FeatureFlags {
  return mergeFlagsWithDefaults({});
}

/**
 * Fetch server flags with stale-while-revalidate semantics.
 *
 * - First call: awaits the server fetch (cold start).
 * - Subsequent calls within TTL: returns cached flags immediately.
 * - After TTL: returns stale cache immediately and revalidates in background.
 * - On failure at any point: falls back to catalog defaults.
 */
export async function fetchServerFlags(): Promise<FeatureFlags> {
  const now = Date.now();

  if (_cache) {
    const age = now - _cache.fetchedAt;

    if (age < SERVER_FLAGS_TTL_MS) {
      // Fresh — return immediately.
      return _cache.flags;
    }

    // Stale — return cached flags now, revalidate in background.
    if (!_cache.revalidating) {
      _cache.revalidating = true;
      void fetchFlagsFromServer().then((fresh) => {
        _cache = { flags: fresh, fetchedAt: Date.now(), revalidating: false };
      });
    }
    return _cache.flags;
  }

  // No cache — deduplicate concurrent cold-start requests.
  if (_inFlight) return _inFlight;

  _inFlight = fetchFlagsFromServer().then((flags) => {
    _cache = { flags, fetchedAt: Date.now(), revalidating: false };
    _inFlight = null;
    return flags;
  });

  return _inFlight;
}

/** Force-invalidate the in-process SWR cache (useful for tests). */
export function invalidateFlagCache(): void {
  _cache = null;
  _inFlight = null;
}
