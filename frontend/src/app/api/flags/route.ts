/**
 * GET /api/flags
 *
 * Bootstrap endpoint: returns the current live feature flags to the browser.
 *
 * Sources (in order of precedence):
 *  1. Backend `/api/admin/features` (Redis-backed, admin-togglable).
 *  2. NEXT_PUBLIC_* environment variables.
 *  3. FLAG_CATALOG defaults (fail-safe).
 *
 * Kill-switch semantics: any backend error causes this route to fall back
 * to env-var / catalog defaults. The browser NEVER receives a non-200 from
 * this route (except unexpected server crashes).
 *
 * Response shape:
 *  { flags: Record<FlagName, boolean>, fetchedAt: string }
 *
 * Cache: public, stale-while-revalidate=25s, max-age=5s.
 * This lets the CDN/Next.js cache serve most requests instantly while
 * background-refreshing from the backend every 25 s.
 */

import { NextResponse } from 'next/server';
import { FLAG_CATALOG, type FlagName, type FeatureFlags } from '@/lib/featureFlags';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const BACKEND_TIMEOUT_MS = 2_000; // tight timeout — client must not wait long

/** Fetch live flags from the backend admin feature service. */
async function fetchBackendFlags(
  authToken?: string,
): Promise<Partial<FeatureFlags>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${BACKEND_URL}/api/admin/features`, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timer);

    if (!res.ok) return {};

    const json = await res.json() as {
      flags?: Record<string, { enabled: boolean }>;
    };

    const partial: Partial<FeatureFlags> = {};
    for (const [name, record] of Object.entries(json.flags ?? {})) {
      if (name in FLAG_CATALOG) {
        partial[name as FlagName] = record.enabled;
      }
    }
    return partial;

  } catch {
    // Network error, timeout, JSON parse failure — return empty so defaults apply.
    return {};
  }
}

/** Merge server partial with env-var overrides and catalog defaults. */
function resolveFlags(backendPartial: Partial<FeatureFlags>): FeatureFlags {
  const result = {} as FeatureFlags;

  for (const key of Object.keys(FLAG_CATALOG) as FlagName[]) {
    // Backend value wins if present.
    if (key in backendPartial) {
      result[key] = backendPartial[key] as boolean;
      continue;
    }
    // Env-var override next.
    const envKey = `NEXT_PUBLIC_ENABLE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    const envVal = process.env[envKey];
    if (envVal !== undefined) {
      result[key] = envVal === 'true';
      continue;
    }
    // Catalog default (fail-safe).
    result[key] = FLAG_CATALOG[key];
  }

  return result;
}

export async function GET(): Promise<NextResponse> {
  const backendPartial = await fetchBackendFlags();
  const flags = resolveFlags(backendPartial);

  return NextResponse.json(
    { flags, fetchedAt: new Date().toISOString() },
    {
      status: 200,
      headers: {
        // stale-while-revalidate: serve cached immediately, refresh in bg after 25 s
        'Cache-Control': 'public, max-age=5, stale-while-revalidate=25',
      },
    },
  );
}
