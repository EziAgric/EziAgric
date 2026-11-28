# Secret Rotation Runbook

This runbook covers rotating long-lived secrets used by the platform. Each
section documents a step-by-step procedure, the blast radius of the secret, and
how to verify the rotation succeeded.

> **Validate in staging first.** Every procedure below must be exercised in the
> staging environment before it is relied upon in production. Only promote a
> procedure to production once it has been completed end-to-end in staging
> without errors.

## Supabase service role key (90-day schedule)

The Supabase **service role key** is a long-lived secret with admin-level access
to the database. It bypasses Row Level Security and must be treated as a
production credential. Rotate it **every 90 days**, and immediately on any
suspected compromise.

A scheduled GitHub Actions workflow
(`.github/workflows/secrets-rotation-reminder.yml`) opens a reminder issue when
the key is due for rotation. Treat that issue as the trigger for this procedure.

### Prerequisites

- Access to the Supabase project dashboard (Settings → API).
- Permission to update secrets in the deployment platform (staging and
  production environments).
- Ability to trigger a redeploy/restart of the backend service.

### Procedure

1. **Generate the new key.** In the Supabase dashboard, open the project and go
to **Settings → API → Project API keys**. Create/rotate the `service_role` key
   and copy the new value. Do **not** commit it anywhere.
2. **Update staging secrets.** Store the new key in the staging secret store
   (e.g. `SUPABASE_SERVICE_ROLE_KEY`). Keep the old key valid for now so the
   dual-key acceptance window works.
3. **Deploy/restart staging.** Redeploy or restart the backend service so it
   picks up the new secret.
4. **Verify staging.** Confirm the backend can authenticate against Supabase
   (health checks pass, admin queries succeed, no auth errors in logs).
5. **Update production secrets.** Repeat steps 2–3 for the production
   environment using the same new key.
6. **Verify production.** Confirm health checks pass and that admin-level
   operations succeed with the new key.
7. **Revoke the old key.** Once both environments are confirmed healthy on the
   new key, revoke/disable the previous `service_role` key in the Supabase
   dashboard.
8. **Record the rotation.** Update the `lastRotated` date for the Supabase
   service role key in `backend/scripts/secrets-rotation-status.json` and close
   the reminder issue.

### Rollback

If verification fails after updating an environment, restore the previous key
value in that environment's secret store and redeploy. Do not revoke the old
key until all environments are confirmed healthy on the new key.
