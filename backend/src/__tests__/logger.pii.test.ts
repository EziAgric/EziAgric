import pino from "pino";

/**
 * Enforcement test for #233: asserts PII is absent from the *actual*
 * serialized log line produced by pino, not just from the redaction
 * function in isolation. Builds a logger with the same
 * `hooks.logMethod` wiring as `middleware/logger.ts`'s appLogger — that
 * file forces `level: 'silent'` under NODE_ENV=test, which is correct for
 * app noise but means we can't assert on appLogger's own output here, so we
 * reconstruct the identical hook against a capturable stream instead.
 */
import { redactPii } from "../lib/logRedaction";

function buildCapturingLogger() {
  const lines: string[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(chunk);
      return true;
    },
  };

  const logger = pino(
    {
      level: "info",
      hooks: {
        logMethod(this: unknown, args: unknown[], method: (...a: unknown[]) => void) {
          const redactedArgs = args.map((arg) =>
            arg !== null && typeof arg === "object" ? redactPii(arg) : arg,
          );
          method.apply(this, redactedArgs);
        },
      },
    },
    stream as any,
  );

  return { logger, lines };
}

describe("appLogger PII enforcement (pino hooks.logMethod wiring)", () => {
  it("scrubs PII from the serialized log line for a representative webhook payload", () => {
    const { logger, lines } = buildCapturingLogger();

    logger.info(
      {
        event: "webhook.delivery.failed",
        webhook: { userAddress: "GWEBHOOKOWNERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
        recipient: { email: "ops@example.com", phone: "+15555550123" },
        responseBody: "Undeliverable: contact fallback@example.com or call 415-555-0132",
      },
      "webhook delivery failed",
    );

    const output = lines.join("\n");
    expect(output).not.toContain("ops@example.com");
    expect(output).not.toContain("+15555550123");
    expect(output).not.toContain("fallback@example.com");
    expect(output).not.toContain("415-555-0132");
    expect(output).toContain("webhook.delivery.failed");
    expect(output).toContain("GWEBHOOKOWNERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
  });

  it("scrubs PII from a logged Error's message", () => {
    const { logger, lines } = buildCapturingLogger();

    logger.error({ err: new Error("SMTP bounce for jane@example.com") }, "notification failed");

    const output = lines.join("\n");
    expect(output).not.toContain("jane@example.com");
    expect(output).toContain("[REDACTED_EMAIL]");
  });

  it("leaves non-PII structured fields fully intact", () => {
    const { logger, lines } = buildCapturingLogger();

    logger.info({ tradeId: "T-42", amount: 1500, status: "RELEASED" }, "trade released");

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.tradeId).toBe("T-42");
    expect(parsed.amount).toBe(1500);
    expect(parsed.status).toBe("RELEASED");
  });
});
