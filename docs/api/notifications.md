# Notifications API

Covers the in-app notification inbox and the per-user notification preferences.
Auth, base URL, and error envelope conventions are in [overview.md](./overview.md)
and [errors.md](./errors.md). Every endpoint below requires a bearer token.

Source: `backend/src/routes/notifications.inapp.routes.ts` (inbox) and
`backend/src/routes/notifications.preferences.routes.ts` (preferences), mounted at
the root by `backend/src/routes/publicApi.router.ts`.

## How notifications are created

Notifications are enqueued as jobs on the `notifications` queue with a `type` of
`in_app`, `email`, or `push`. The worker (`backend/src/jobs/workers/notification.worker.ts`)
behaves as follows:

- `in_app`: writes an `InAppNotification` row for the target wallet. This is the
  only path that produces data visible through this API.
- `email` / `push`: logged only. No provider is wired up, so nothing is delivered.

**Preferences are stored but not enforced.** The worker does not read
`NotificationPreference` before writing an in-app row. Saving a preference changes
what the API returns, not what gets delivered.

## Read/unread model

Each `InAppNotification` has a single boolean, `isRead`, which defaults to `false`.

- Marking as read is one-way. No endpoint sets `isRead` back to `false`.
- `unreadCount` in the list response counts all of the caller's unread
  notifications. It ignores the `type` and `unreadOnly` filters.
- Notifications are ordered by `createdAt` descending.

## Inbox endpoints

### `GET /notifications`

Query parameters:

| Parameter | Default | Notes |
|---|---|---|
| `unreadOnly` | `false` | See the caveat below. Send `unreadOnly=true` to filter, or omit it. |
| `type` | none | Exact match on the stored `type`. The worker currently stores `in_app`. |
| `page` | `1` | 1-indexed. |
| `limit` | `20` | Max `100`. |

**Caveat:** `unreadOnly` is parsed with `z.coerce.boolean()`, so any non-empty
string is `true`, including `"false"`. Do not send `unreadOnly=false` expecting
unfiltered results.

Response `200`:

```json
{
  "notifications": [
    {
      "id": 42,
      "title": "Trade funded",
      "message": "Your trade has been funded.",
      "type": "in_app",
      "isRead": false,
      "metadata": { "tradeId": "trade_123" },
      "createdAt": "2026-07-05T12:00:00.000Z",
      "deepLink": "/trades/trade_123"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "unreadCount": 1
}
```

- `deepLink` is `/trades/<id>` when `metadata.tradeId` or `metadata.trade_id` is
  present and non-empty. Otherwise it is `null`.
- The items are returned under `notifications`, not `items`. The pagination object
  here is `pagination`, which differs from the generic convention in
  [overview.md](./overview.md#pagination).

### `PATCH /notifications/:id/read`

`:id` must be a numeric string. Marks one notification as read.

| Status | Body | When |
|---|---|---|
| `200` | `{ "message": "Notification marked as read" }` | Marked now. |
| `200` | `{ "message": "Notification already marked as read" }` | Already read. No write. |
| `400` | Validation error | `:id` is not numeric. |
| `403` | `{ "error": "Forbidden: you do not own this notification" }` | Belongs to another wallet. |
| `404` | `{ "error": "Notification not found" }` | No such ID. |

The `403` and `404` bodies use the legacy `error` envelope.

### `POST /notifications/read-all`

Marks every unread notification for the caller as read. No body.

Response `200`:

```json
{ "message": "All notifications marked as read", "count": 3 }
```

`count` is the number of rows that changed. It is `0` if nothing was unread.

## Preference endpoints

Preferences are a map from a free-form event key to the channels that should be
used for it, plus a locale.

- **Channels:** `email`, `push`, `in-app`. Up to 3 per key. Note the hyphen:
  `in-app` here, versus `in_app` as the notification `type` above.
- **Locales:** `en` (default), `ha`, `yo`, `ig`, `pcm`. An unsupported or missing
  stored locale falls back to `en`.
- **Event keys:** the server does not validate key names and defines no default
  keys. Any non-empty string is accepted.
- **Defaults:** a user with no saved record gets `preferences: {}` (no channels set
  for any event) and `locale: "en"`. Per-event defaults, if any, live in the client.

### `GET /notifications/preferences`

Response `200`:

```json
{
  "preferences": { "trade_funded": ["email", "in-app"] },
  "locale": "en"
}
```

### `PUT /notifications/preferences`

Body (both fields optional):

```json
{
  "preferences": { "trade_funded": ["email", "in-app"] },
  "locale": "ha"
}
```

Merge behaviour:

- Each key in `preferences` replaces the stored channel list for that key.
  Keys you omit are kept unchanged. The write is a shallow merge per key, not a
  replacement of the whole object.
- If `locale` is omitted, the stored locale is kept.

Response `200` returns the saved `preferences` and `locale`, in the same shape as
the GET response.

A body that fails validation (unknown channel, unsupported locale, more than 3
channels for a key) returns `400` with a `VALIDATION_ERROR` envelope from
[errors.md](./errors.md).

## Known gaps

- Preferences are not applied to delivery (see above).
- The web settings page (`frontend/src/app/settings/notification-preferences.tsx`)
  calls `/api/users/me/notification-preferences`, which is not one of the routes
  documented here. It also offers an `sms` channel that these routes reject.
  Treat that page as out of sync with this API until it is updated.
