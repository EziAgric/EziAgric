import { normalizePhoneE164 } from "../validators/phone.validators";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { appLogger } from "../middleware/logger";

/**
 * Send an SMS through the configured provider. The recipient is normalized to
 * E.164 first; numbers that still can't be parsed are skipped with a warning
 * (registration rejects them, so this only catches legacy rows).
 * Falls back to a no-op log when no provider is configured (dev/test).
 */
export async function sendSms(phone: string, message: string): Promise<boolean> {
  const to = normalizePhoneE164(phone);
  if (!to) {
    appLogger.warn({ event: "sms.invalid_recipient" }, "Skipping SMS: unrecognised phone number");
    return false;
  }

  const endpoint = process.env.SMS_PROVIDER_URL;
  const apiKey = process.env.SMS_PROVIDER_API_KEY;

  if (!endpoint || !apiKey) {
    // No provider configured — do not leak the message in production logs.
    if (process.env.NODE_ENV !== "production") {
      console.info(`[sms:dev] to=${to} message=${message}`);
    }
    return true;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ to, message }),
  });

  if (!response.ok) {
    throw new AppError(ErrorCode.INFRA_ERROR, "SMS provider rejected the request", 502);
  }
  return true;
}
