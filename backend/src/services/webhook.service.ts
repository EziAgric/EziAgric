import crypto from "crypto";
import { env } from "../config/env";
import { appLogger } from "../middleware/logger";
import { prisma } from "../lib/db";
import { TradeStatus } from "@prisma/client";

export type TradeWebhookEvent =
  | "trade.funded"
  | "trade.delivered"
  | "trade.settled"
  | "trade.disputed";

const TRADE_EVENT_BY_STATUS: Partial<Record<TradeStatus, TradeWebhookEvent>> = {
  [TradeStatus.FUNDED]: "trade.funded",
  [TradeStatus.DELIVERED]: "trade.delivered",
  [TradeStatus.SETTLED]: "trade.settled",
  [TradeStatus.DISPUTED]: "trade.disputed",
};

interface WebhookPayload {
  event: string;
  tradeId: string;
  status: TradeStatus;
  timestamp: string;
  data: Record<string, unknown>;
}

interface DeliveryTarget {
  url: string;
  secret?: string;
  subscriptionId?: number | null;
}

export class WebhookService {
  private readonly webhookUrl: string | undefined;
  private readonly webhookSecret: string | undefined;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;

  constructor() {
    this.webhookUrl = env.WEBHOOK_URL;
    this.webhookSecret = env.WEBHOOK_SECRET;
    this.maxAttempts = env.WEBHOOK_MAX_ATTEMPTS;
    this.retryBaseMs = env.WEBHOOK_RETRY_BASE_MS;
    this.retryMaxMs = env.WEBHOOK_RETRY_MAX_MS;
  }

  /**
   * Resolve the webhook event name for a trade status. Trade lifecycle
   * statuses (funded, delivered, settled, disputed) map to dedicated
   * `trade.*` event types; other statuses fall back to `trade.<status>`.
   */
  private resolveEvent(status: TradeStatus): string {
    return TRADE_EVENT_BY_STATUS[status] ?? `trade.${status.toLowerCase()}`;
  }

  async dispatch(tradeId: string, status: TradeStatus, metadata: Record<string, unknown> = {}): Promise<void> {
    const event = this.resolveEvent(status);
    const activeSubscriptions = await prisma.webhookSubscription.findMany({
      where: {
        isActive: true,
        events: { has: event },
      },
      select: {
        id: true,
        url: true,
        secretHash: true,
      },
    });

    const deliveryTargets: DeliveryTarget[] = activeSubscriptions.map((subscription) => ({
      url: subscription.url,
      secret: subscription.secretHash,
      subscriptionId: subscription.id,
    }));

    if (this.webhookUrl) {
      deliveryTargets.push({
        url: this.webhookUrl,
        secret: this.webhookSecret,
        subscriptionId: null,
      });
    }

    if (deliveryTargets.length === 0) {
      return;
    }

    const payload: WebhookPayload = {
      event,
      tradeId,
      status,
      timestamp: new Date().toISOString(),
      data: metadata,
    };

    const body = JSON.stringify(payload);

    await Promise.allSettled(
      deliveryTargets.map((target) => this.sendWebhookWithRetry(target, body, tradeId, status)),
    );
  }

  private async sendWebhookWithRetry(
    target: DeliveryTarget,
    body: string,
    tradeId: string,
    status: TradeStatus,
  ): Promise<void> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = target.secret
          ? this.signPayload(target.secret, timestamp, body)
          : undefined;

        const response = await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(signature
              ? {
                  "X-Webhook-Signature": signature,
                  "X-Webhook-Timestamp": timestamp,
                }
              : {}),
          },
          body,
        });

        if (response.ok) {
          appLogger.debug(
            {
              tradeId,
              status,
              webhookUrl: target.url,
              subscriptionId: target.subscriptionId,
              attempt,
            },
            "Webhook dispatched successfully",
          );
          return;
        }

        const shouldRetry = response.status >= 500 || response.status === 429;
        appLogger.warn(
          {
            tradeId,
            status,
            webhookUrl: target.url,
            subscriptionId: target.subscriptionId,
            statusCode: response.status,
            attempt,
            shouldRetry,
          },
          "Webhook delivery returned non-OK status",
        );

        if (!shouldRetry || attempt === this.maxAttempts) {
          return;
        }
      } catch (error) {
        lastError = error;
        appLogger.warn(
          {
            tradeId,
            status,
            webhookUrl: target.url,
            subscriptionId: target.subscriptionId,
            attempt,
            error,
          },
          "Webhook delivery attempt failed",
        );
      }

      if (attempt < this.maxAttempts) {
        const delay = Math.min(this.retryBaseMs * 2 ** (attempt - 1), this.retryMaxMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    appLogger.error(
      {
        tradeId,
        status,
        webhookUrl: target.url,
        subscriptionId: target.subscriptionId,
        error: lastError,
      },
      "Webhook delivery failed after retries",
    );
  }

  /**
   * Sign a webhook payload with the per-subscription secret. The signed
   * message is `${timestamp}.${body}` so receivers can reject replays by
   * checking the timestamp, and the signature is sent as
   * `X-Webhook-Signature` alongside `X-Webhook-Timestamp`.
   */
  private signPayload(secret: string, timestamp: string, body: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
  }

  isConfigured(): boolean {
    return !!this.webhookUrl;
  }
}

export const webhookService = new WebhookService();
