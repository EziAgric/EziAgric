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

/**
 * Supported notification locales. English is the canonical fallback.
 */
export const SUPPORTED_LOCALES = ["en", "ha", "yo", "ig", "pcm"] as const;
export type NotificationLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: NotificationLocale = "en";

/**
 * Trade-lifecycle notification keys that must be localized in every locale.
 */
export const TRADE_LIFECYCLE_KEYS = [
  "trade.created",
  "trade.funded",
  "trade.shipped",
  "trade.delivered",
  "trade.completed",
  "trade.cancelled",
  "trade.disputed",
  "trade.refunded",
] as const;
export type TradeLifecycleKey = (typeof TRADE_LIFECYCLE_KEYS)[number];

/**
 * Template catalog keyed by locale, then by notification key.
 * Every trade-lifecycle key is present in all supported locales.
 */
export const notificationTemplates: Record<NotificationLocale, Record<TradeLifecycleKey, string>> = {
  en: {
    "trade.created": "Your trade {{tradeId}} has been created.",
    "trade.funded": "Your trade {{tradeId}} has been funded.",
    "trade.shipped": "Your trade {{tradeId}} has been shipped.",
    "trade.delivered": "Your trade {{tradeId}} has been delivered.",
    "trade.completed": "Your trade {{tradeId}} has been completed.",
    "trade.cancelled": "Your trade {{tradeId}} has been cancelled.",
    "trade.disputed": "Your trade {{tradeId}} has been disputed.",
    "trade.refunded": "Your trade {{tradeId}} has been refunded.",
  },
  ha: {
    "trade.created": "An kirkiro cinikinka {{tradeId}}.",
    "trade.funded": "An ba da kuɗin cinikinka {{tradeId}}.",
    "trade.shipped": "An aika cinikinka {{tradeId}}.",
    "trade.delivered": "An isar da cinikinka {{tradeId}}.",
    "trade.completed": "An kammala cinikinka {{tradeId}}.",
    "trade.cancelled": "An soke cinikinka {{tradeId}}.",
    "trade.disputed": "An yi jayayya kan cinikinka {{tradeId}}.",
    "trade.refunded": "An mayar da kuɗin cinikinka {{tradeId}}.",
  },
  yo: {
    "trade.created": "A ti ṣẹda iṣowo rẹ {{tradeId}}.",
    "trade.funded": "A ti ṣe inawo iṣowo rẹ {{tradeId}}.",
    "trade.shipped": "A ti fi iṣowo rẹ ránṣẹ́ {{tradeId}}.",
    "trade.delivered": "A ti fi iṣowo rẹ dé {{tradeId}}.",
    "trade.completed": "A ti pari iṣowo rẹ {{tradeId}}.",
    "trade.cancelled": "A ti fagilé iṣowo rẹ {{tradeId}}.",
    "trade.disputed": "A ti ṣe àríyànjiyàn lori iṣowo rẹ {{tradeId}}.",
    "trade.refunded": "A ti da owo iṣowo rẹ pada {{tradeId}}.",
  },
  ig: {
    "trade.created": "E mepụtara ahịa gị {{tradeId}}.",
    "trade.funded": "E tinyela ego n\'ahịa gị {{tradeId}}.",
    "trade.shipped": "E zigara ahịa gị {{tradeId}}.",
    "trade.delivered": "E nyefere ahịa gị {{tradeId}}.",
    "trade.completed": "E mechara ahịa gị {{tradeId}}.",
    "trade.cancelled": "E kagburu ahịa gị {{tradeId}}.",
    "trade.disputed": "E nwere esemokwu n\'ahịa gị {{tradeId}}.",
    "trade.refunded": "E weghachiri ego ahịa gị {{tradeId}}.",
  },
  pcm: {
    "trade.created": "Your trade {{tradeId}} don create.",
    "trade.funded": "Your trade {{tradeId}} don get money.",
    "trade.shipped": "Your trade {{tradeId}} don ship.",
    "trade.delivered": "Your trade {{tradeId}} don deliver.",
    "trade.completed": "Your trade {{tradeId}} don complete.",
    "trade.cancelled": "Your trade {{tradeId}} don cancel.",
    "trade.disputed": "Your trade {{tradeId}} don get dispute.",
    "trade.refunded": "Your trade {{tradeId}} don refund.",
  },
};

/**
 * Resolve a template for a locale, falling back to English when the locale
 * or the specific key is missing.
 */
export function getNotificationTemplate(
  key: TradeLifecycleKey,
  locale: string = DEFAULT_LOCALE,
): string {
  const normalized = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as NotificationLocale)
    : DEFAULT_LOCALE;
  const localized = notificationTemplates[normalized]?.[key];
  return localized ?? notificationTemplates[DEFAULT_LOCALE][key];
}

/**
 * Render a template by interpolating {{placeholder}} tokens.
 */
export function renderNotificationTemplate(
  key: TradeLifecycleKey,
  locale: string = DEFAULT_LOCALE,
  vars: Record<string, string | number> = {},
): string {
  return getNotificationTemplate(key, locale).replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Detect trade-lifecycle keys that are missing a translation in any locale.
 */
export function findMissingTemplateKeys(): Array<{ locale: NotificationLocale; key: TradeLifecycleKey }> {
  const missing: Array<{ locale: NotificationLocale; key: TradeLifecycleKey }> = [];
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of TRADE_LIFECYCLE_KEYS) {
      const value = notificationTemplates[locale]?.[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        missing.push({ locale, key });
      }
    }
  }
  return missing;
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
