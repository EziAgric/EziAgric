/**
 * E2E auth helpers — seed a mock authenticated session so smoke tests skip
 * the real wallet-connect flow and land directly on TradeList.
 *
 * The app reads its token from SecureStore; Detox provides
 * `device.reverseTCPPort()` and `mockServer` for intercepting network calls.
 * Here we use the simpler approach: before launch we write the token via
 * `launchApp({ launchArgs })` which the app reads on boot.
 */

export const MOCK_WALLET_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA001';
export const MOCK_SELLER_ADDRESS = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB002';

/** Builds an unsigned JWT (alg:none) for E2E use. */
export function buildMockJwt(address: string = MOCK_WALLET_ADDRESS): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      walletAddress: address,
      role: 'user',
      // Far-future expiry so the token never expires during test runs.
      exp: Math.floor(new Date('2099-01-01').getTime() / 1000),
    }),
  ).toString('base64url');
  return `${header}.${payload}.e2e-sig`;
}

/** Launch args injected via Detox launchApp to bypass the real auth flow. */
export function mockAuthLaunchArgs(address: string = MOCK_WALLET_ADDRESS): Record<string, string> {
  return {
    E2E_MOCK_JWT: buildMockJwt(address),
    E2E_MOCK_WALLET_ADDRESS: address,
    E2E_MODE: 'true',
  };
}
