/**
 * Configuration for the Soroban event listener service.
 * All values are overridable via environment variables.
 */

import { env } from './env';

export interface EventListenerConfig {
  /** Soroban RPC endpoint URL */
  rpcUrl: string;
  /** Target contract ID to listen for events */
  contractId: string;
  /** Polling interval in milliseconds (default: 10000 for testnet) */
  pollIntervalMs: number;
  /** Initial backoff delay in milliseconds */
  backoffInitialMs: number;
  /** Maximum backoff delay in milliseconds */
  backoffMaxMs: number;
  /** Maximum number of processed ledgers to keep in memory */
  processedLedgersCacheSize: number;
  /** Maximum number of outbox processing attempts before dead-lettering */
  outboxMaxAttempts: number;
}

/**
 * Configuration for the event listener backfill command
 * (`npm run events:backfill -- --from <ledger> --to <ledger>`).
 */
export interface EventBackfillConfig {
  /** First ledger (inclusive) to re-ingest */
  fromLedger: number;
  /** Last ledger (inclusive) to re-ingest */
  toLedger: number;
  /** Number of ledgers fetched per RPC page */
  batchSize: number;
  /** When true, log progress for each processed ledger */
  verbose: boolean;
}

const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';
const DEFAULT_BACKFILL_BATCH_SIZE = 100;

export function getEventListenerConfig(): EventListenerConfig {
  return {
    rpcUrl: env.STELLAR_RPC_URL || DEFAULT_RPC_URL,
    contractId: env.AMANA_ESCROW_CONTRACT_ID,
    pollIntervalMs: env.EVENT_POLL_INTERVAL_MS,
    backoffInitialMs: env.BACKOFF_INITIAL_MS,
    backoffMaxMs: env.BACKOFF_MAX_MS,
    processedLedgersCacheSize: env.PROCESSED_LEDGERS_CACHE_SIZE,
    outboxMaxAttempts: env.EVENT_OUTBOX_MAX_ATTEMPTS,
  };
}

/**
 * Parse and validate the `--from` / `--to` ledger range for the backfill
 * command. Throws on missing, non-numeric, or inverted ranges so the CLI
 * fails fast before touching the database.
 */
export function getEventBackfillConfig(
  argv: string[] = process.argv.slice(2),
): EventBackfillConfig {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const value = inlineValue ?? argv[i + 1];
    if (inlineValue === undefined) i += 1;
    args.set(rawKey, value ?? '');
  }

  const parseLedger = (name: string): number => {
    const raw = args.get(name);
    if (raw === undefined || raw === '') {
      throw new Error(`Missing required option --${name} <ledger>`);
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid --${name} value: ${raw} (expected a non-negative integer)`);
    }
    return value;
  };

  const fromLedger = parseLedger('from');
  const toLedger = parseLedger('to');
  if (fromLedger > toLedger) {
    throw new Error(`Invalid range: --from ${fromLedger} is greater than --to ${toLedger}`);
  }

  const batchSizeRaw = args.get('batch-size');
  const batchSize = batchSizeRaw ? Number(batchSizeRaw) : DEFAULT_BACKFILL_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch-size value: ${batchSizeRaw}`);
  }

  return {
    fromLedger,
    toLedger,
    batchSize,
    verbose: args.has('verbose'),
  };
}
