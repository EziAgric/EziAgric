# Amana API Versioning & Deprecation Policy

## Status

- **Current version:** `v1`
- **Consumer-facing lane:** `/api/v1/*`
- **Legacy aliases:** `/auth`, `/wallet`, `/users`, `/trades`, `/goals`, `/disputes`,
  `/dispute-categories`, `/stellar`, `/contract`, `/treasury`, `/webhooks`, `/evidence`,
  `/users/me/*` (privacy) — served **with `Deprecation` + `Sunset` headers**.
- **Non-versioned (internal / infra):** `/health*` (infrastructure) and `/admin`, `/api/admin`
  (internal ops tooling). These carry no version promise and are out of scope for this policy.

## Why version

The API was previously unversioned: every path lived at its route root and any breaking
change landed immediately, risking shipped mobile/web builds that users don't update
promptly. Versioning gives every consumer a stable lane and a defined migration window.

## How it works

```text
Browser / Mobile / External consumer
        │
        ├─ /api/v1/auth/login   →  versioned lane (X-Api-Version: v1)  [current]
        │
        └─ /auth/login          →  legacy alias (Deprecation: true, Sunset: <date>)  [deprecated]
```

Both lanes are mounted from the **same router** (`backend/src/routes/publicApi.router.ts`)
in `createApp` (`backend/src/app.ts`), so behaviour is identical by construction. There is
no separate legacy code path to drift. Parity is locked by
`backend/src/__tests__/api.versioning.test.ts`.

### Response headers

| Header | `/api/v1` | Legacy alias | Meaning |
| ------ | --------- | ------------ | ------- |
| `X-Api-Version` | `v1` | `v1` | API version that served the response |
| `Deprecation` | (absent) | `true` | RFC 8594 — this lane is deprecated |
| `Sunset` | (absent) | RFC 1123 date | When the legacy alias is removed |

### Which routes are versioned

- **Consumer-facing** routes are under `/api/v1` (and their legacy aliases).
- **Admin** routes (`/admin/*`, `/api/admin/*`) stay unversioned — they are internal
  operation tooling consumed by the DP/admin UI only.
- **Health** routes (`/health`) stay unversioned — they are infrastructure probes.

The set of consumer base paths that trigger deprecation signalling is defined in
`backend/src/middleware/apiVersion.middleware.ts` (`PUBLIC_API_BASE_PATHS`).

## Client switchover

The web/mobile SDK injects the version prefix **centrally** in
`frontend/src/lib/api/client.ts` (`resolveApiUrl`). No endpoint module needs to know the
version — flipping to a new version is a single config change:

- `NEXT_PUBLIC_API_VERSION_PREFIX=/api/v1` (default) → versioned lane.
- `NEXT_PUBLIC_API_VERSION_PREFIX=` (empty) → legacy aliases (fallback only).

Admin (`/admin`, `/api/admin`) and health endpoints are excluded from the prefix in
`resolveApiUrl` and always hit the legacy paths.

## Timeline / commitments

| Milestone | Commitment |
| --------- | ---------- |
| Now | `v1` is the current lane; legacy aliases supported with deprecation headers. |
| `Sunset` date (`backend/src/middleware/apiVersion.middleware.ts`) | Legacy aliases removed; `v1` becomes the only lane. |
| Before any `v2` breaking change | Deprecate the affected `v1` surfaces with `Sunset`; keep them for one full minor-release window; bump `API_VERSION`. |
| Every release with breaking semantics | MUST keep the previous major lane alive and deprecation-marked until its `Sunset` passes, and MUST ship a parity test covering the change. |

### Changing the current version

1. Define `v2` router mount (`/api/v2`) in `createApp` alongside `v1`.
2. Update `API_VERSION` in the middleware when ready to promote `v2`.
3. Keep `v1` mounted as a **deprecated** alias with `Sunset`.
4. Update `frontend` `NEXT_PUBLIC_API_VERSION_PREFIX` and `docs/api-versioning.md`.
5. Add parity tests comparing the two versions for the changed surfaces.
6. Update the OpenAPI `servers`.

## Monitoring traffic share

Every request is logged with an `apiVersion` field (`request.logger.middleware.ts`):

- `"v1"` — versioned lane.
- `"/api/legacy"` — deprecated alias.
- `"unversioned"` — admin/health/infra.

This powers dashboards/alerting that track legacy vs v1 traffic share, so we can confirm
the sunset window has drained traffic before removing the alias. See `docs/dashboards.md`.

## OpenAPI

`backend/src/docs/openapi.yaml` lists both servers (versioned first, then the deprecated
legacy alias) and documents the versioning rules. Path definitions are shared across both
lanes.
