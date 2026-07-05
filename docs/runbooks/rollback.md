# Rollback Procedures

How to roll back each deployable piece of Amana after a bad deploy. If the
bad deploy included a database migration, read
[database-migration.md](./database-migration.md) and
[migration-rollback-playbook.md](../migration-rollback-playbook.md) first -
rolling back application code while a migration is half-applied can make
things worse, not better.

## General principle: roll back code before data

Application rollbacks are fast and cheap; data rollbacks are slow and risky.
Always prefer:

1. Roll back the application (backend/frontend/contract) to the last known
   good version.
2. Only touch the database if the bad deploy already wrote bad data, or the
   migration itself is the problem.

## Backend rollback

Because there's no automated CD pipeline for production (see
[deployment.md](./deployment.md)), rollback is redeploying the previous
known-good build:

1. Identify the last good commit/build (the one deployed before the
   incident).
2. Rebuild and redeploy it following the same steps as
   [deployment.md](./deployment.md#backend-deployment), pointed at the
   *existing* database - do **not** re-run migrations as part of a
   rollback unless the migration itself is what you're rolling back (see
   below).
3. Verify with `GET /health/ready` and `GET /health/startup` before
   shifting traffic back.
4. If the bad deploy is still serving traffic and can't be replaced
   immediately, disable the specific broken feature via the feature-flag
   admin API instead of a full rollback where possible - see
   [admin.md](../api/admin.md#feature-flags). Setting `enabled: false` on
   the offending flag takes effect immediately, with no redeploy, and is
   almost always faster than a full rollback.

### Staging

```bash
docker compose --profile staging down -v --remove-orphans
git checkout <previous-good-commit>
./scripts/staging-up.sh --reset
```

`--reset` wipes the staging database/seed data so you get a clean re-seed
against the previous version - use this when the bad deploy corrupted
staging state, skip it if you just need the previous binary running against
existing data.

## Frontend rollback

Redeploy the previous build to your Next.js host (`frontend/`, `npm run
build && npm run start`, or the equivalent for your hosting platform).
Frontend rollback is independent of backend rollback - the two aren't
required to move in lockstep unless the incident is caused by an API
contract change between them (check [errors.md](../api/errors.md) and the
relevant endpoint doc under `docs/api/` for what changed).

## Contract rollback

Soroban contracts are **not trivially reversible** - once a contract holds
funds and state, there is no "undo" at the network level.

- If the bad deploy is a fresh contract with no funds/trades yet: redeploy
  the previous contract version at a new contract ID and update the
  backend's contract ID config. Nothing to migrate.
- If the bad deploy is an **upgrade** to an existing contract
  (`deploy-contract-local.sh --upgrade`, or the equivalent for a real
  network) and the new version has a bug: upgrade again with the previous
  known-good WASM. This works because Soroban upgrades replace the
  contract's executable while preserving its storage/state - it is not a
  fresh deploy, so in-flight trades are unaffected by the upgrade itself.
- If the bug already caused an incorrect on-chain state change (e.g. wrong
  fee applied, funds moved incorrectly): this is **not a rollback
  situation**, it's an incident - see [incident-response.md](./incident-response.md).
  Recovering funds/state requires a deliberate corrective transaction, not
  an automated rollback, and likely involves the admin/treasury flows in
  [admin.md](../api/admin.md).
- Run `scripts/check-contract-deployment-safety.sh` against the rollback
  target before deploying it, same as CI would for a forward deploy.

## Database rollback

See [database-migration.md](./database-migration.md) for the full decision
tree (revert-migration vs. restore-from-backup vs. rollback SQL file). In
short:

- Migration failed mid-run: Prisma auto-rolls-back the failed transaction;
  fix the SQL and retry, or mark it rolled back without reapplying
  (Scenario A in the playbook).
- Migration succeeded but broke the application: apply its companion
  `rollback.sql` via `migrate-rollback.sh` (Scenario B) - coordinate with
  on-call first in production, since this modifies the live schema.
- Catastrophic failure: restore from the pre-migration backup (Scenario C)
  - last resort, drops and recreates the database, and always requires the
  escalation defined in
  [migration-rollback-playbook.md §8](../migration-rollback-playbook.md#8-contacts-and-escalation).

## Post-rollback

1. Confirm the rolled-back version is healthy (same checks as
   [deployment.md](./deployment.md#post-deploy-verification)).
2. Leave the broken build/artifact available (don't delete it) so it can be
   inspected for the postmortem.
3. Open (or update) the incident record per
   [incident-response.md](./incident-response.md) - a rollback is a
   mitigation, not a resolution; root cause still needs to be found and
   fixed before re-attempting the deploy.
