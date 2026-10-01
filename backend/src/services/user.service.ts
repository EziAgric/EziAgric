import { getSupabaseClient } from "../lib/supabase";
import { retryAsync } from "../lib/retry";
import { UpdateProfileInput, updateProfileSchema } from "../validators/user.validators";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { StrKey } from "@stellar/stellar-sdk";
import { createHmac, randomInt, timingSafeEqual } from "crypto";

/**
 * Phone verification via OTP.
 *
 * Security properties:
 *   - OTP codes are never stored in plaintext: only an HMAC-SHA256 digest
 *     (keyed by OTP_SECRET) is persisted, so a DB leak does not expose codes.
 *   - Phone numbers are encrypted at rest with AES-256-GCM before being
 *     written to the users table.
 *   - Send and verify are rate limited per address, and verification is
 *     brute-force protected with a hard attempt cap plus expiry.
 */

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_SEND_WINDOW_MS = 60 * 1000; // 1 minute
const OTP_MAX_SENDS_PER_WINDOW = 3;
const OTP_VERIFY_WINDOW_MS = 60 * 1000;
const OTP_MAX_VERIFIES_PER_WINDOW = 10;

function getOtpSecret(): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    throw new AppError(ErrorCode.INFRA_ERROR, 'OTP secret is not configured', 500);
  }
  return secret;
}

function getPhoneEncryptionKey(): Buffer {
  const raw = process.env.PHONE_ENCRYPTION_KEY;
  if (!raw) {
    throw new AppError(ErrorCode.INFRA_ERROR, 'Phone encryption key is not configured', 500);
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new AppError(ErrorCode.INFRA_ERROR, 'Phone encryption key must be 32 bytes (hex)', 500);
  }
  return key;
}

function hashOtp(address: string, code: string): string {
  return createHmac('sha256', getOtpSecret())
    .update(`${address.toLowerCase()}:${code}`)
    .digest('hex');
}

function encryptPhone(phone: string): string {
  const key = getPhoneEncryptionKey();
  const iv = require('crypto').randomBytes(12) as Buffer;
  const cipher = require('crypto').createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptPhone(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const key = getPhoneEncryptionKey();
  const decipher = require('crypto').createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!/^\+?[1-9]\d{6,14}$/.test(trimmed)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid phone number', 400);
  }
  return trimmed;
}

/**
 * Send an OTP to the given phone number for the user identified by address.
 * Rate limited per address to prevent SMS abuse.
 */
export async function sendPhoneOtp(address: string, phone: string) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key', 400);
  }

  const normalizedAddress = address.toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  const supabase = getSupabaseClient();

  try {
    const windowStart = new Date(Date.now() - OTP_SEND_WINDOW_MS).toISOString();
    const { count, error: countError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from('phone_otps')
          .select('id', { count: 'exact', head: true })
          .eq('address', normalizedAddress)
          .gte('created_at', windowStart)
      ),
      { operationName: 'count_recent_otp_sends' },
    );

    if (countError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to check OTP rate limit', 500);
    }

    if ((count ?? 0) >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'Too many OTP requests, try again later', 429);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { error: insertError } = await retryAsync(
      () => Promise.resolve(
        supabase.from('phone_otps').insert({
          address: normalizedAddress,
          phone_encrypted: encryptPhone(normalizedPhone),
          code_hash: hashOtp(normalizedAddress, code),
          attempts: 0,
          expires_at: expiresAt,
          consumed_at: null,
        })
      ),
      { operationName: 'create_phone_otp', maxRetries: 0 },
    );

    if (insertError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to create OTP', 500);
    }

    await sendSms(normalizedPhone, `Your verification code is ${code}. It expires in 5 minutes.`);

    return { sent: true, expiresAt };
  } catch (error: any) {
    if (error.name === 'AppError') throw error;
    throw new AppError(ErrorCode.INFRA_ERROR, 'OTP send failed', 503);
  }
}

/**
 * Verify a submitted OTP. Enforces expiry, a hard attempt cap, and per-address
 * verification rate limiting to protect against brute-force guessing.
 */
export async function verifyPhoneOtp(address: string, code: string) {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid Stellar public key', 400);
  }
  if (!/^\d{6}$/.test(code)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid OTP format', 400);
  }

  const normalizedAddress = address.toLowerCase();
  const supabase = getSupabaseClient();

  try {
    const windowStart = new Date(Date.now() - OTP_VERIFY_WINDOW_MS).toISOString();
    const { count, error: countError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from('phone_otp_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('address', normalizedAddress)
          .gte('created_at', windowStart)
      ),
      { operationName: 'count_recent_otp_verifies' },
    );

    if (countError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to check verify rate limit', 500);
    }
    if ((count ?? 0) >= OTP_MAX_VERIFIES_PER_WINDOW) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'Too many verification attempts, try again later', 429);
    }

    await retryAsync(
      () => Promise.resolve(
        supabase.from('phone_otp_attempts').insert({ address: normalizedAddress })
      ),
      { operationName: 'record_otp_attempt', maxRetries: 0 },
    );

    const { data: otp, error: fetchError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from('phone_otps')
          .select('*')
          .eq('address', normalizedAddress)
          .is('consumed_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ),
      { operationName: 'fetch_active_otp' },
    );

    if (fetchError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to load OTP', 500);
    }
    if (!otp) {
      throw new AppError(ErrorCode.NOT_FOUND, 'No active OTP found', 404);
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'OTP has expired', 400);
    }

    if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'OTP attempt limit exceeded', 429);
    }

    const expected = Buffer.from(otp.code_hash, 'hex');
    const provided = Buffer.from(hashOtp(normalizedAddress, code), 'hex');
    const matches =
      expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!matches) {
      await retryAsync(
        () => Promise.resolve(
          supabase
            .from('phone_otps')
            .update({ attempts: (otp.attempts ?? 0) + 1 })
            .eq('id', otp.id)
        ),
        { operationName: 'increment_otp_attempts', maxRetries: 0 },
      );
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid OTP', 400);
    }

    const phone = decryptPhone(otp.phone_encrypted);

    await retryAsync(
      () => Promise.resolve(
        supabase
          .from('phone_otps')
          .update({ consumed_at: new Date().toISOString() })
          .eq('id', otp.id)
      ),
      { operationName: 'consume_otp', maxRetries: 0 },
    );

    const { data: updated, error: updateError } = await retryAsync(
      () => Promise.resolve(
        supabase
          .from('users')
          .update({
            phone_encrypted: encryptPhone(phone),
            phone_verified: true,
            updated_at: new Date().toISOString(),
          })
          .eq('address', normalizedAddress)
          .select('address, phone_verified')
          .single()
      ),
      { operationName: 'mark_phone_verified', maxRetries: 0 },
    );

    if (updateError) {
      throw new AppError(ErrorCode.INFRA_ERROR, 'Failed to mark phone verified', 500);
    }

    return { phoneVerified: true, address: updated.address };
  } catch (error: any) {
    if (error.name === 'AppError') throw error;
    throw new AppError(ErrorCode.INFRA_ERROR, 'OTP verification failed', 503);
  }
}

/**
 * Send an SMS through the configured provider.
 * Falls back to a no-op log when no provider is configured (dev/test).
 */
async function sendSms(phone: string, message: string): Promise<void> {
  const endpoint = process.env.SMS_PROVIDER_URL;
  const apiKey = process.env.SMS_PROVIDER_API_KEY;

  if (!endpoint || !apiKey) {
    // No provider configured — do not leak the code in production logs.
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[sms:dev] to=${phone} message=${message}`);
    }
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ to: phone, message }),
  });

  if (!response.ok) {
    throw new AppError(ErrorCode.INFRA_ERROR, 'SMS provider rejected the request', 502);
  }
}

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
 * Exposes the `phoneVerified` badge without leaking the phone number itself.
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
          .select("address, display_name, avatar_url, phone_verified, created_at")
          .eq("address", normalizedAddress)
          .single()
      ),
      { operationName: "get_public_profile" },
    );

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new AppError(ErrorCode.INFRA_ERROR, 'Fetch failed', 500);
    }

    return {
      address: data.address,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      phoneVerified: Boolean(data.phone_verified),
      createdAt: data.created_at,
    };
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
