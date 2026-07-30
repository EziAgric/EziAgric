# Admin operations

Reference for the protected `/admin` routes: how a request is authorised, how it
is traced end to end, and how clients should call it.

## Routes

| Method   | Path                              | Effect                                  |
| -------- | --------------------------------- | --------------------------------------- |
| `POST`   | `/admin/contract/mediators`       | Build an unsigned `add_mediator` XDR    |
| `DELETE` | `/admin/contract/mediators/:addr` | Build an unsigned `remove_mediator` XDR |
| `PATCH`  | `/admin/contract/fee`             | Build an unsigned `update_fee_bps` XDR  |
| `POST`   | `/admin/trades/batch/status`      | Batch trade status transitions          |
| `GET`    | `/admin/features`                 | List feature flags                      |
| `PATCH`  | `/admin/features/:name`           | Update a feature flag                   |
| `GET`    | `/admin/audit`                    | Paginated admin audit log               |
| `GET`    | `/api/admin/auth/claims`          | Echo the parsed JWT claims              |

Every route runs `authMiddleware` then `adminMiddleware`. An unauthenticated
call gets `401`; an authenticated wallet that is not in `ADMIN_STELLAR_PUBKEYS`
gets `403` with `{ "error": "Forbidden: admin access required" }`. The
allowlist is never echoed in the response.

The contract routes return an **unsigned XDR**. The backend never holds admin
keys — the caller signs and submits.

## Traceability

Every admin action carries two IDs, attached by `correlationIdMiddleware`:

| Header             | Meaning                                        | Caller-supplied? |
| ------------------ | ---------------------------------------------- | ---------------- |
| `x-correlation-id` | Logical trace spanning services; reused on hop | Yes, if valid    |
| `x-request-id`     | This HTTP request/response pair                | No, never        |

A caller-supplied correlation ID is accepted only if it is 1–128 characters of
`[A-Za-z0-9_-]`. Anything else is replaced with a generated UUID, so a malicious
value cannot be reflected into logs or response headers. The request ID is
always server-generated.

### How far the IDs travel

```
inbound request
  → correlationIdMiddleware       attaches req.correlationId / req.requestId
  → admin route handler           traceContextFrom(req) → TraceContext
  → ContractService.build*Tx      logged as admin_soroban_call
  → Soroban RPC                   simulate + prepare for the returned XDR
```

Route handlers call `traceContextFrom(req)` and pass the result as `trace` on
the service input. `ContractService` logs each admin contract call as
`admin_soroban_call` with `correlationId`, `requestId`, `contractFunction`,
`contractId` and the call arguments, so one admin action can be followed from
the HTTP access log through to the contract invocation it produced.

`TraceContext` fields are optional, so the same service methods stay callable
from jobs, scripts and tests that have no HTTP request behind them.

### Finding an action in the logs

Responses always echo both IDs as headers, including on `400` and `403`. Errors
that pass through `errorHandler` also carry them in the body:

```json
{
  "code": "INTERNAL_ERROR",
  "message": "...",
  "path": "/admin/contract/fee",
  "correlationId": "9f2c...",
  "requestId": "1a4e..."
}
```

Take either ID from the response and search the structured logs:

```bash
grep '"requestId":"1a4e..."' backend.log | jq .
```

That returns the request log line and the `admin_soroban_call` entry for the
same action. Use `correlationId` instead to follow a trace that spans more than
one service.

Validation failures rejected by `validateRequest` return `{ "error": "..." }`
without the IDs in the body; read them from the response headers instead.

## Calling admin routes from a client

Do not hand-roll `fetch` against `/admin`. Use the guarded helpers in
`frontend/src/lib/api/admin.ts`, which enforce the token, map failures to a
named reason, and forward the correlation ID.

```ts
import { adminApi, AdminApiError } from "@/lib/api/admin";

async function promoteMediator(token: string, mediatorAddress: string) {
  try {
    const { unsignedXdr } = await adminApi.contract.addMediator(
      token,
      { mediatorAddress },
      { correlationId: crypto.randomUUID() },
    );
    return await signAndSubmit(unsignedXdr);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;

    switch (error.reason) {
      case "unauthenticated":
        return redirectToLogin();
      case "forbidden":
        return showBanner("This wallet is not a configured admin.");
      case "validation":
        return showFieldError(error.message);
      case "rate_limited":
        return showBanner("Admin quota exceeded, try again shortly.");
      default:
        return showBanner(`Admin action failed (ref ${error.correlationId ?? "n/a"}).`);
    }
  }
}
```

`AdminApiError.reason` is one of `unauthenticated`, `forbidden`, `validation`,
`not_found`, `conflict`, `rate_limited`, `server`, `network`, so UI code
branches on the failure mode rather than on raw status codes.

Two guarantees worth relying on:

- An empty or whitespace-only token throws `unauthenticated` **before** any
  network call, rather than sending an anonymous request.
- Identifiers interpolated into a path are URL-encoded.

For an endpoint not yet wrapped, use `adminRequest` directly rather than
`request` — it applies the same guard:

```ts
import { adminRequest } from "@/lib/api/admin";

const result = await adminRequest<MyResponse>("/admin/new-endpoint", token, {
  method: "POST",
  body: JSON.stringify(payload),
});
```

## Tests

| File                                                    | Covers                                       |
| ------------------------------------------------------- | -------------------------------------------- |
| `backend/src/__tests__/admin.routes.validation.harness.test.ts` | Auth and validation failure modes |
| `backend/src/__tests__/admin.correlationId.test.ts`      | ID generation and propagation to services    |
| `frontend/src/lib/api/__tests__/admin.test.ts`           | Token guard, endpoints, error mapping        |

The backend harness isolates each route behind mocked services, so a failure
points at the route's guards rather than at Prisma or Soroban RPC.
