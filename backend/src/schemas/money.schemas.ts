import { z } from "zod";
import {
  MONEY_DECIMALS,
  MoneyConversionError,
  normalizeDecimalString,
  parseDecimalToStroops,
} from "../lib/money";

/**
 * Zod schemas for monetary fields.
 *
 * A JSON `number` cannot carry a large stroop amount without losing precision,
 * so money fields accept **strings only**. A numeric payload is rejected with a
 * message that says what to send instead, rather than being coerced — coercion
 * is what let large amounts corrupt silently in the first place.
 */

const NUMERIC_MONEY_MESSAGE =
  "Monetary amounts must be sent as a decimal string, not a JSON number — a number cannot represent large amounts exactly";

/**
 * A positive monetary amount as a decimal string.
 *
 * Validates by running the real conversion, so the schema and the arithmetic
 * agree on what is representable: too many decimal places, or a value beyond
 * `i128`, fails here rather than deep in a contract call. The parsed value is
 * normalised to a canonical string.
 *
 * @param decimals - Decimal places. Defaults to the platform token's.
 */
export const moneyString = (decimals: number = MONEY_DECIMALS) =>
  z
    .custom<string>(
      (value) => typeof value === "string",
      (value) => ({
        message: typeof value === "number" ? NUMERIC_MONEY_MESSAGE : "Amount must be a string",
      }),
    )
    .superRefine((value: string, ctx: z.RefinementCtx) => {
      let stroops: bigint;
      try {
        stroops = parseDecimalToStroops(value, decimals);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof MoneyConversionError ? error.message : "Invalid amount",
        });
        return;
      }
      if (stroops <= 0n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Amount must be positive",
        });
      }
    })
    .transform((value: string) => normalizeDecimalString(value, decimals));

/**
 * A monetary amount that may be zero — running balances and accumulated totals,
 * as opposed to a transfer amount.
 *
 * @param decimals - Decimal places. Defaults to the platform token's.
 */
export const nonNegativeMoneyString = (decimals: number = MONEY_DECIMALS) =>
  z
    .custom<string>(
      (value) => typeof value === "string",
      (value) => ({
        message: typeof value === "number" ? NUMERIC_MONEY_MESSAGE : "Amount must be a string",
      }),
    )
    .superRefine((value: string, ctx: z.RefinementCtx) => {
      let stroops: bigint;
      try {
        stroops = parseDecimalToStroops(value, decimals);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof MoneyConversionError ? error.message : "Invalid amount",
        });
        return;
      }
      if (stroops < 0n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Amount must not be negative",
        });
      }
    })
    .transform((value: string) => normalizeDecimalString(value, decimals));

export { NUMERIC_MONEY_MESSAGE };
