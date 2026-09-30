import { getSupabaseClient } from "../lib/supabase";
import { retryAsync } from "../lib/retry";
import { UpdateProfileInput, updateProfileSchema } from "../validators/user.validators";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { StrKey } from "@stellar/stellar-sdk";

/** 
 * Find a user by wallet address or create a new one if not exists.
 * Used during authentication flow.
 *
 * Retry strategy:
 *   - Initial SELECT: idempotent read → retried on transient errors.
 *   - INSERT: non-idempotent write → NOT auto-retried (maxRetries: 0)
 *     to prevent duplicate-row creation without an idempotency key.
 *   - Conflict re-fetch: idempotent read → retried.
 */
export async function findOrCreateUser(address: string) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key', 400);
  }

  const supabase = getSupabaseClient();
  const normalizedAddress = address.toLowerCase();

  try {
    // Idempotent read — safe to retry on transient failures.
    // Supabase builder is wrapped in Promise.resolve() so TypeScript's
    // retryAsync constraint (operation: () => Promise<T>) is satisfied.
    const { data, error } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("users")
          .select("*")
          .eq("address", normalizedAddress)
          .single()
      ),
      { operationName: "find_user_by_address" },
    );

    if (error && error.code === "PGRST116") {
      // Not found — auto-create.
      // INSERT is NOT retried (maxRetries: 0) because a duplicate call could
      // create two rows. The caller must provide an idempotency mechanism for
      // retries on writes to be safe.
      const { data: created, error: createError } = await retryAsync(
        () => Promise.resolve(
          supabase
            .from("users")
            .insert({ address: normalizedAddress })
            .select()
            .single()
        ),
        { operationName: "create_user", maxRetries: 0 },
      );

      // Another request may have inserted the same address after our initial read.
      if (createError?.code === "23505") {
        // Idempotent re-fetch after race — safe to retry
        const { data: existing, error: existingError } = await retryAsync(
          () => Promise.resolve(
            supabase
              .from("users")
              .select("*")
              .eq("address", normalizedAddress)
              .single()
          ),
          { operationName: "find_user_after_conflict" },
        );

        if (!existingError && existing) {
          return existing;
        }
      }

      if (createError) {
        throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to create user record', 500);
      }
      return created;
    }

    if (error) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'PostgreSQL query failed', 500);
    }

    return data;
  } catch (error: any) {
    if (error.name === 'AppError') throw error;
    throw new AppError(ErrorCode.INFRA_ERROR, 'User service dependency failure', 503);
  }
}

/**
 * Update user profile details.
 *
 * Retry strategy:
 *   UPDATE is not blindly retried (maxRetries: 0) because it is a stateful
 *   write. If the caller needs retry resilience on updates, they should
 *   supply a compare-and-swap mechanism or idempotency key at the call site.
 */
export async function updateUser(address: string, input: UpdateProfileInput) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key', 400);
  }

  // Validate input schema
  const validation = updateProfileSchema.safeParse(input);
  if (!validation.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid profile data', 400);
  }

  const supabase = getSupabaseClient();
  const normalizedAddress = address.toLowerCase();

  try {
    // UPDATE is a non-idempotent write — not auto-retried
    const { data, error } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("users")
          .update({
            display_name: input.displayName,
            avatar_url: input.avatarUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("address", normalizedAddress)
          .select()
          .single()
      ),
      { operationName: "update_user_profile", maxRetries: 0 },
    );

    if (error) {
      if (error.code === "PGRST116") {
        throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
      }
      throw new AppError(ErrorCode.INFRA_ERROR, 'Update failed', 500);
    }

    return data;
  } catch (error: any) {
    if (error.name === 'AppError') throw error;
    throw new AppError(ErrorCode.INFRA_ERROR, 'User update failed', 503);
  }
}

/**
 * Get public profile details for any user.
 *
 * Idempotent read — retried on transient failures.
 */
export async function getPublicProfile(address: string) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key', 400);
  }

  const supabase = getSupabaseClient();
  const normalizedAddress = address.toLowerCase();

  try {
    // SELECT is idempotent — safe to retry
    const { data, error } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("users")
          .select("address, display_name, avatar_url, created_at")
          .eq("address", normalizedAddress)
          .single()
      ),
      { operationName: "get_public_profile" },
    );

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new AppError(ErrorCode.INFRA_ERROR, 'Fetch failed', 500);
    }

    return data;
  } catch (error: any) {
    if (error.name === 'AppError') throw error;
    throw new AppError(ErrorCode.INFRA_ERROR, 'User service dependency failure', 503);
  }
}

/**
 * Deactivate (soft-delete) a user account.
 *
 * Guards:
 *   - Blocked while the user has open trades or open disputes so that
 *     in-flight escrow/audit obligations are not orphaned.
 *
 * Effects on success:
 *   - Anonymizes PII on the profile (display_name, avatar_url) while
 *     retaining the user row and all trade records for audit purposes.
 *   - Revokes all active sessions for the user.
 *
 * Retry strategy:
 *   - Pre-flight reads are idempotent → retried.
 *   - The anonymizing UPDATE and session revocation are stateful writes →
 *     not auto-retried (maxRetries: 0).
 */
export async function deactivateUser(address: string) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key', 400);
  }

  const supabase = getSupabaseClient();
  const normalizedAddress = address.toLowerCase();

  try {
    // Idempotent read — safe to retry
    const { data: user, error: userError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("users")
          .select("*")
          .eq("address", normalizedAddress)
          .single()
      ),
      { operationName: "find_user_for_deactivation" },
    );

    if (userError) {
      if (userError.code === "PGRST116") {
        throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
      }
      throw new AppError(ErrorCode.INFRA_ERROR, 'Fetch failed', 500);
    }

    // Block deactivation while open trades exist.
    const { count: openTrades, error: tradesError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("trades")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("status", ["open", "active", "pending"])
      ),
      { operationName: "count_open_trades" },
    );

    if (tradesError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to check open trades', 500);
    }

    if (openTrades && openTrades > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot deactivate account while trades are open',
        409,
      );
    }

    // Block deactivation while open disputes exist.
    const { count: openDisputes, error: disputesError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("status", ["open", "pending"])
      ),
      { operationName: "count_open_disputes" },
    );

    if (disputesError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to check open disputes', 500);
    }

    if (openDisputes && openDisputes > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot deactivate account while disputes are open',
        409,
      );
    }

    // Anonymize PII while retaining the row and trade records for audit.
    // Stateful write — not auto-retried.
    const { data: updated, error: updateError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("users")
          .update({
            display_name: null,
            avatar_url: null,
            deactivated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id)
          .select()
          .single()
      ),
      { operationName: "anonymize_user", maxRetries: 0 },
    );

    if (updateError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to deactivate account', 500);
    }

    // Revoke all active sessions. Stateful write — not auto-retried.
    const { error: sessionError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from("sessions")
          .delete()
          .eq("user_id", user.id)
      ),
      { operationName: "revoke_user_sessions", maxRetries: 0 },
    );

    if (sessionError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to revoke sessions', 500);
    }

    return updated;
  } catch (error: any) {
    if (error.name === 'AppError') throw error;
    throw new AppError(ErrorCode.INFRA_ERROR, 'User deactivation failed', 503);
  }
}
