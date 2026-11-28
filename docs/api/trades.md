# Trade Endpoints

All trade endpoints require `Authorization: Bearer <token>` unless stated
otherwise.

## Watchlist

Users can bookmark trades they are a party to (buyer or seller) for quick
access. All watchlist endpoints require a bearer token and are **not**
available to admins: only the buyer or seller of a trade may watch or unwatch
it.

### Watch a trade

`POST /trades/:id/watch`

Idempotent: watching a trade that is already on the list succeeds without
creating a duplicate. Body is ignored.

**Response `201`**

```json
{
  "watch": {
    "id": 42,
    "userAddress": "gaaa...whf",
    "tradeId": "4294967297",
    "createdAt": "2026-07-05T12:00:00.000Z"
  }
}
```

`userAddress` is stored lowercased.

| Status | Meaning |
|---|---|
| `401` | Missing/invalid token: `{ "error": "Unauthorized" }` |
| `403` | Caller is neither buyer nor seller: `{ "error": "Forbidden" }` |
| `404` | Trade does not exist: `{ "error": "Trade not found" }` |

### Unwatch a trade

`DELETE /trades/:id/watch`

Removes the caller's bookmark. Access checks are the same as for watching, so
a `403`/`404` is returned even when no bookmark exists.

**Response `200`**

```json
{ "removed": true }
```

`removed` is `false` when the trade was not on the caller's watchlist. The
call still succeeds.

| Status | Meaning |
|---|---|
| `401` | Missing/invalid token |
| `403` | Caller is neither buyer nor seller |
| `404` | Trade does not exist |

### List watched trades

`GET /trades/watched`

Returns the caller's watched trades, most recently watched first. Each item
is a trade object plus `watchedAt`, the time the trade was added to the
watchlist. There is no pagination yet; the full list is returned.

**Response `200`**

```json
{
  "items": [
    {
      "tradeId": "4294967297",
      "buyerAddress": "GAAA...WHF",
      "sellerAddress": "GBBB...C4",
      "amountUsdc": "125.1234567",
      "status": "FUNDED",
      "watchedAt": "2026-07-05T12:00:00.000Z"
    }
  ]
}
```

| Status | Meaning |
|---|---|
| `401` | Missing/invalid token |
