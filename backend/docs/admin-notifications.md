# Admin Notifications (#36)

## Overview

Admin operations (clawback/termination, maintenance lock/unlock) emit structured
events through `AdminNotificationService`. This provides an internal event
publisher that services and tests can consume — currently backed by an
in-process `EventEmitter` with a structured-logger subscriber, and designed so
future sinks (BullMQ queues, WebSocket broadcast, external webhooks) can be
added without changing the producer sites.

## Event Types

### Success Events

| Event                        | Fires When               | Emitted From                          |
| ---------------------------- | ------------------------ | ------------------------------------- |
| `admin:stream:locked`        | Stream locked            | `StreamLockService.lock()`            |
| `admin:stream:unlocked`      | Stream unlocked          | `StreamLockService.unlock()`          |
| `admin:stream:terminated`    | Stream terminated        | `StreamTerminationService.terminate()`|

### Failure Event

| Event                       | Fires When                              | Emitted From                          |
| --------------------------- | --------------------------------------- | ------------------------------------- |
| `admin:operation:failed`    | Any admin operation throws an error     | `StreamLockService`, `StreamTerminationService` catch blocks |

## Payloads

### Stream Maintenance Events

```typescript
// StreamLockedPayload / StreamUnlockedPayload
{
  streamId: string;
  adminAddress: string;
  reason: string | null;
  timestamp: string; // ISO 8601
}
```

### Stream Terminated Payload

```typescript
{
  streamId: string;
  adminAddress: string;
  reason: string | null;
  previousStatus: string;  // e.g. "ACTIVE", "SUSPENDED"
  terminatedAt: string;    // ISO 8601
  unclaimed: string;       // remaining unclaimed amount
}
```

### Operation Failed Payload

```typescript
{
  streamId: string;
  adminAddress: string;
  action: string;          // e.g. "STREAM_LOCK", "STREAM_UNLOCK", "STREAM_TERMINATE"
  error: {
    message: string;
    code?: string;         // error code from AppError (e.g. "NOT_FOUND", "DOMAIN_ERROR")
    details?: Record<string, unknown>;  // extra context from the error
  };
  timestamp: string;       // ISO 8601
}
```

## Consuming Events

### In Tests

```typescript
import { adminNotificationService, AdminNotificationEvents } from "../services/adminNotification.service";

// Attach a listener before the action
const listener = jest.fn();
adminNotificationService.onSuccess(AdminNotificationEvents.STREAM_LOCKED, listener);

// Perform the action
await lockService.lock({ streamId: "s1", adminAddress: "GA", reason: "test" });

// Assert
expect(listener).toHaveBeenCalledWith({
  streamId: "s1",
  adminAddress: "GA",
  reason: "test",
  timestamp: expect.any(String),
});
```

### In Application Code (future sinks)

```typescript
import { adminNotificationService, AdminNotificationEvents } from "./adminNotification.service";

adminNotificationService.onSuccess(AdminNotificationEvents.STREAM_LOCKED, (payload) => {
  // Push to WebSocket, write to a separate notification queue, etc.
  myWebSocketServer.broadcast("admin.stream.locked", payload);
});

adminNotificationService.onFailure(AdminNotificationEvents.OPERATION_FAILED, (payload) => {
  alertService.dispatch("admin_operation_failure", payload.error.message, payload);
});
```

## Default Listener

The service registers one default listener per event that writes a structured
log entry via `appLogger.info` (success) or `appLogger.error` (failure).
This ensures every admin action is at least visible in the application logs
without any additional configuration.

## Covered Endpoints

| Endpoint                                          | Action                  | Notification                  |
| ------------------------------------------------- | ----------------------- | ----------------------------- |
| `POST /api/admin/streams/:id/lock`                | Maintenance lock        | `admin:stream:locked`         |
| `POST /api/admin/streams/:id/unlock`              | Maintenance unlock      | `admin:stream:unlocked`       |
| `POST /api/admin/streams/:id/terminate`           | Admin clawback          | `admin:stream:terminated`     |

## Idempotent Operations

Idempotent re-lock / re-unlock calls (stream is already in the requested state)
do **not** emit success notifications — only actual state changes trigger them.
Failure notifications are emitted for all error paths, including validation
errors (stream not found, wrong state) and unexpected exceptions.
