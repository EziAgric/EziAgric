# Cursor Pagination

## Overview

High-volume list endpoints (audit log, webhook delivery logs, and future
migrations) are moving from offset pagination (`page`/`limit`) to
**cursor-based pagination**. Offset pagination gets slow on deep pages and
can silently duplicate or drop rows when the underlying table is written to
between page fetches — a real problem for tables like `AdminActionAudit` and
`WebhookDeliveryAttempt` that are appended to continuously.

Cursor pagination anchors each page to the last row actually returned
(via Prisma's `cursor`/`skip: 1`) instead of a numeric offset, so results
stay stable under concurrent inserts.

Shared implementation: [`src/lib/cursorPagination.ts`](../src/lib/cursorPagination.ts).

## Using the new API

```
GET /api/admin/audit?limit=20
GET /api/admin/audit?limit=20&cursor=<opaque-token-from-previous-response>
```

Response shape:

```json
{
  "items": [ ... ],
  "pageInfo": {
    "nextCursor": "eyJpZCI6NDJ9",
    "hasNextPage": true,
    "limit": 20
  }
}
```

`cursor` is an opaque, base64url-encoded token — do not parse or construct it
client-side. Treat it as a bookmark and pass it back verbatim to fetch the
next page. There is no `prevCursor`/backward pagination in this first pass;
endpoints that need it (e.g. an interactive table with a "previous" button)
should re-request from the start with a stored trail of cursors, or wait for
a future backward-cursor addition.

## Backward compatibility

Existing clients that still send `page`/`limit` continue to work exactly as
before — the endpoint falls back to offset pagination and responds with the
legacy `pagination: { page, limit, total, totalPages }` envelope. These
requests also get a `Warning: 299 - "page/limit offset pagination is
deprecated; use cursor/pageInfo.nextCursor instead"` response header.

This compatibility path is meant to be temporary. Once dependent clients
(frontend, mobile, third-party API consumers) have migrated to `cursor`, the
`page` handling and `pagination` field should be removed from these
endpoints.

## Migrated endpoints

- `GET /api/admin/audit` ([adminAudit.service.ts](../src/services/adminAudit.service.ts))
- `GET /webhooks/:id/logs` ([webhooks.logs.routes.ts](../src/routes/webhooks.logs.routes.ts))
- `GET /listings` ([listings.routes.ts](../src/routes/listings.routes.ts)) —
  supports `commodity`, `region`, `minPrice`, `maxPrice`, and `minQuantity`
  filters (combined with AND semantics) alongside `cursor`/`limit`.
- `GET /regions` ([regions.ts](../src/routes/regions.ts)) — supports `state`
  filter alongside `cursor`/`limit`. Never had offset pagination, so no `page`
  fallback is needed.
- `GET /trades` ([trades.ts](../src/routes/trades.ts),
  [tradeService.ts](../src/services/tradeService.ts)) — supports
  `cursor`/`limit` with a `created_at + id` composite cursor. The watchlist
  prioritization is preserved by ordering on a persisted effective sort key
  (watchlisted trades first, then `created_at desc, id desc`), so the cursor
  remains a stable, single-query anchor. Legacy `page`/`offset` params still
  work and emit the deprecation `Warning` header.

## Adding cursor pagination to a new endpoint

1. Ensure the underlying model has a unique, indexed `id` (or add one).
2. Order by `[<sortField>, { id: "desc" }]` — the trailing `id` tiebreaker
   keeps ordering deterministic when the primary sort field has duplicates.
3. Call `paginateWithCursor({ findMany, orderBy, cursor, limit })`.
4. If the endpoint has existing offset-pagination clients, keep a `page`
   fallback branch (see `adminAudit.service.ts` for the pattern) and set the
   deprecation `Warning` header from `CURSOR_DEPRECATION_WARNING`.
