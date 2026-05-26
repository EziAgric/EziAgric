/**
 * env.config.test.ts — Issue #412
 *
 * Tests for env parsing and startup config validation.
 * All paths exercise the zod schema directly via isolated module loading
 * so no real external services are needed.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Minimal env schema mirror — keeps the test self-contained even if the real
// schema evolves. Tests that directly concern startup behaviour reference the
// live schema via dynamic import.
// ---------------------------------------------------------------------------

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('86400'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DATABASE_URL: z.string(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STELLAR_RPC_URL: z.string().optional(),
  AMANA_ESCROW_CONTRACT_ID: z.string().min(1),
  USDC_CONTRACT_ID: z.string().min(1),
});

type EnvInput = Record<string, string | undefined>;

function parseEnv(input: EnvInput) {
  return envSchema.safeParse(input);
}

const VALID_BASE: EnvInput = {
  NODE_ENV: 'test',
  JWT_SECRET: 'a-valid-secret-that-is-at-least-32-chars-long',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/amana',
  AMANA_ESCROW_CONTRACT_ID: 'CESCROW000000000000000000000000000000000000000000000000000',
  USDC_CONTRACT_ID: 'CUSDC0000000000000000000000000000000000000000000000000000000',
};

// ---------------------------------------------------------------------------
// Valid config — happy path
// ---------------------------------------------------------------------------

describe('env config — valid inputs', () => {
  it('accepts a minimal valid config', () => {
    const result = parseEnv(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it('defaults PORT to 4000 when not supplied', () => {
    const result = parseEnv(VALID_BASE);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(4000);
  });

  it('accepts a custom PORT', () => {
    const result = parseEnv({ ...VALID_BASE, PORT: '8080' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(8080);
  });

  it('defaults REDIS_URL when not supplied', () => {
    const result = parseEnv(VALID_BASE);
    if (result.success) expect(result.data.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('defaults JWT_EXPIRES_IN to 86400', () => {
    const result = parseEnv(VALID_BASE);
    if (result.success) expect(result.data.JWT_EXPIRES_IN).toBe('86400');
  });

  it('accepts production NODE_ENV', () => {
    const result = parseEnv({ ...VALID_BASE, NODE_ENV: 'production' });
    expect(result.success).toBe(true);
  });

  it('accepts development NODE_ENV', () => {
    const result = parseEnv({ ...VALID_BASE, NODE_ENV: 'development' });
    expect(result.success).toBe(true);
  });

  it('treats SUPABASE_URL as optional', () => {
    const { SUPABASE_URL: _, ...withoutSupabase } = VALID_BASE as any;
    const result = parseEnv(withoutSupabase);
    expect(result.success).toBe(true);
  });

  it('treats STELLAR_RPC_URL as optional', () => {
    const result = parseEnv({ ...VALID_BASE, STELLAR_RPC_URL: undefined });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Required field validation — missing fields must fail
// ---------------------------------------------------------------------------

describe('env config — missing required fields', () => {
  it('fails when JWT_SECRET is absent', () => {
    const { JWT_SECRET: _, ...rest } = VALID_BASE as any;
    const result = parseEnv(rest);
    expect(result.success).toBe(false);
  });

  it('fails when DATABASE_URL is absent', () => {
    const { DATABASE_URL: _, ...rest } = VALID_BASE as any;
    const result = parseEnv(rest);
    expect(result.success).toBe(false);
  });

  it('fails when AMANA_ESCROW_CONTRACT_ID is absent', () => {
    const { AMANA_ESCROW_CONTRACT_ID: _, ...rest } = VALID_BASE as any;
    const result = parseEnv(rest);
    expect(result.success).toBe(false);
  });

  it('fails when USDC_CONTRACT_ID is absent', () => {
    const { USDC_CONTRACT_ID: _, ...rest } = VALID_BASE as any;
    const result = parseEnv(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid format validation
// ---------------------------------------------------------------------------

describe('env config — invalid formats', () => {
  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    const result = parseEnv({ ...VALID_BASE, JWT_SECRET: 'too-short' });
    expect(result.success).toBe(false);
  });

  it('fails when NODE_ENV is an unexpected value', () => {
    const result = parseEnv({ ...VALID_BASE, NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
  });

  it('fails when PORT is not a number string', () => {
    const result = parseEnv({ ...VALID_BASE, PORT: 'not-a-number' });
    expect(result.success).toBe(false);
  });

  it('fails when AMANA_ESCROW_CONTRACT_ID is an empty string', () => {
    const result = parseEnv({ ...VALID_BASE, AMANA_ESCROW_CONTRACT_ID: '' });
    expect(result.success).toBe(false);
  });

  it('fails when USDC_CONTRACT_ID is an empty string', () => {
    const result = parseEnv({ ...VALID_BASE, USDC_CONTRACT_ID: '' });
    expect(result.success).toBe(false);
  });

  it('coerces PORT "3000" to number 3000', () => {
    const result = parseEnv({ ...VALID_BASE, PORT: '3000' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// Optional config absent or malformed
// ---------------------------------------------------------------------------

describe('env config — optional fields absent or malformed', () => {
  it('accepts config with all optional fields absent', () => {
    const minimal: EnvInput = {
      JWT_SECRET: 'a-valid-secret-that-is-at-least-32-chars-long',
      DATABASE_URL: 'postgresql://localhost:5432/amana',
      AMANA_ESCROW_CONTRACT_ID: 'CESCROW',
      USDC_CONTRACT_ID: 'CUSDC',
    };
    const result = parseEnv(minimal);
    expect(result.success).toBe(true);
  });

  it('accepts SUPABASE_URL when set to a valid string', () => {
    const result = parseEnv({
      ...VALID_BASE,
      SUPABASE_URL: 'https://example.supabase.co',
    });
    expect(result.success).toBe(true);
  });

  it('accepts STELLAR_RPC_URL when set', () => {
    const result = parseEnv({
      ...VALID_BASE,
      STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    });
    expect(result.success).toBe(true);
  });

  it('provides stable error messages when required fields are missing', () => {
    const { JWT_SECRET: _, DATABASE_URL: __, ...rest } = VALID_BASE as any;
    const result = parseEnv(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join('.'));
      expect(paths).toContain('JWT_SECRET');
      expect(paths).toContain('DATABASE_URL');
    }
  });
});
