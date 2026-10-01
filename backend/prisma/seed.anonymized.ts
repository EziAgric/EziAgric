/**
 * Anonymized, production-shaped staging seed.
 *
 * Usage: SEED_TIER=smoke|perf|soak SEED=42 npx tsx prisma/seed.anonymized.ts [--dry-run]
 *
 * - Deterministic: same SEED + tier => byte-identical dataset (seeded PRNG, fixed epoch).
 * - Zero real PII: all names are synthetic; output is scanned before insert.
 * - Golden invariants (referential integrity) are asserted after insert.
 */

import { PrismaClient, TradeStatus, DisputeStatus, GoalStatus } from '@prisma/client';
import * as crypto from 'crypto';

export const TIERS = {
  smoke: { users: 50, trades: 200 },
  perf: { users: 5_000, trades: 50_000 },
  soak: { users: 20_000, trades: 250_000 },
} as const;
export type Tier = keyof typeof TIERS;

// Fixed epoch so timestamps do not depend on wall clock.
const EPOCH = Date.UTC(2025, 0, 1);

export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Synthetic name parts across scripts (Latin, Yoruba diacritics, Hausa, Arabic, Han) to catch unicode bugs.
const SYLLABLES = ['ba', 'ko', 'lé', 'mị', 'sa', 'ɗan', 'ọ', 'ru', 'fí', 'zu', 'نا', 'رو', '明', '华'];
const STATUS_WEIGHTS: [TradeStatus, number][] = [
  [TradeStatus.COMPLETED, 0.55],
  [TradeStatus.FUNDED, 0.12],
  [TradeStatus.DELIVERED, 0.1],
  [TradeStatus.CREATED, 0.08],
  [TradeStatus.PENDING_SIGNATURE, 0.05],
  [TradeStatus.CANCELLED, 0.06],
  [TradeStatus.DISPUTED, 0.04],
];

export function generate(tier: Tier, seed: number) {
  const rand = prng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const hex = (n: number) => crypto.createHash('sha256').update(`${seed}:${n}`).digest('hex');
  const { users: userCount, trades: tradeCount } = TIERS[tier];

  const users = Array.from({ length: userCount }, (_, i) => {
    const name = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => pick(SYLLABLES)).join('');
    return { walletAddress: `gsynth${hex(i).slice(0, 50)}`, displayName: `Synth ${name} ${i}` };
  });

  // Power-law activity: a few heavy traders drive pagination depth.
  const activeUser = () => users[Math.floor(Math.pow(rand(), 3) * users.length)].walletAddress;
  const statusOf = () => {
    let r = rand();
    for (const [s, w] of STATUS_WEIGHTS) if ((r -= w) <= 0) return s;
    return TradeStatus.COMPLETED;
  };

  const trades = Array.from({ length: tradeCount }, (_, i) => {
    const buyerAddress = activeUser();
    let sellerAddress = activeUser();
    if (sellerAddress === buyerAddress) sellerAddress = users[(users.findIndex((u) => u.walletAddress === buyerAddress) + 1) % users.length].walletAddress;
    // Log-normal-ish amounts: most trades small, long tail of large ones.
    const amount = Math.exp(3 + rand() * 6).toFixed(2);
    const buyerLossBps = pick([5000, 5000, 5000, 6000, 7000]);
    return {
      tradeId: `trade-synth-${String(i).padStart(7, '0')}`,
      buyerAddress,
      sellerAddress,
      amountUsdc: amount,
      status: statusOf(),
      buyerLossBps,
      sellerLossBps: 10000 - buyerLossBps,
      createdAt: new Date(EPOCH + i * 60_000),
    };
  });

  const disputes = trades
    .filter((t) => t.status === TradeStatus.DISPUTED)
    .map((t, i) => ({
      tradeId: t.tradeId,
      initiator: t.buyerAddress,
      reason: pick(['Goods damaged in transit', 'Partial delivery', 'Quality below standard', 'Late delivery']),
      status: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW][i % 2],
    }));

  const vaults = users.slice(0, Math.ceil(userCount / 10)).map((u, i) => ({
    vaultId: `vault-synth-${String(i).padStart(6, '0')}`,
    ownerAddress: u.walletAddress,
    balanceUsdc: (rand() * 5000).toFixed(2),
  }));
  const goals = vaults.map((v, i) => ({
    goalId: `goal-synth-${String(i).padStart(6, '0')}`,
    vaultId: v.vaultId,
    ownerAddress: v.ownerAddress,
    deadline: new Date(EPOCH + (30 + i) * 86_400_000),
    targetAmountUsdc: '1000.00',
    currentAmountUsdc: (rand() * 1000).toFixed(2),
    status: [GoalStatus.ACTIVE, GoalStatus.ACTIVE, GoalStatus.COMPLETED, GoalStatus.CANCELLED][i % 4],
  }));

  return { users, trades, disputes, vaults, goals };
}
export type Dataset = ReturnType<typeof generate>;

// Rejects anything that looks like real PII: emails, phone numbers, card/ID numbers, non-synthetic names.
const PII_PATTERNS: [string, RegExp][] = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.]+/],
  ['phone', /\+?\d[\d\s-]{8,}\d/],
  ['long-digit-id', /\b\d{11,}\b/],
];
export function scanForPii(data: Dataset): string[] {
  const hits: string[] = [];
  const freeText = [...data.users.map((u) => u.displayName), ...data.disputes.map((d) => d.reason)].join('\n');
  for (const [label, re] of PII_PATTERNS) if (re.test(freeText)) hits.push(label);
  for (const u of data.users) if (!u.displayName.startsWith('Synth ')) hits.push(`non-synthetic name: ${u.displayName}`);
  return hits;
}

export function checksum(data: Dataset): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function assertInvariants(prisma: PrismaClient, data: Dataset): Promise<void> {
  const [users, trades, orphanTrades, orphanDisputes, orphanGoals] = await Promise.all([
    prisma.user.count(),
    prisma.trade.count(),
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Trade" t WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."walletAddress" = t."buyerAddress") OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u."walletAddress" = t."sellerAddress")`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Dispute" d WHERE NOT EXISTS (SELECT 1 FROM "Trade" t WHERE t."tradeId" = d."tradeId")`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Goal" g WHERE NOT EXISTS (SELECT 1 FROM "Vault" v WHERE v."vaultId" = g."vaultId")`,
  ]);
  const failures = [
    users !== data.users.length && `user count ${users} != ${data.users.length}`,
    trades !== data.trades.length && `trade count ${trades} != ${data.trades.length}`,
    Number(orphanTrades[0].n) > 0 && 'trades reference missing users',
    Number(orphanDisputes[0].n) > 0 && 'disputes reference missing trades',
    Number(orphanGoals[0].n) > 0 && 'goals reference missing vaults',
  ].filter(Boolean);
  if (failures.length) throw new Error(`Seed invariants failed: ${failures.join('; ')}`);
}

export async function main(): Promise<void> {
  const tier = (process.env.SEED_TIER ?? 'smoke') as Tier;
  if (!(tier in TIERS)) throw new Error(`Unknown SEED_TIER "${tier}" (expected ${Object.keys(TIERS).join('|')})`);
  const seed = Number(process.env.SEED ?? 42);

  const data = generate(tier, seed);
  const pii = scanForPii(data);
  if (pii.length) throw new Error(`PII scanner rejected dataset: ${pii.join(', ')}`);
  console.log(`[seed] tier=${tier} seed=${seed} sha256=${checksum(data)}`);
  if (process.argv.includes('--dry-run')) return;

  const prisma = new PrismaClient();
  try {
    await prisma.tradeEvidence.deleteMany();
    await prisma.deliveryManifest.deleteMany();
    await prisma.dispute.deleteMany();
    await prisma.processedEvent.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.vault.deleteMany();
    await prisma.trade.deleteMany();
    await prisma.user.deleteMany();

    const BATCH = 5_000;
    const insert = async <T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) => {
      for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH));
    };
    await insert(data.users, (c) => prisma.user.createMany({ data: c }));
    await insert(data.trades, (c) => prisma.trade.createMany({ data: c }));
    await insert(data.disputes, (c) => prisma.dispute.createMany({ data: c }));
    await insert(data.vaults, (c) => prisma.vault.createMany({ data: c }));
    const ids = new Map((await prisma.user.findMany({ select: { id: true, walletAddress: true } })).map((u) => [u.walletAddress, u.id]));
    await insert(data.goals, (c) =>
      prisma.goal.createMany({ data: c.map(({ ownerAddress, ...g }) => ({ ...g, userId: ids.get(ownerAddress)! })) }),
    );

    await assertInvariants(prisma, data);
    console.log(`[seed] loaded ${data.users.length} users, ${data.trades.length} trades; invariants OK`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
