import { Counter, Histogram, metrics } from "@opentelemetry/api";

const METER_NAME = "amana-backend";

export type StellarTransactionOutcome =
  | "success"
  | "rpc_error"
  | "contract_panic"
  | "xdr_invalid"
  | "network_error";

export type StellarRpcMethod =
  | "sendTransaction"
  | "simulateTransaction"
  | "prepareTransaction"
  | "getAccount";

export type StellarRpcOutcome = "success" | "error";

export type SorobanRpcHealthStatus = "up" | "down";

/**
 * Outcome of an inbound webhook signature check. `verified` is the only
 * accepting outcome; every other value is a distinct rejection reason, so an
 * alert can distinguish a misconfigured provider from a forgery attempt.
 */
export type WebhookVerificationOutcome =
  | "verified"
  | "unknown_provider"
  | "missing_secret"
  | "missing_signature"
  | "missing_timestamp"
  | "malformed_timestamp"
  | "stale_timestamp"
  | "missing_raw_body"
  | "invalid_signature";

/**
 * What happened to a payout intent. `duplicate` is the one that matters
 * operationally: a non-zero rate means retries are reaching the payout path,
 * and a zero rate after a known incident means the guard was bypassed.
 */
export type PayoutIntentOutcome =
  | "claimed"
  | "duplicate"
  | "submitted"
  | "confirmed"
  | "failed";

export interface StellarMetricsRecorder {
  recordTransactionSubmission(
    operation: string,
    outcome: StellarTransactionOutcome,
    durationMs: number,
  ): void;
  recordRpcCall(
    rpcMethod: StellarRpcMethod,
    outcome: StellarRpcOutcome,
    durationMs: number,
  ): void;
  recordSorobanRpcHealth(
    status: SorobanRpcHealthStatus,
    responseTimeMs: number,
  ): void;
}

let submissionCounter: Counter | undefined;
let submissionDuration: Histogram | undefined;
let rpcDuration: Histogram | undefined;
let sorobanRpcHealthGauge: Counter | undefined;
let sorobanRpcHealthLatency: Histogram | undefined;
let webhookVerificationCounter: Counter | undefined;
let payoutIntentCounter: Counter | undefined;
let customRecorder: StellarMetricsRecorder | null = null;

function getMeter() {
  return metrics.getMeter(METER_NAME);
}

function getSubmissionCounter(): Counter {
  if (!submissionCounter) {
    submissionCounter = getMeter().createCounter(
      "stellar_transaction_submissions_total",
      {
        description: "Total Stellar transaction submission attempts",
      },
    );
  }
  return submissionCounter;
}

function getSubmissionDuration(): Histogram {
  if (!submissionDuration) {
    submissionDuration = getMeter().createHistogram(
      "stellar_transaction_duration_ms",
      {
        description: "Stellar transaction submission latency in milliseconds",
        unit: "ms",
      },
    );
  }
  return submissionDuration;
}

function getRpcDuration(): Histogram {
  if (!rpcDuration) {
    rpcDuration = getMeter().createHistogram("stellar_rpc_duration_ms", {
      description: "Stellar Soroban RPC call latency in milliseconds",
      unit: "ms",
    });
  }
  return rpcDuration;
}

function getSorobanRpcHealthGauge(): Counter {
  if (!sorobanRpcHealthGauge) {
    sorobanRpcHealthGauge = getMeter().createCounter(
      "soroban_rpc_health_checks_total",
      {
        description: "Total Soroban RPC health check results",
      },
    );
  }
  return sorobanRpcHealthGauge;
}

function getSorobanRpcHealthLatency(): Histogram {
  if (!sorobanRpcHealthLatency) {
    sorobanRpcHealthLatency = getMeter().createHistogram(
      "soroban_rpc_health_check_duration_ms",
      {
        description: "Soroban RPC health check latency in milliseconds",
        unit: "ms",
      },
    );
  }
  return sorobanRpcHealthLatency;
}

function getWebhookVerificationCounter(): Counter {
  if (!webhookVerificationCounter) {
    webhookVerificationCounter = getMeter().createCounter(
      "webhook_signature_verifications_total",
      {
        description:
          "Inbound webhook signature verification results, labelled by provider and outcome",
      },
    );
  }
  return webhookVerificationCounter;
}

/**
 * Records one inbound webhook signature check.
 *
 * Alert on a spike in the non-`verified` outcomes: a burst of
 * `invalid_signature` is an attacker probing the endpoint, while a burst of
 * `missing_secret` means a provider was deployed without its secret.
 */
export function recordWebhookSignatureVerification(
  provider: string,
  outcome: WebhookVerificationOutcome,
): void {
  getWebhookVerificationCounter().add(1, { provider, outcome });
}

function getPayoutIntentCounter(): Counter {
  if (!payoutIntentCounter) {
    payoutIntentCounter = getMeter().createCounter("payout_intents_total", {
      description:
        "Payout intent lifecycle transitions, labelled by payout kind and outcome",
    });
  }
  return payoutIntentCounter;
}

/**
 * Records one payout intent transition.
 *
 * Alert on `outcome="duplicate"`: every count is a retry that would have been a
 * second payout without the idempotency guard.
 */
export function recordPayoutIntentOutcome(
  kind: string,
  outcome: PayoutIntentOutcome,
): void {
  getPayoutIntentCounter().add(1, { kind, outcome });
}

export function recordTransactionSubmission(
  operation: string,
  outcome: StellarTransactionOutcome,
  durationMs: number,
): void {
  if (customRecorder) {
    customRecorder.recordTransactionSubmission(operation, outcome, durationMs);
    return;
  }

  const labels = { operation, outcome };
  getSubmissionCounter().add(1, labels);
  getSubmissionDuration().record(durationMs, labels);
}

export function recordRpcCall(
  rpcMethod: StellarRpcMethod,
  outcome: StellarRpcOutcome,
  durationMs: number,
): void {
  if (customRecorder) {
    customRecorder.recordRpcCall(rpcMethod, outcome, durationMs);
    return;
  }

  getRpcDuration().record(durationMs, { rpc_method: rpcMethod, outcome });
}

export function classifySubmissionError(error: unknown): StellarTransactionOutcome {
  if (!(error instanceof Error)) {
    return "network_error";
  }

  const message = error.message;
  if (/invalid transaction xdr|xdr/i.test(message)) {
    return "xdr_invalid";
  }
  if (/contract panic/i.test(message)) {
    return "contract_panic";
  }
  if (/rpc error/i.test(message)) {
    return "rpc_error";
  }
  return "network_error";
}

export async function withRpcMetrics<T>(
  rpcMethod: StellarRpcMethod,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    recordRpcCall(rpcMethod, "success", performance.now() - start);
    return result;
  } catch (error) {
    recordRpcCall(rpcMethod, "error", performance.now() - start);
    throw error;
  }
}

export function recordSorobanRpcHealth(
  status: SorobanRpcHealthStatus,
  responseTimeMs: number,
): void {
  if (customRecorder && typeof customRecorder.recordSorobanRpcHealth === "function") {
    customRecorder.recordSorobanRpcHealth(status, responseTimeMs);
    return;
  }

  const labels = { status };
  getSorobanRpcHealthGauge().add(1, labels);
  getSorobanRpcHealthLatency().record(responseTimeMs, labels);
}

/** Vitest/Jest-only hook to assert metric emissions without a live Prometheus endpoint. */
export function __setMetricsRecorderForTests(
  recorder: StellarMetricsRecorder | null,
): void {
  customRecorder = recorder;
}

export function __resetMetricsForTests(): void {
  customRecorder = null;
  submissionCounter = undefined;
  submissionDuration = undefined;
  rpcDuration = undefined;
  sorobanRpcHealthGauge = undefined;
  sorobanRpcHealthLatency = undefined;
  webhookVerificationCounter = undefined;
  payoutIntentCounter = undefined;
}

// ---------------------------------------------------------------------------
// Quote deviation metrics
// ---------------------------------------------------------------------------

let quoteDeviationHistogram: Histogram | undefined;

function getQuoteDeviationHistogram(): Histogram {
  if (!quoteDeviationHistogram) {
    quoteDeviationHistogram = getMeter().createHistogram(
      "path_payment_quote_deviation_bps",
      {
        description: "Deviation of cached quote vs fresh quote in basis points",
        unit: "bps",
      },
    );
  }
  return quoteDeviationHistogram;
}

export function recordQuoteDeviation(
  sourceAssetCode: string,
  deviationBps: number,
): void {
  getQuoteDeviationHistogram().record(deviationBps, { source_asset: sourceAssetCode });
}

// ---------------------------------------------------------------------------
// Reconciliation drift metrics
// ---------------------------------------------------------------------------

let reconciliationDriftCounter: Counter | undefined;
let reconciliationSweepCounter: Counter | undefined;

function getReconciliationDriftCounter(): Counter {
  if (!reconciliationDriftCounter) {
    reconciliationDriftCounter = getMeter().createCounter(
      "reconciliation_drift_total",
      {
        description: "Total number of reconciliation drift detections by severity",
      },
    );
  }
  return reconciliationDriftCounter;
}

function getReconciliationSweepCounter(): Counter {
  if (!reconciliationSweepCounter) {
    reconciliationSweepCounter = getMeter().createCounter(
      "reconciliation_sweeps_total",
      {
        description: "Total reconciliation sweeps completed",
      },
    );
  }
  return reconciliationSweepCounter;
}

export function recordReconciliationDrift(
  severity: "warning" | "critical",
): void {
  getReconciliationDriftCounter().add(1, { severity });
}

export function recordReconciliationSweep(
  outcome: "success" | "failure",
): void {
  getReconciliationSweepCounter().add(1, { outcome });
}
