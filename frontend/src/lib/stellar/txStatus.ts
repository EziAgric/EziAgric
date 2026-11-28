/**
 * Transaction status polling for the frontend (#422).
 *
 * After a transaction is signed and submitted, users need to know whether it
 * actually landed. The backend exposes
 * `GET /stellar/tx/:hash/status` (see `docs/api/stellar.md`), which proxies
 * Horizon and returns:
 *
 *   { status: "success" | "failed" | "pending", hash, ledger?, resultCodes?, createdAt? }
 *
 * A freshly submitted transaction can briefly 404 before Horizon ingests it;
 * the backend maps that to `{ status: "pending" }` (HTTP 404) rather than an
 * error, so we treat 404 as "keep polling" instead of a failure.
 */

import { request, ApiError } from "@/lib/api/client";
import {
  getStellarNetworkPassphrase,
  getStellarRpcUrl,
} from "@/lib/api/env";

export type TxStatus = "pending" | "success" | "failed";

export interface TxStatusResult {
  status: TxStatus;
  hash: string;
  ledger?: number;
  createdAt?: string;
  resultCodes?: { transaction: string; operations: string[] };
}

/** Stellar Expert network segment. Stellar Expert calls mainnet "public". */
export type StellarNetwork = "testnet" | "public";

export function networkFromPassphrase(passphrase: string): StellarNetwork {
  return /test/i.test(passphrase) ? "testnet" : "public";
}

/** The network the app is configured against (from the passphrase env var). */
export function getStellarNetwork(): StellarNetwork {
  return networkFromPassphrase(getStellarNetworkPassphrase());
}

/** Public explorer URL for a transaction hash. */
export function stellarExpertTxUrl(
  hash: string,
  network: StellarNetwork = getStellarNetwork(),
): string {
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(hash)}`;
}

/**
 * Look up a transaction's status once.
 *
 * `404` (not yet ingested) resolves to `{ status: "pending" }` rather than
 * throwing, so callers can simply keep polling.
 */
export async function fetchTransactionStatus(
  hash: string,
  signal?: AbortSignal,
): Promise<TxStatusResult> {
  try {
    return await request<TxStatusResult>(
      `/stellar/tx/${encodeURIComponent(hash)}/status`,
      { skipAuth: true, signal },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { status: "pending", hash };
    }
    throw error;
  }
}

export interface PollTransactionStatusOptions {
  /** Delay between polls. Defaults to 2500ms. */
  intervalMs?: number;
  /** Give up (returning the last `pending` result) after this long. Default 60s. */
  timeoutMs?: number;
  /** Cancels polling; the returned promise rejects with an AbortError. */
  signal?: AbortSignal;
  /** Injectable fetcher — used by tests. Defaults to {@link fetchTransactionStatus}. */
  fetchStatus?: (hash: string, signal?: AbortSignal) => Promise<TxStatusResult>;
  /** Called with the latest result on every poll. */
  onUpdate?: (result: TxStatusResult) => void;
}

const DEFAULT_INTERVAL_MS = 2500;
const DEFAULT_TIMEOUT_MS = 60_000;

function abortError(): Error {
  const error = new Error("Transaction status polling aborted");
  error.name = "AbortError";
  return error;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll `stellar.tx.status` until the transaction settles or the timeout
 * elapses. Resolves with the last seen result — which is `pending` on timeout
 * — and only rejects when polling is aborted or the lookup itself errors.
 */
export async function pollTransactionStatus(
  hash: string,
  options: PollTransactionStatusOptions = {},
): Promise<TxStatusResult> {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    fetchStatus = fetchTransactionStatus,
    onUpdate,
  } = options;

  const deadline = Date.now() + timeoutMs;
  let last: TxStatusResult = { status: "pending", hash };

  // Poll immediately, then wait `intervalMs` between attempts.
  for (;;) {
    if (signal?.aborted) throw abortError();

    const result = await fetchStatus(hash, signal);
    last = result;
    onUpdate?.(result);

    if (result.status !== "pending") return result;

    if (Date.now() >= deadline) return last;

    await delay(intervalMs, signal);
  }
}

/**
 * Submit a signed transaction to the Soroban RPC and return its hash.
 * Throws when the RPC reports an error or returns no hash.
 */
export async function submitSignedTransaction(
  signedXdr: string,
  options: { rpcUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const rpcUrl = options.rpcUrl ?? getStellarRpcUrl();
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: { transaction: signedXdr },
    }),
  });

  const result = await response.json();

  if (result?.error) {
    throw new Error(result.error.message || "Transaction submission failed");
  }

  const hash = result?.result?.hash;
  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error("Transaction submission returned no hash");
  }

  return hash;
}
