/**
 * staging-synthetic-probe.ts
 *
 * Synthetic probe covering the core escrow journey against a live staging
 * deployment on Stellar testnet: auth -> create trade -> fund (deposit) ->
 * confirm delivery -> release -> status poll. Exits non-zero on the first
 * failed step so it can gate CI/scheduled runs; see
 * docs/synthetic-probes-policy.md for the operating policy (schedule, flake
 * tolerance, account rotation).
 *
 * Usage:
 *   STAGING_URL=https://staging.example.com \
 *   SYNTHETIC_PROBE_BUYER_SECRET=S... \
 *   SYNTHETIC_PROBE_SELLER_SECRET=S... \
 *   STELLAR_RPC_URL=https://soroban-testnet.stellar.org \
 *   npx tsx scripts/staging-synthetic-probe.ts
 *
 * Exit codes:
 *   0 — every step of the journey succeeded
 *   1 — a step failed (see stdout for which one and the category)
 *
 * Each run appends one JSON line to `synthetic-probe-results.jsonl` (path
 * overridable via SYNTHETIC_PROBE_RESULTS_FILE) so a dashboard can chart
 * step durations and pass/fail trends over time.
 */

import { appendFileSync } from "fs";
import * as StellarSdk from "@stellar/stellar-sdk";

type StepCategory = "infra" | "app";

interface StepResult {
  step: string;
  ok: boolean;
  durationMs: number;
  category?: StepCategory;
  error?: string;
}

const STAGING_URL = process.env.STAGING_URL || process.env.BACKEND_URL || "http://localhost:4000";
const RPC_URL = process.env.STELLAR_RPC_URL || process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET;
const RESULTS_FILE = process.env.SYNTHETIC_PROBE_RESULTS_FILE || "synthetic-probe-results.jsonl";

const buyerSecret = process.env.SYNTHETIC_PROBE_BUYER_SECRET;
const sellerSecret = process.env.SYNTHETIC_PROBE_SELLER_SECRET;

if (!buyerSecret || !sellerSecret) {
  console.error(
    "SYNTHETIC_PROBE_BUYER_SECRET and SYNTHETIC_PROBE_SELLER_SECRET must both be set " +
      "(dedicated low-value testnet accounts — see docs/synthetic-probes-policy.md#accounts).",
  );
  process.exit(1);
}

const buyerKeypair = StellarSdk.Keypair.fromSecret(buyerSecret);
const sellerKeypair = StellarSdk.Keypair.fromSecret(sellerSecret);

const results: StepResult[] = [];

async function step<T>(
  name: string,
  category: StepCategory,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const value = await fn();
    results.push({ step: name, ok: true, durationMs: performance.now() - start });
    console.log(`  ✓ ${name} (${Math.round(performance.now() - start)}ms)`);
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      step: name,
      ok: false,
      durationMs: performance.now() - start,
      category,
      error: message,
    });
    console.error(`  ✗ ${name}: ${message}`);
    throw error;
  }
}

async function authenticate(keypair: StellarSdk.Keypair): Promise<string> {
  const challengeRes = await fetch(`${STAGING_URL}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: keypair.publicKey() }),
  });
  if (!challengeRes.ok) {
    throw new Error(`/auth/challenge returned HTTP ${challengeRes.status}`);
  }
  const { challenge } = (await challengeRes.json()) as { challenge: string };

  const signature = keypair.sign(Buffer.from(challenge, "utf8")).toString("base64");

  const verifyRes = await fetch(`${STAGING_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: keypair.publicKey(), signedChallenge: signature }),
  });
  if (!verifyRes.ok) {
    throw new Error(`/auth/verify returned HTTP ${verifyRes.status}`);
  }
  const { token } = (await verifyRes.json()) as { token: string };
  return token;
}

async function main() {
  console.log("===============================================================");
  console.log("  Amana — Staging Synthetic Probe (auth -> create -> deposit -> release)");
  console.log("===============================================================");
  console.log(`Target: ${STAGING_URL}`);
  console.log(`RPC:    ${RPC_URL}`);
  console.log("");

  const rpcServer = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });

  const buyerToken = await step("auth: buyer challenge/verify", "infra", () => authenticate(buyerKeypair));

  const trade = await step("trade: create", "app", async () => {
    const res = await fetch(`${STAGING_URL}/trades`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        sellerAddress: sellerKeypair.publicKey(),
        amountUsdc: "1",
        description: "synthetic probe trade - safe to ignore",
      }),
    });
    if (!res.ok) {
      throw new Error(`POST /trades returned HTTP ${res.status}`);
    }
    return (await res.json()) as { tradeId: string; id?: string };
  });

  const tradeId = trade.tradeId ?? trade.id;
  if (!tradeId) {
    throw new Error("Trade creation response did not include a trade id");
  }

  const unsignedXdr = await step("trade: build deposit tx", "app", async () => {
    const res = await fetch(`${STAGING_URL}/trades/${tradeId}/deposit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    if (!res.ok) {
      throw new Error(`POST /trades/:id/deposit returned HTTP ${res.status}`);
    }
    const { unsignedXdr: xdr } = (await res.json()) as { unsignedXdr: string };
    return xdr;
  });

  await step("chain: sign + submit deposit", "infra", async () => {
    const tx = StellarSdk.TransactionBuilder.fromXDR(unsignedXdr, NETWORK_PASSPHRASE);
    tx.sign(buyerKeypair);
    const sendResult = await rpcServer.sendTransaction(tx);
    if (sendResult.status === "ERROR") {
      throw new Error(`Deposit submission rejected: ${JSON.stringify(sendResult.errorResult)}`);
    }

    // Poll until the deposit transaction leaves the RPC's pending queue.
    let getResult = await rpcServer.getTransaction(sendResult.hash);
    const deadline = Date.now() + 30_000;
    while (getResult.status === "NOT_FOUND" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getResult = await rpcServer.getTransaction(sendResult.hash);
    }
    if (getResult.status !== "SUCCESS") {
      throw new Error(`Deposit transaction did not succeed on-chain: ${getResult.status}`);
    }
  });

  await step("trade: status poll (expect FUNDED)", "app", async () => {
    const deadline = Date.now() + 30_000;
    let status: string | undefined;
    while (Date.now() < deadline) {
      const res = await fetch(`${STAGING_URL}/trades/${tradeId}`, {
        headers: { Authorization: `Bearer ${buyerToken}` },
      });
      if (!res.ok) {
        throw new Error(`GET /trades/:id returned HTTP ${res.status}`);
      }
      const body = (await res.json()) as { status: string };
      status = body.status;
      if (status === "FUNDED") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`Trade never reached FUNDED (last seen: ${status})`);
  });

  const sellerToken = await step("auth: seller challenge/verify", "infra", () => authenticate(sellerKeypair));

  await step("trade: confirm delivery", "app", async () => {
    const res = await fetch(`${STAGING_URL}/trades/${tradeId}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    if (!res.ok) {
      throw new Error(`POST /trades/:id/confirm returned HTTP ${res.status}`);
    }
  });

  await step("trade: release funds", "app", async () => {
    const res = await fetch(`${STAGING_URL}/trades/${tradeId}/release`, {
      method: "POST",
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    if (!res.ok) {
      throw new Error(`POST /trades/:id/release returned HTTP ${res.status}`);
    }
  });

  console.log("");
  console.log("All synthetic probe steps passed.");
}

async function notifyAlertWebhook(failed: StepResult) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "synthetic_probe_failure",
        severity: "critical",
        timestamp: new Date().toISOString(),
        message: `Staging synthetic probe failed at step "${failed.step}"`,
        details: { step: failed.step, category: failed.category, error: failed.error, target: STAGING_URL },
      }),
    });
  } catch (error) {
    console.error("Failed to notify alert webhook directly (non-fatal):", error);
  }
}

function writeResultsLog() {
  const line = JSON.stringify({
    runAt: new Date().toISOString(),
    target: STAGING_URL,
    ok: results.every((r) => r.ok),
    steps: results,
  });
  try {
    appendFileSync(RESULTS_FILE, line + "\n");
  } catch (error) {
    console.error(`Could not write results log to ${RESULTS_FILE} (non-fatal):`, error);
  }
}

main()
  .then(() => {
    writeResultsLog();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("");
    console.error("🚨 [SYNTHETIC PROBE ALERT] Staging synthetic probe failed!");
    console.error(`   Timestamp: ${new Date().toISOString()}`);
    console.error(`   Target: ${STAGING_URL}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    writeResultsLog();
    const failed = results.find((r) => !r.ok);
    if (failed) {
      await notifyAlertWebhook(failed);
    }
    process.exit(1);
  });
