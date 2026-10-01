import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

// Signs a real HS256 JWT so load runs exercise the authenticated code paths
// instead of bouncing off auth with 401s. Requires the target backend's
// JWT_SECRET to be passed as K6_JWT_SECRET (CI uses the throwaway test value).
const JWT_SECRET = __ENV.K6_JWT_SECRET || 'test-jwt-secret-value-with-minimum-length-32';
const JWT_ISSUER = __ENV.K6_JWT_ISSUER || 'amana';
const JWT_AUDIENCE = __ENV.K6_JWT_AUDIENCE || 'amana-api';

function b64url(obj) {
  return encoding.b64encode(JSON.stringify(obj), 'rawurl');
}

export function randomPublicKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let key = 'G';
  for (let i = 0; i < 55; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export function signToken(walletAddress) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    walletAddress,
    jti: `k6-${__VU}-${__ITER}-${Date.now()}`,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + 3600,
  });
  const signature = crypto.hmac('sha256', JWT_SECRET, `${header}.${payload}`, 'base64rawurl');
  return `${header}.${payload}.${signature}`;
}

export function authHeaders(walletAddress) {
  return {
    Authorization: `Bearer ${signToken(walletAddress)}`,
    'Content-Type': 'application/json',
  };
}
