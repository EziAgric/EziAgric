import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { Server as StellarServer } from '@stellar/stellar-sdk';

const router = Router();

const PROBE_TIMEOUT_MS = 2000;

type DependencyStatus = 'ok' | 'unhealthy';

interface DependencyResult {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function probe(name: string, fn: () => Promise<unknown>): Promise<DependencyResult> {
  const start = Date.now();
  try {
    await withTimeout(fn(), PROBE_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkSupabase(): Promise<DependencyResult> {
  return probe('supabase', async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }
    const client = createClient(url, key);
    const { error } = await client.from('users').select('id').limit(1);
    if (error) {
      throw new Error(error.message);
    }
  });
}

async function checkStellar(): Promise<DependencyResult> {
  return probe('stellar', async () => {
    const rpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
    const server = new StellarServer(rpcUrl);
    await server.getHealth();
  });
}

async function checkRedis(): Promise<DependencyResult> {
  return probe('redis', async () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('Redis URL not configured');
    }
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: PROBE_TIMEOUT_MS,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected PING response: ${pong}`);
      }
    } finally {
      client.disconnect();
    }
  });
}

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

router.get('/deep', async (_req: Request, res: Response) => {
  const [supabase, stellar, redis] = await Promise.all([
    checkSupabase(),
    checkStellar(),
    checkRedis(),
  ]);

  const dependencies = { supabase, stellar, redis };
  const healthy = Object.values(dependencies).every((dep) => dep.status === 'ok');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    dependencies,
  });
});

export default router;
