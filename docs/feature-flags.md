# Feature flags

> **Status: partially documented.** The feature-flag code that the CI gate and
> several tests reference is not in this repository. This page records what the
> tree actually contains and what is still missing. It does not describe a
> storage model, a catalog contract, or add-a-flag steps, because those files
> are absent and documenting them would mean guessing.

## What exists in the tree

| Piece | Location | Notes |
| --- | --- | --- |
| Env gate `ADMIN_ROUTES_ENABLED` | `backend/.env.staging.example`, `backend/.env.production.example` (`true`); `.env.staging.example`, `docker-compose.yml` (`false`) | The only flag found by name. The OpenAPI spec says admin stream routes return `404` when it is off. No backend code in this tree reads it. |
| Admin endpoint (spec) | `backend/src/docs/openapi.yaml`, path `/api/admin/features` | Documents `GET` only. |
| Admin endpoint (client) | `mobile/src/api/admin.ts` | Calls `GET /admin/features` and `PATCH /admin/features/{name}`. See [the admin API page](./api/admin.md#feature-flags). |
| Mobile screen | `mobile/src/screens/AdminFeaturesScreen.tsx` | Lists flags and toggles them through the client above. |
| Frontend test | `frontend/src/components/admin/__tests__/FlagDebugPanel.test.tsx` | Imports a `FlagDebugPanel` component that does not exist in the tree. |
| CI job | `flag-catalog-drift` in `.github/workflows/ci.yml` | Runs `ts-node --skip-project scripts/check-flag-catalog-drift.ts`. That script is not in the tree, so the job will fail on module-not-found. This was read from the files, not run. |

## Missing from the tree

The following files are referenced but absent. Until they land, the flag
system cannot be documented from source:

- `backend/src/services/feature-flags.service.ts`
- `backend/src/routes/admin.features.routes.ts`
- `frontend/src/lib/featureFlags.ts`
- `scripts/check-flag-catalog-drift.ts`

Two open questions the eventual docs must answer:

1. **Path prefix.** The spec uses `/api/admin/features`. The mobile client uses
   `/admin/features`. One of them is wrong, or the base URLs differ. Check
   `mobile/src/api/client.ts` before relying on either.
2. **`PATCH` is undocumented.** The mobile client sends it, but the spec only
   has `GET`.

## Adding a flag

Not documented yet. The steps depend on the storage and catalog code listed
above, which is not in this tree. Once that code exists, this section should
cover the storage model, the catalog contract, and the drift check.
