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
    code?: string;         // error code from AppError
    details?: Record<string, unknown>;
  };
  timestamp: string;       // ISO 8601
}
```

## Consuming Events

```typescript
import { adminNotificationService, AdminNotificationEvents } from "./adminNotification.service";

adminNotificationService.onSuccess(AdminNotificationEvents.STREAM_LOCKED, (payload) => {
  // Push to WebSocket, queue, etc.
});

adminNotificationService.onFailure(AdminNotificationEvents.OPERATION_FAILED, (payload) => {
  alertService.dispatch("admin_operation_failure", payload.error.message, payload);
});
```

## Default Listener

The service registers one default listener per event that writes a structured
log entry via `appLogger.info` (success) or `appLogger.error` (failure).

## Covered Endpoints

| Endpoint                                          | Action                  | Notification                  |
| ------------------------------------------------- | ----------------------- | ----------------------------- |
| `POST /api/admin/streams/:id/lock`                | Maintenance lock        | `admin:stream:locked`         |
| `POST /api/admin/streams/:id/unlock`              | Maintenance unlock      | `admin:stream:unlocked`       |
| `POST /api/admin/streams/:id/terminate`           | Admin clawback          | `admin:stream:terminated`     |
