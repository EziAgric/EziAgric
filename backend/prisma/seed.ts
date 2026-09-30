import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Demo seed for the pilot walkthrough.
 *
 * Idempotent: every record is upserted on a stable unique key, so the script
 * can be re-run safely without duplicating data.
 *
 * Demo accounts (wallet addresses are stored lowercase):
 *   - Alice   gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k  (buyer)
 *   - Bob     gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e  (seller)
 *   - Charlie gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l  (seller)
 *   - Dana    gd1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o  (buyer)
 *
 * Cooperatives:
 *   - Green Valley Cooperative (Alice, Bob)
 *   - Sunrise Farmers Cooperative (Charlie, Dana)
 */

const DEMO_USERS = [
  { walletAddress: 'gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k', displayName: 'Alice' },
  { walletAddress: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e', displayName: 'Bob' },
  { walletAddress: 'gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l', displayName: 'Charlie' },
  { walletAddress: 'gd1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o', displayName: 'Dana' },
];

const DEMO_COOPERATIVES = [
  {
    id: 'coop_green_valley',
    name: 'Green Valley Cooperative',
    members: ['gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k', 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e'],
  },
  {
    id: 'coop_sunrise_farmers',
    name: 'Sunrise Farmers Cooperative',
    members: ['gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l', 'gd1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o'],
  },
];

// One trade per status so the walkthrough can show every state.
const DEMO_TRADES = [
  {
    tradeId: 'trade_001',
    buyerAddress: 'gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k',
    sellerAddress: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e',
    amountUsdc: '1000.50',
    status: 'CREATED',
  },
  {
    tradeId: 'trade_002',
    buyerAddress: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e',
    sellerAddress: 'gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l',
    amountUsdc: '500.25',
    status: 'FUNDED',
  },
  {
    tradeId: 'trade_003',
    buyerAddress: 'gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l',
    sellerAddress: 'gd1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o',
    amountUsdc: '250.00',
    status: 'SHIPPED',
  },
  {
    tradeId: 'trade_004',
    buyerAddress: 'gd1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o',
    sellerAddress: 'gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k',
    amountUsdc: '750.75',
    status: 'DELIVERED',
  },
  {
    tradeId: 'trade_005',
    buyerAddress: 'gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k',
    sellerAddress: 'gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l',
    amountUsdc: '320.00',
    status: 'COMPLETED',
  },
  {
    tradeId: 'trade_006',
    buyerAddress: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e',
    sellerAddress: 'gd1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o',
    amountUsdc: '410.10',
    status: 'DISPUTED',
  },
];

async function main() {
  console.log('Starting demo database seed...');

  // Users (idempotent upsert on walletAddress)
  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { walletAddress: user.walletAddress },
      update: { displayName: user.displayName },
      create: user,
    });
  }
  console.log(`✓ Upserted ${DEMO_USERS.length} demo users`);

  // Cooperatives (idempotent upsert on id)
  for (const coop of DEMO_COOPERATIVES) {
    await prisma.cooperative.upsert({
      where: { id: coop.id },
      update: { name: coop.name, members: coop.members },
      create: coop,
    });
  }
  console.log(`✓ Upserted ${DEMO_COOPERATIVES.length} demo cooperatives`);

  // Trades (idempotent upsert on tradeId)
  for (const trade of DEMO_TRADES) {
    await prisma.trade.upsert({
      where: { tradeId: trade.tradeId },
      update: trade,
      create: trade,
    });
  }
  console.log(`✓ Upserted ${DEMO_TRADES.length} demo trades (all statuses)`);

  // One active dispute with evidence placeholders
  const dispute = await prisma.dispute.upsert({
    where: { tradeId: 'trade_006' },
    update: {
      initiator: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e',
      reason: 'Item not received as described',
      status: 'UNDER_REVIEW',
      evidence: [
        { type: 'photo', url: 'ipfs://placeholder-evidence-photo-1' },
        { type: 'receipt', url: 'ipfs://placeholder-evidence-receipt-1' },
      ],
    },
    create: {
      tradeId: 'trade_006',
      initiator: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e',
      reason: 'Item not received as described',
      status: 'UNDER_REVIEW',
      evidence: [
        { type: 'photo', url: 'ipfs://placeholder-evidence-photo-1' },
        { type: 'receipt', url: 'ipfs://placeholder-evidence-receipt-1' },
      ],
    },
  });
  console.log('✓ Upserted 1 active dispute with evidence placeholders');

  console.log('\n✅ Demo database seed completed successfully!');
  console.log('Demo accounts:', DEMO_USERS.map((u) => `${u.displayName} (${u.walletAddress})`).join(', '));
  console.log('Demo dispute:', dispute.tradeId);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
