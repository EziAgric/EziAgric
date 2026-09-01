import { Router, Request, Response } from "express";
import { appLogger } from "../middleware/logger";
import { verifyWebhookSignature } from "../middleware/webhookSignature.middleware";

/**
 * Inbound provider callbacks.
 *
 * The HMAC guard is registered with `router.use` rather than per route, so it
 * runs before anything mounted here. Adding a provider route below cannot skip
 * verification, which is what keeps "every inbound route is signed" true as the
 * file grows.
 */
const router = Router();

router.use("/:provider", verifyWebhookSignature());

/**
 * Handlers for a verified payload, keyed by provider. A provider gets an entry
 * here only once its secret is registered in `INBOUND_WEBHOOK_SECRETS`;
 * unrecognised providers are rejected by the guard before reaching this map.
 */
type InboundWebhookHandler = (payload: unknown, req: Request) => Promise<void>;

const handlers = new Map<string, InboundWebhookHandler>();

/**
 * Registers the handler for a provider's verified callbacks.
 *
 * @param provider - Provider name, matched case-insensitively against the
 * `:provider` path segment and the secret registry.
 * @param handler - Invoked only after the signature and timestamp have been
 * verified. Throwing yields a 500; the provider will retry.
 */
export function registerInboundWebhookHandler(
  provider: string,
  handler: InboundWebhookHandler,
): void {
  handlers.set(provider.toLowerCase(), handler);
}

/** Test hook: clears the handler registry between cases. */
export function __resetInboundWebhookHandlers(): void {
  handlers.clear();
}

// POST /webhooks/inbound/:provider - accept a signed provider callback
router.post("/:provider", async (req: Request, res: Response) => {
  const provider = String(req.params.provider).toLowerCase();

  try {
    const handler = handlers.get(provider);

    if (!handler) {
      // The secret is configured but nothing consumes the payload yet. The
      // signature already passed, so this is an integration gap on our side —
      // acknowledge rather than make the provider retry forever.
      appLogger.info(
        { provider, path: req.originalUrl },
        "Verified inbound webhook has no registered handler",
      );
      return res.status(202).json({ status: "accepted", provider, handled: false });
    }

    await handler(req.body, req);

    return res.status(200).json({ status: "ok", provider, handled: true });
  } catch (error) {
    appLogger.error({ provider, error }, "Inbound webhook handler failed");
    return res.status(500).json({ error: "Failed to process inbound webhook" });
  }
});

export { router as inboundWebhooksRoutes };
