import { EventEmitter } from "events";
import { appLogger } from "../middleware/logger";

export const AdminNotificationEvents = {
  STREAM_LOCKED: "admin:stream:locked",
  STREAM_UNLOCKED: "admin:stream:unlocked",
  STREAM_TERMINATED: "admin:stream:terminated",
  OPERATION_FAILED: "admin:operation:failed",
} as const;

export interface StreamLockedPayload {
  streamId: string;
  adminAddress: string;
  reason: string | null;
  timestamp: string;
}

export interface StreamUnlockedPayload {
  streamId: string;
  adminAddress: string;
  reason: string | null;
  timestamp: string;
}

export interface StreamTerminatedPayload {
  streamId: string;
  adminAddress: string;
  reason: string | null;
  previousStatus: string;
  terminatedAt: string;
  unclaimed: string;
}

export interface OperationFailedPayload {
  streamId: string;
  adminAddress: string;
  action: string;
  error: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

export function extractErrorInfo(error: unknown): { message: string; code?: string; details?: Record<string, unknown> } {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    return {
      message: typeof err.message === "string" ? err.message : String(error),
      code: typeof err.code === "string" ? err.code : undefined,
      details: err.details && typeof err.details === "object" ? (err.details as Record<string, unknown>) : undefined,
    };
  }
  return { message: String(error) };
}

export class AdminNotificationService {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.registerDefaultListeners();
  }

  private registerDefaultListeners(): void {
    this.emitter.on(AdminNotificationEvents.STREAM_LOCKED, (payload: StreamLockedPayload) => {
      appLogger.info({ ...payload, event: AdminNotificationEvents.STREAM_LOCKED }, "Admin notification: stream locked");
    });
    this.emitter.on(AdminNotificationEvents.STREAM_UNLOCKED, (payload: StreamUnlockedPayload) => {
      appLogger.info({ ...payload, event: AdminNotificationEvents.STREAM_UNLOCKED }, "Admin notification: stream unlocked");
    });
    this.emitter.on(AdminNotificationEvents.STREAM_TERMINATED, (payload: StreamTerminatedPayload) => {
      appLogger.info({ ...payload, event: AdminNotificationEvents.STREAM_TERMINATED }, "Admin notification: stream terminated");
    });
    this.emitter.on(AdminNotificationEvents.OPERATION_FAILED, (payload: OperationFailedPayload) => {
      appLogger.error({ ...payload, event: AdminNotificationEvents.OPERATION_FAILED }, "Admin notification: operation failed");
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSuccess(event: string, listener: (...args: any[]) => void): void {
    this.emitter.on(event, listener);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFailure(event: string, listener: (...args: any[]) => void): void {
    this.emitter.on(event, listener);
  }

  notifyStreamLocked(payload: StreamLockedPayload): void {
    this.emitter.emit(AdminNotificationEvents.STREAM_LOCKED, payload);
  }

  notifyStreamUnlocked(payload: StreamUnlockedPayload): void {
    this.emitter.emit(AdminNotificationEvents.STREAM_UNLOCKED, payload);
  }

  notifyStreamTerminated(payload: StreamTerminatedPayload): void {
    this.emitter.emit(AdminNotificationEvents.STREAM_TERMINATED, payload);
  }

  notifyOperationFailed(payload: OperationFailedPayload): void {
    this.emitter.emit(AdminNotificationEvents.OPERATION_FAILED, payload);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.registerDefaultListeners();
  }
}

export const adminNotificationService = new AdminNotificationService();
