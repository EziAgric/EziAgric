# Admin Route Rate Limiting

## Overview

All admin endpoints are protected with rate limiting to prevent abuse and ensure system stability.

## Configuration

### Default Limits

- Window: 60 seconds (1 minute)
- Max requests: 100 per window
- Message: "Too many admin requests, try again later."

### Covered Endpoints

The following admin routes are rate-limited:

1. **Admin Auth**
   - `GET /api/admin/auth/claims`

2. **Admin Audit**
   - `GET /admin/audit`

3. **Admin Contract**
   - `POST /admin/contract/mediators`
   - `DELETE /admin/contract/mediators/:address`
   - `PATCH /admin/contract/fee`

4. **Admin Features**
   - `GET /admin/features`
   - `PATCH /admin/features/:name`

5. **Admin Trades Batch**
   - `POST /admin/trades/batch/status`

6. **Admin Streams** (New)
   - `POST /api/admin/streams/:id/clawback/preview`
   - `POST /api/admin/streams/:id/suspend`
   - `POST /api/admin/streams/:id/resume`

## Rate Limit Behavior

### Identification

Rate limits are tracked per wallet address. If the request contains authenticated user credentials, the limit applies to that wallet address. This ensures fair usage across different admin accounts.

### Response on Limit Exceeded

When rate limit is exceeded, the API returns:

- **Status Code**: `429 Too Many Requests`
- **Headers**: `Retry-After` (seconds until window resets)
- **Body**:
  ```json
  {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many admin requests, try again later.",
    "details": {
      "retryAfterSeconds": 45,
      "limit": 100,
      "windowMs": 60000
    },
    "timestamp": "2026-07-29T10:30:00.000Z",
    "path": "/admin/features"
  }
  ```

## Override Configuration

To customize rate limits, modify `backend/src/config/rateLimit.ts`:

```typescript
export const RATE_LIMIT_CONFIG = {
  // ... other limits
  admin: {
    windowMs: 60000, // Change window duration
    max: 100, // Change max requests
    message: "Custom message",
  },
};
```

## Testing Rate Limits

Rate limits can be tested by making rapid consecutive requests to any admin endpoint. After 100 requests within a minute, subsequent requests will receive 429 responses.

## Notes

- Rate limits are per-wallet, not per-IP
- Limits reset after the window duration expires
- The limit counter is shared across all admin endpoints
- In-memory tracking is used; limits reset on server restart
