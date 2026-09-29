import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Common Nigerian commodity reference data (types, units, grades).
// Kept in sync with the GET /commodities endpoint.
const COMMODITIES: Array<{
  name: string;
  slug: string;
  units: string[];
  grades: string[];
}> = [
  { name: 'Maize', slug: 'maize', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B', 'Grade C'] },
  { name: 'Rice', slug: 'rice', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B', 'Grade C'] },
  { name: 'Cassava', slug: 'cassava', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B'] },
  { name: 'Yam', slug: 'yam', units: ['crate', 'tonne'], grades: ['Grade A', 'Grade B'] },
  { name: 'Sorghum', slug: 'sorghum', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B', 'Grade C'] },
  { name: 'Millet', slug: 'millet', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B'] },
  { name: 'Cowpea', slug: 'cowpea', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B'] },
  { name: 'Groundnut', slug: 'groundnut', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B'] },
  { name: 'Soybean', slug: 'soybean', units: ['bag 50kg', 'tonne'], grades: ['Grade A', 'Grade B'] },
  { name: 'Palm Oil', slug: 'palm-oil', units: ['crate', 'tonne'], grades: ['Grade A', 'Grade B'] },
];

async function seedCommodities() {
  for (const commodity of COMMODITIES) {
    await prisma.commodity.upsert({
      where: { slug: commodity.slug },
      update: {
        name: commodity.name,
        units: commodity.units,
        grades: commodity.grades,
      },
      create: commodity,
    });
  }

  console.log(`✓ Seeded ${COMMODITIES.length} commodities`);
}

async function main() {
  console.log('Starting database seed...');

  // Clear existing data (respecting foreign key constraints)
  await prisma.dispute.deleteMany({});
  await prisma.trade.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.processedLedger.deleteMany({});

  // Create 3 demo users with properly formatted wallet addresses (lowercase)
  const user1 = await prisma.user.create({
    data: {
      walletAddress: 'gbk7d7z5qhqp3m6v2x8j1n4c5r7t9w2k', // Already lowercase
      displayName: 'Alice',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      walletAddress: 'gk8e9f2g1h3i4j5k6l7m8n9o0p1q2w3e', // Already lowercase
      displayName: 'Bob',
    },
  });

  const user3 = await prisma.user.create({
    data: {
      walletAddress: 'gr3t4y5u6i7o8p9a0s1d2f3g4h5j6k7l', // Already lowercase
      displayName: 'Charlie',
    },
  });

  console.log('✓ Created 3 demo users');

  // Create 2 demo trades
  const trade1 = await prisma.trade.create({
    data: {
      tradeId: 'trade_001',
      buyerAddress: user1.walletAddress,
      sellerAddress: user2.walletAddress,
      amountUsdc: '1000.50',
      status: 'COMPLETED',
    },
  });

  const trade2 = await prisma.trade.create({
    data: {
      tradeId: 'trade_002',
      buyerAddress: user2.walletAddress,
      sellerAddress: user3.walletAddress,
      amountUsdc: '500.25',
      status: 'DELIVERED',
    },
  });

  console.log('✓ Created 2 demo trades');

  // Create a sample dispute for trade_001
  const dispute1 = await prisma.dispute.create({
    data: {
      tradeId: trade1.tradeId,
      initiator: user1.walletAddress,
      reason: 'Item not received as described',
      status: 'UNDER_REVIEW',
    },
  });

  console.log('✓ Created 1 sample dispute');

  // Seed commodity reference data (idempotent via upsert on slug)
  await seedCommodities();

  console.log('\n✅ Database seed completed successfully!');
  console.log('Demo Users:', { user1, user2, user3 });
  console.log('Demo Trades:', { trade1, trade2 });
  console.log('Demo Dispute:', { dispute1 });
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
