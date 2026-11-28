const NG_COUNTRY_CODE = "234";
// Nigerian mobile subscriber numbers: 10 digits starting 70/71/80/81/90/91.
const NG_MOBILE = /^[789][01]\d{8}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize a user-entered phone number to E.164. Numbers without a country
 * code are treated as Nigerian. Returns null when the input can't be
 * recognised, so callers decide whether that is a 400 or a skipped send.
 */
export function normalizePhoneE164(input: string): string | null {
  let digits = input.trim().replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;

  const hasPlus = digits.startsWith("+");
  if (hasPlus) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith(NG_COUNTRY_CODE)) {
    // Drop the trunk "0" people often keep after the country code (+234 0803...).
    let local = digits.slice(NG_COUNTRY_CODE.length);
    if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
    return NG_MOBILE.test(local) ? `+${NG_COUNTRY_CODE}${local}` : null;
  }
  if (hasPlus) return E164.test(`+${digits}`) ? `+${digits}` : null;

  // No country code: national format (0803...) or bare subscriber number.
  const local = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return NG_MOBILE.test(local) ? `+${NG_COUNTRY_CODE}${local}` : null;
}

