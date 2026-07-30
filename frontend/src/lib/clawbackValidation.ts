/**
 * Client-side validation for admin clawback amounts (#57), mirroring the
 * backend's `POST /admin/streams/:id/clawback/preview` checks so the submit
 * button can be disabled before a doomed request is ever sent.
 *
 * Amounts are arbitrary-precision integer strings (matching the backend's
 * `^\d+$` contract for `unclaimed`/`totalVested`), so this compares as
 * BigInt rather than risking float precision loss on large balances.
 */
export interface ClawbackAmountValidation {
  valid: boolean;
  error: string | null;
}

export function validateClawbackAmount(
  amount: string,
  remainingVested: string,
): ClawbackAmountValidation {
  const trimmed = amount.trim();

  if (trimmed === "") {
    return { valid: false, error: "Enter an amount." };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: "Amount must be a positive whole number." };
  }

  const requested = BigInt(trimmed);
  if (requested <= BigInt(0)) {
    return { valid: false, error: "Amount must be greater than zero." };
  }

  const remaining = /^\d+$/.test(remainingVested) ? BigInt(remainingVested) : BigInt(0);
  if (requested > remaining) {
    return {
      valid: false,
      error: `Amount cannot exceed the remaining vested balance of ${remainingVested}.`,
    };
  }

  return { valid: true, error: null };
}
