import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { appLogger } from "./logger";
import { recordWebhookSignatureVerification } from "../lib/metrics";

/**
 * Inbound webhook HMAC verification.
 *
 * Every inbound webhook route mutates trade or payment state, so a forged POST
 * is directly exploitable. This middleware fails closed: a provider with no
 * configured secret is rejected rather than waved through, so adding a route
 * without registering its secret breaks loudly instead of silently accepting
 * unsigned traffic.
 *
 * The signed string is `${timestamp}.${rawBody}` — binding the timestamp into
 * the MAC is what makes the replay window meaningful; signing the body alone
 * would let an attacker replay a captured payload with a fresh timestamp.
 */

/** Header carrying the hex-encoded HMAC-SHA256 digest. */
export const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";

/** Header carrying the Unix-seconds timestamp that was folded into the digest. */
export const WEBHOOK_TIMESTAMP_HEADER = "x-webhook-timestamp";

/** Why a request was rejected. Mirrored into the failure metric. */
export type WebhookVerificationFailure =
  | "unknown_provider"
  | "missing_secret"
  | "missing_signature"
  | "missing_timestamp"
  | "malformed_timestamp"
  | "stale_timestamp"
  | "missing_raw_body"
  | "invalid_signature";

const FAILURE_MESSAGES: Record<WebhookVerificationFailure, string> = {
  unknown_provider: "Unknown webhook provider",
  missing_secret: "Webhook provider is not configured for signature verification",
  missing_signature: `Missing ${WEBHOOK_SIGNATURE_HEADER} header`,
  missing_timestamp: `Missing ${WEBHOOK_TIMESTAMP_HEADER} header`,
  malformed_timestamp: `Malformed ${WEBHOOK_TIMESTAMP_HEADER} header`,
  stale_timestamp: "Webhook timestamp outside the accepted tolerance window",
  missing_raw_body: "Raw request body unavailable for signature verification",
  invalid_signature: "Webhook signature verification failed",
};

/**
 * A provider whose secret is missing is a configuration error, not a client
 * error, so it answers 503 — retrying the same request later can succeed once
 * the secret is deployed. Everything else is the caller's fault: 4xx.
 */
const FAILURE_STATUS: Record<WebhookVerificationFailure, number> = {
  unknown_provider: 404,
  missing_secret: 503,
  missing_signature: 401,
  missing_timestamp: 401,
  malformed_timestamp: 400,
  stale_timestamp: 401,
  missing_raw_body: 400,
  invalid_signature: 401,
};

/** Express `Request` after `captureRawBody` has run. */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * `express.json` verify hook that stashes the exact bytes received.
 *
 * The signature covers the raw payload, so re-serialising `req.body` would
 * produce a different string (key order, whitespace, number formatting) and
 * every signature would fail. Register this on the JSON body parser.
 */
export function captureRawBody(req: RawBodyRequest, _res: Response, buf: Buffer): void {
  if (buf?.length) {
    req.rawBody = Buffer.from(buf);
  }
}

/**
 * Parses the per-provider secret registry.
 *
 * `INBOUND_WEBHOOK_SECRETS` is a JSON object of `{ "<provider>": "<secret>" }`.
 * During rotation a provider may carry several comma-separated secrets; each is
 * accepted, which lets the old and new secret overlap for one deploy. See
 * `backend/docs/webhook-secret-rotation.md`.
 */
export function parseWebhookSecrets(raw: string | undefined): Map<string, string[]> {
  const registry = new Map<string, string[]>();
  if (!raw || raw.trim() === "") {
    return registry;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("INBOUND_WEBHOOK_SECRETS must be a JSON object of provider -> secret");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INBOUND_WEBHOOK_SECRETS must be a JSON object of provider -> secret");
  }

  for (const [provider, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(`INBOUND_WEBHOOK_SECRETS entry "${provider}" must be a string`);
    }
    const secrets = value
      .split(",")
      .map((secret) => secret.trim())
      .filter((secret) => secret.length > 0);
    if (secrets.length === 0) {
      throw new Error(`INBOUND_WEBHOOK_SECRETS entry "${provider}" is empty`);
    }
    registry.set(provider.toLowerCase(), secrets);
  }

  return registry;
}

let cachedRegistry: Map<string, string[]> | null = null;
let cachedRegistrySource: string | undefined;

function getSecretRegistry(): Map<string, string[]> {
  const source = env.INBOUND_WEBHOOK_SECRETS;
  if (cachedRegistry === null || cachedRegistrySource !== source) {
    cachedRegistry = parseWebhookSecrets(source);
    cachedRegistrySource = source;
  }
  return cachedRegistry;
}

/** Drops the memoised registry. Exported so a rotation test can re-read env. */
export function resetWebhookSecretRegistry(): void {
  cachedRegistry = null;
  cachedRegistrySource = undefined;
}

/** Providers with a configured secret, lowercased. */
export function configuredWebhookProviders(): string[] {
  return [...getSecretRegistry().keys()];
}

/**
 * Constant-time digest comparison.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is
 * checked first — that leaks only the length of the supplied header, never the
 * expected digest.
 */
function digestsMatch(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/** Computes the digest a provider is expected to send for this payload. */
export function computeWebhookSignature(secret: string, timestamp: string, rawBody: Buffer | string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export interface WebhookSignatureOptions {
  /**
   * Fixed provider name. Omit to read it from `req.params.provider`, which is
   * what the generic `/webhooks/inbound/:provider` receiver does.
   */
  provider?: string;
  /** Replay window in seconds. Defaults to `INBOUND_WEBHOOK_TOLERANCE_SECONDS`. */
  toleranceSeconds?: number;
}

/**
 * Builds the verification middleware.
 *
 * Applied at router level so every route mounted beneath it is covered by
 * construction — a new provider route cannot forget the guard.
 *
 * @param options - Optional fixed provider name and replay tolerance.
 * @returns Express middleware that answers 4xx/503 on any verification failure
 * and calls `next()` only for a request whose signature and timestamp check out.
 */
export function verifyWebhookSignature(options: WebhookSignatureOptions = {}) {
  return function webhookSignatureMiddleware(
    req: RawBodyRequest,
    res: Response,
    next: NextFunction,
  ): void {
    const rawProvider = options.provider ?? (req.params?.provider as string | undefined);
    const provider = typeof rawProvider === "string" ? rawProvider.trim().toLowerCase() : "";

    const reject = (failure: WebhookVerificationFailure): void => {
      recordWebhookSignatureVerification(provider || "unknown", failure);
      appLogger.warn(
        {
          provider: provider || "unknown",
          failure,
          path: req.originalUrl,
          ip: req.ip,
        },
        "Inbound webhook rejected",
      );
      res.status(FAILURE_STATUS[failure]).json({ error: FAILURE_MESSAGES[failure] });
    };

    if (!provider) {
      reject("unknown_provider");
      return;
    }

    const secrets = getSecretRegistry().get(provider);
    if (!secrets || secrets.length === 0) {
      reject("missing_secret");
      return;
    }

    const signature = firstHeader(req.headers[WEBHOOK_SIGNATURE_HEADER])?.trim();
    if (!signature) {
      reject("missing_signature");
      return;
    }

    const timestampHeader = firstHeader(req.headers[WEBHOOK_TIMESTAMP_HEADER])?.trim();
    if (!timestampHeader) {
      reject("missing_timestamp");
      return;
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) {
      reject("malformed_timestamp");
      return;
    }

    // Symmetric window: rejects both stale replays and clocks skewed forward.
    const tolerance = options.toleranceSeconds ?? env.INBOUND_WEBHOOK_TOLERANCE_SECONDS;
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSeconds > tolerance) {
      reject("stale_timestamp");
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      reject("missing_raw_body");
      return;
    }

    // Every accepted secret is tried so a rotation does not drop deliveries.
    const verified = secrets.some((secret) =>
      digestsMatch(computeWebhookSignature(secret, timestampHeader, rawBody), signature),
    );

    if (!verified) {
      reject("invalid_signature");
      return;
    }

    recordWebhookSignatureVerification(provider, "verified");
    next();
  };
}
