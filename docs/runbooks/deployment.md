# Deployment Runbook

Step-by-step deploy process for the three deployable pieces of Amana:
backend, frontend, and the Soroban escrow contract. Companion docs:
[docker-profiles.md](../docker-profiles.md) (environment topology),
[migration-rollback-playbook.md](../migration-rollback-playbook.md)
(migrations in depth - see also [database-migration.md](./database-migration.md)),
and [contract-deployment-local-network.md](../contract-deployment-local-network.md).

## Environments

| Environment | Infra | How it's deployed |
|---|---|---|
| `dev` | Local Docker (`docker-compose.yml` `dev` profile) | `./scripts/dev-up.sh` |
| `staging` | Docker Compose `staging` profile, seeded synthetic data | `./scripts/staging-up.sh`, also runs automatically via `.github/workflows/staging.yml` on push to `develop` |
| `production` | Externally managed cloud infra (managed Postgres, managed Redis) - see [docker-profiles.md](../docker-profiles.md#production-notes) | Manual, following this runbook (no CD pipeline exists yet) |

There is currently no automated production deploy workflow - production
release is a manual, checklist-driven process. If you're setting one up,
this runbook is the source of truth for what it needs to do.

## Pre-deploy checklist

Before deploying to staging or production:

1. CI is green on the commit you're deploying (`.github/workflows/ci.yml`).
2. Risky changes are behind a feature flag defaulted to off (see
   [admin.md](../api/admin.md#feature-flags)) rather than deployed live.
3. Confirm whether this deploy includes a Prisma migration. If so, read
   [database-migration.md](./database-migration.md) fully before continuing
   - migrations are the highest-risk part of any deploy.
4. Take a fresh backup if deploying to production (see
   [database-migration.md](./database-migration.md#backups)).

## Backend deployment

The backend is an Express app under `backend/`, backed by Postgres (via
Prisma) and Redis.

### Staging

```bash
cp .env.staging.example .env.staging   # first time only; fill in secrets
./scripts/staging-up.sh
```

`staging-up.sh` starts the `staging` Docker Compose profile, waits for
Postgres/Redis health checks, applies pending migrations via
`migrate-safe.sh --env=staging`, seeds synthetic data, and (unless
`--skip-validate` is passed) runs `staging-validate.sh` to smoke-test the
deployment. This is the same sequence `.github/workflows/staging.yml` runs
on every push to `develop`.

Tear down with:

```bash
docker compose --profile staging down -v --remove-orphans
```

### Production

1. Build the backend:
   ```bash
   cd backend
   npm ci
   npx prisma generate
   npm run build   # emits dist/
   ```
2. Apply migrations first, separately from the app deploy:
   ```bash
   ./scripts/migrate-safe.sh --env=production
   ```
   See [database-migration.md](./database-migration.md) - this step alone
   has its own pre-flight checks, backup, and confirmation gate for
   destructive DDL.
3. Roll out `dist/` to the production environment (behind whatever process
   manager/orchestrator the target infra uses) with the production `.env`
   populated per `backend/src/config/env.ts` (JWT secrets, `DATABASE_URL`,
   `REDIS_URL`, `ADMIN_STELLAR_PUBKEYS`, `STELLAR_NETWORK=mainnet`, etc.).
4. Confirm the new instance is healthy before routing traffic to it:
   ```bash
   curl https://<host>/health/ready
   curl https://<host>/health/startup
   ```
   Both should return `200`. `health.detail.routes.ts` also exposes deeper
   dependency checks (DB, Redis) under `/health` - see
   [trades.md](../api/trades.md) and [overview.md](../api/overview.md) for
   general API conventions if you're scripting this check.
5. Only after the new instance passes health checks, shift traffic to it
   and stop the old instance (keep it stoppable-but-not-deleted for a
   rollback window - see [rollback.md](./rollback.md)).

## Frontend deployment

The frontend is a Next.js app under `frontend/`.

```bash
cd frontend
npm ci
npm run build   # next build
npm run start   # next start, or hand dist output to your Next.js host
```

There's no Vercel/Netlify config checked into the repo today - deploy
`frontend/` to whatever Node host or static/edge platform your environment
uses, pointing its API base URL env var at the backend for that
environment (staging backend for a staging frontend deploy, etc.).

## Contract deployment

The Soroban escrow contract lives in `contracts/amana_escrow`.

- **Local network**: fully scripted and documented -
  `./scripts/deploy-contract-local.sh --network standalone --admin <pubkey> --token-contract <id> --treasury <pubkey>`.
  See [contract-deployment-local-network.md](../contract-deployment-local-network.md)
  for the full flow, including `--upgrade` for redeploying to an existing
  contract ID. `scripts/check-contract-deployment-safety.sh` runs as a
  separate CI check (`.github/workflows/ci.yml`) against the contract
  source, not from inside the deploy script itself - it's worth running
  manually before a deploy too, since a CI failure after you've already
  deployed is too late.
- **Testnet/mainnet**: not yet scripted. Use the same parameters and
  `soroban-cli`/`stellar-cli` flow as the local script, pointed at the
  target network's RPC and passphrase (`STELLAR_NETWORK_PASSPHRASE` in
  `backend/src/config/env.ts` shows the values the backend expects to
  match). Run `check-contract-deployment-safety.sh` against the contract
  source before deploying to a real network, the same check CI runs on
  every PR.
- After deploying/upgrading a contract, update the backend's contract ID
  configuration (`treasury.routes.ts` / `stellar.service.ts` consumers read
  it from environment) and verify with:
  ```bash
  curl "https://<backend-host>/contract/<contractId>/state?tradeId=<known-trade-id>"
  ```
  (see [stellar.md](../api/stellar.md#contract-state)).

## Post-deploy verification

1. `GET /health/ready` and `GET /health/startup` return `200`.
2. Run (or confirm CI already ran) `staging-validate.sh`-equivalent smoke
   checks for the environment you deployed to.
3. Spot-check one read endpoint (`GET /trades/stats` with a known test
   token) and, for a backend deploy, one write endpoint in a non-production
   environment before trusting the same code path in production.
4. Watch error rates/logs for the deployed service for at least one full
   request-rate cycle before declaring the deploy complete.

If any of the above fails, go to [rollback.md](./rollback.md) rather than
attempting a forward fix under pressure.
