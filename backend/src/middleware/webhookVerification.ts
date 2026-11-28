import { createHmac, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

// Scheme and env contract: backend/docs/webhook-secret-rotation.md
// shortcut: no metrics or logging yet (no logger module in tree), add when wired to a route.

const DEFAULT_TOLERANCE_SECONDS = 300;

export function computeWebhookSignature(secret: string, timestamp: string, rawBody: Buffer): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
}

function loadSecrets(provider: string): string[] {
  const raw = process.env.INBOUND_WEBHOOK_SECRETS;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const entries = Object.entries(parsed as Record<string, unknown>);
  const match = entries.find(([name]) => name.toLowerCase() === provider);
  if (!match || typeof match[1] !== "string") return [];
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verifies `X-Webhook-Signature` (HMAC-SHA256 over `<timestamp>.<rawBody>`) for
 * `req.params.provider`. Requires `express.json` to capture `req.rawBody`.
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const provider = String(req.params.provider ?? "").toLowerCase();
  const secrets = loadSecrets(provider);
  if (secrets.length === 0) {
    res.status(503).json({ error: "missing_secret" });
    return;
  }

  const signature = req.get("X-Webhook-Signature");
  if (!signature) {
    res.status(401).json({ error: "missing_signature" });
    return;
  }

  const timestamp = req.get("X-Webhook-Timestamp");
  if (!timestamp) {
    res.status(401).json({ error: "missing_timestamp" });
    return;
  }
  if (!/^\d+$/.test(timestamp)) {
    res.status(400).json({ error: "malformed_timestamp" });
    return;
  }

  const tolerance = Number(process.env.INBOUND_WEBHOOK_TOLERANCE_SECONDS) || DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
    res.status(401).json({ error: "stale_timestamp" });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "missing_raw_body" });
    return;
  }

  const provided = signature.trim().toLowerCase();
  const valid = secrets.some((secret) =>
    safeEqualHex(computeWebhookSignature(secret, timestamp, rawBody), provided),
  );
  if (!valid) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  next();
}
