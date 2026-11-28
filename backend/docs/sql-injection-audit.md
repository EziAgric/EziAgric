# SQL Injection Audit — Backend Data Access

Audit of raw and Supabase query paths in `backend/src` and `backend/prisma` (issue #985).

## Findings

| Area | Finding | Action |
|------|---------|--------|
| Supabase RPC (`supabase.rpc(...)`) | No call sites. `@supabase/supabase-js` is declared in `backend/package.json` but nothing in `backend/src` imports it. | None. Remove the dependency in a follow-up once confirmed unused. |
| Supabase query builder (`.from(...)`, `.eq(...)`, `.filter(...)`) | No call sites in backend, frontend, mobile or contracts. | None. |
| Prisma raw queries (`$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`) | No call sites in `backend/src`, `backend/scripts`. | None. |
| `backend/prisma/seed.anonymized.ts` (`$queryRaw` at lines 135–137) | Tagged-template queries with no `${}` interpolation. All values are literal SQL; the parameterised tagged-template form is already used. | None. Justification: static SQL, no runtime input. |

Primary data access in `backend/src/services` goes through Prisma's typed client (`jobHeartbeat.service.ts`, `jobUptime.ts`), so user input reaches the database as bound parameters.

## Conventions to keep

- Use Prisma's typed client for all data access.
- If raw SQL is ever needed, use the tagged-template form (`$queryRaw\`...\``) so values are bound. Do not use `$queryRawUnsafe` / `$executeRawUnsafe` or `Prisma.raw` with request input.
- Any new `supabase.rpc(...)` call must pass arguments as an object, never by concatenating strings into an RPC name or filter string.

## Re-check

Run this before adding new data access:

```sh
grep -rn --exclude-dir=node_modules -E 'queryRawUnsafe|executeRawUnsafe|Prisma\.raw|\.rpc\(|supabase' backend/src backend/scripts
```

Any hit needs a review against the conventions above.
