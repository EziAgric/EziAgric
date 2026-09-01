# Fail-fast Environment Validation

The backend validates its environment strictly and **at boot**, before `listen()`.
A partially- or mis-configured process **never starts serving** — it prints an
actionable, aggregated report and exits with a non-zero code.

This addresses the failure mode where a deploy looked healthy but failed lazily
on first use (e.g. a bad Pinata key discovered mid-trade, or an unreachable
tracing backend discovered during an incident).

## How it works

`backend/src/config/env.ts` holds a single zod schema (`envSchema`) that is
loaded once and parsed strictly. On any invalid input:

1. **All** invalid variables are reported — not just the first error.
   `envSchema.safeParse` collects every issue; env-specific rules are appended.
2. **Secret-shaped values are redacted** from every diagnostic (`***REDACTED***`
   or `(empty)`), so no token, key, or signing secret can leak into logs or
   error messages.
3. The process prints a multi-line report to stderr and exits `1` — `listen()`
   is never reached.

### Boot report example

```
[FATAL] Environment validation failed for NODE_ENV="production" with 3 issue(s):
  - JWT_SECRET: String must contain at least 32 character(s) (present value: ***REDACTED***)
  - ADMIN_SECRET_KEY: Required (present value: (empty))
  - JAEGER_ENDPOINT: NODE_ENV=production requires a tracing backend ...
     (present value: (empty))

Fix the variables above and restart. Secrets are redacted.
```

## Environment-specific rules

`getEnvSpecificIssues` applies rules beyond the shared schema:

- **`NODE_ENV=production`** requires a tracing backend (`JAEGER_ENDPOINT`,
  `ZIPKIN_ENDPOINT`, or an OTEL exporter). Without it the pod would silently
  drop traces during an incident, so boot fails fast instead.

`collectEnvIssues(input)` runs both schema validation and env-specific rules and
returns the full, ordered issue list.

## Effective-config fingerprint

On boot the app logs a **sanitized effective-config fingerprint** (via
`formatConfigFingerprint`). Non-secret values appear literally; secret values
are shown as a fixed `***REDACTED***` marker so operators can confirm which
secrets are present without ever exposing them. Only schema keys are emitted.

```
{"effectiveConfig":{"PORT":"4000","JWT_SECRET":"***REDACTED***","ADMIN_SECRET_KEY":"***REDACTED***",...}}
```

## Exported helpers

| Helper | Purpose |
|---|---|
| `envSchema` | The zod schema (single source of truth) |
| `collectEnvIssues(input)` | All schema + env-specific issues, values redacted |
| `assertValidEnv(input)` | Throws `EnvironmentValidationError` on any issue |
| `EnvironmentValidationError` | Carries `issues[]` and `envName` |
| `SECRET_ENV_KEYS` | Set of secret-key names |
| `redactEnvValue(key, value)` | Redact a raw value if it is a secret |
| `formatConfigFingerprint(input)` | Sanitized effective-config map |
| `getEnvSpecificIssues(input)` | Env-specific rule violations |
| `formatEnvReport(issues)` | Multi-line redacted report string |

## Development workflow

`npm run dev` (via `tsx`) validates env before startup, so a misconfigured
`.env` fails loudly and immediately rather than mid-request.

## CI validation

Example env files (`backend/.env.example`, `.env.staging.example`,
`.env.production.example`) are validated against the schema in CI so they cannot
drift from the runtime types:

- No unknown / misspelled keys.
- Every required (no-default) schema key is documented.
- Non-secret values with a concrete value are well-formed (typed checks).
- The production example satisfies the production tracing requirement.

Run locally with:

```
cd backend
pnpm tsx scripts/validate-env-examples.ts
```
