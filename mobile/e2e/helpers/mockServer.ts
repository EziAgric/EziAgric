/**
 * Lightweight HTTP mock server for Detox E2E tests.
 *
 * Starts an in-process Express server on a fixed port (4001 in E2E) that
 * returns deterministic fixture responses for every API call the app makes.
 * Detox reverse-port-forwards 4001 → device so the app's `http://localhost:4000`
 * calls hit this server (via an env override in E2E mode).
 *
 * Usage:
 *   import { startMockServer, stopMockServer } from './mockServer';
 *   beforeAll(async () => { await startMockServer(); });
 *   afterAll(async () => { await stopMockServer(); });
 */

import * as http from 'http';

export const MOCK_PORT = 4001;

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const WALLET_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA001';
const SELLER_ADDRESS = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB002';

const FIXTURE_TRADES = [
  {
    tradeId: 'TRD-E2E-0001',
    buyerAddress: WALLET_ADDRESS,
    sellerAddress: SELLER_ADDRESS,
    amountUsdc: '5000',
    amountCngn: '5000',
    status: 'IN_TRANSIT',
    buyerLossBps: 5000,
    sellerLossBps: 5000,
    commodity: 'Maize',
    quantity: '500',
    unit: 'kg',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
  {
    tradeId: 'TRD-E2E-0002',
    buyerAddress: WALLET_ADDRESS,
    sellerAddress: SELLER_ADDRESS,
    amountUsdc: '12000',
    amountCngn: '12000',
    status: 'COMPLETED',
    buyerLossBps: 5000,
    sellerLossBps: 5000,
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-12T14:30:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth endpoints
  if (url === '/auth/challenge' && method === 'POST') {
    res.writeHead(200);
    res.end(JSON.stringify({ challenge: 'e2e-challenge-string' }));
    return;
  }

  if (url === '/auth/verify' && method === 'POST') {
    const token = buildJwt(WALLET_ADDRESS);
    res.writeHead(200);
    res.end(JSON.stringify({ token }));
    return;
  }

  if (url === '/auth/logout' && method === 'POST') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Trade list
  if (url.startsWith('/trades') && !url.includes('/TRD') && method === 'GET') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        items: FIXTURE_TRADES,
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      }),
    );
    return;
  }

  // Single trade
  if (url.match(/^\/trades\/TRD-E2E-0001/) && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify(FIXTURE_TRADES[0]));
    return;
  }

  if (url.match(/^\/trades\/TRD-E2E-0002/) && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify(FIXTURE_TRADES[1]));
    return;
  }

  // Trade stats
  if (url === '/trades/stats') {
    res.writeHead(200);
    res.end(JSON.stringify({ totalTrades: 2, totalVolume: 17000, openTrades: 1 }));
    return;
  }

  // Wallet balance
  if (url === '/wallet/balance') {
    res.writeHead(200);
    res.end(JSON.stringify({ balance: '17000', asset: 'cNGN' }));
    return;
  }

  // Feature flags
  if (url === '/api/admin/features') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        flags: {
          adminUI: { enabled: true, updatedAt: '2026-01-15T10:00:00.000Z' },
          clawbackUI: { enabled: false, updatedAt: '2026-01-15T10:00:00.000Z' },
        },
      }),
    );
    return;
  }

  // Default 200 fallback — prevents the app from crashing on unknown routes.
  res.writeHead(200);
  res.end(JSON.stringify({}));
}

function buildJwt(address: string): string {
  const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({ walletAddress: address, role: 'user', exp: 9999999999 }),
  ).toString('base64url');
  return `${h}.${p}.e2e`;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: http.Server | null = null;

export async function startMockServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = http.createServer(handleRequest);
    server.listen(MOCK_PORT, '127.0.0.1', () => {
      console.log(`[MockServer] Listening on http://127.0.0.1:${MOCK_PORT}`);
      resolve();
    });
    server.on('error', reject);
  });
}

export async function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) { resolve(); return; }
    server.close(() => {
      server = null;
      resolve();
    });
  });
}
