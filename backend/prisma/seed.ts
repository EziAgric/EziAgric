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

// Nigerian region reference data: 36 states + FCT, with major LGAs.
// Sourced from public-domain administrative reference data (NBS / INEC state & LGA lists).
const REGIONS: Array<{ state: string; code: string; lgas: string[] }> = [
  { state: 'Abia', code: 'AB', lgas: ['Aba North', 'Aba South', 'Umuahia North', 'Umuahia South'] },
  { state: 'Adamawa', code: 'AD', lgas: ['Yola North', 'Yola South', 'Mubi North', 'Numan'] },
  { state: 'Akwa Ibom', code: 'AK', lgas: ['Uyo', 'Eket', 'Ikot Ekpene', 'Oron'] },
  { state: 'Anambra', code: 'AN', lgas: ['Awka North', 'Awka South', 'Onitsha North', 'Nnewi North'] },
  { state: 'Bauchi', code: 'BA', lgas: ['Bauchi', 'Azare', 'Misau', 'Tafawa Balewa'] },
  { state: 'Bayelsa', code: 'BY', lgas: ['Yenagoa', 'Brass', 'Sagbama', 'Ogbia'] },
  { state: 'Benue', code: 'BE', lgas: ['Makurdi', 'Gboko', 'Otukpo', 'Vandeikya'] },
  { state: 'Borno', code: 'BO', lgas: ['Maiduguri', 'Biu', 'Bama', 'Konduga'] },
  { state: 'Cross River', code: 'CR', lgas: ['Calabar Municipal', 'Calabar South', 'Ogoja', 'Ikom'] },
  { state: 'Delta', code: 'DE', lgas: ['Warri South', 'Warri North', 'Uvwie', 'Sapele'] },
  { state: 'Ebonyi', code: 'EB', lgas: ['Abakaliki', 'Afikpo North', 'Afikpo South', 'Ezza North'] },
  { state: 'Edo', code: 'ED', lgas: ['Oredo', 'Egor', 'Ikpoba-Okha', 'Esan West'] },
  { state: 'Ekiti', code: 'EK', lgas: ['Ado-Ekiti', 'Ikere', 'Oye', 'Efon'] },
  { state: 'Enugu', code: 'EN', lgas: ['Enugu North', 'Enugu South', 'Nsukka', 'Udi'] },
  { state: 'FCT', code: 'FC', lgas: ['Abuja Municipal', 'Bwari', 'Gwagwalada', 'Kuje'] },
  { state: 'Gombe', code: 'GO', lgas: ['Gombe', 'Akko', 'Dukku', 'Billiri'] },
  { state: 'Imo', code: 'IM', lgas: ['Owerri Municipal', 'Owerri North', 'Orlu', 'Okigwe'] },
  { state: 'Jigawa', code: 'JI', lgas: ['Dutse', 'Hadejia', 'Gumel', 'Kazaure'] },
  { state: 'Kaduna', code: 'KD', lgas: ['Kaduna North', 'Kaduna South', 'Zaria', 'Kafanchan'] },
  { state: 'Kano', code: 'KN', lgas: ['Kano Municipal', 'Fagge', 'Dala', 'Gwale'] },
  { state: 'Katsina', code: 'KT', lgas: ['Katsina', 'Daura', 'Funtua', 'Malumfashi'] },
  { state: 'Kebbi', code: 'KE', lgas: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru'] },
  { state: 'Kogi', code: 'KO', lgas: ['Lokoja', 'Okene', 'Idah', 'Ankpa'] },
  { state: 'Kwara', code: 'KW', lgas: ['Ilorin West', 'Ilorin East', 'Offa', 'Kaiama'] },
  { state: 'Lagos', code: 'LA', lgas: ['Ikeja', 'Eti-Osa', 'Lagos Island', 'Surulere', 'Alimosho'] },
  { state: 'Nasarawa', code: 'NA', lgas: ['Lafia', 'Keffi', 'Akwanga', 'Karu'] },
  { state: 'Niger', code: 'NI', lgas: ['Chanchaga', 'Bida', 'Suleja', 'Kontagora'] },
  { state: 'Ogun', code: 'OG', lgas: ['Abeokuta North', 'Abeokuta South', 'Ijebu Ode', 'Sagamu'] },
  { state: 'Ondo', code: 'ON', lgas: ['Akure North', 'Akure South', 'Ondo West', 'Owo'] },
  { state: 'Osun', code: 'OS', lgas: ['Osogbo', 'Ilesa East', 'Ilesa West', 'Ede North'] },
  { state: 'Oyo', code: 'OY', lgas: ['Ibadan North', 'Ibadan South-West', 'Ogbomosho North', 'Oyo East'] },
  { state: 'Plateau', code: 'PL', lgas: ['Jos North', 'Jos South', 'Barkin Ladi', 'Pankshin'] },
  { state: 'Rivers', code: 'RI', lgas: ['Port Harcourt', 'Obio-Akpor', 'Eleme', 'Bonny'] },
  { state: 'Sokoto', code: 'SO', lgas: ['Sokoto North', 'Sokoto South', 'Tambuwal', 'Illela'] },
  { state: 'Taraba', code: 'TA', lgas: ['Jalingo', 'Wukari', 'Bali', 'Sardauna'] },
  { state: 'Yobe', code: 'YO', lgas: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru'] },
  { state: 'Zamfara', code: 'ZA', lgas: ['Gusau', 'Kaura Namoda', 'Talata Mafara', 'Anka'] },
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

async function seedRegions() {
  let lgaCount = 0;

  for (const region of REGIONS) {
    const state = await prisma.region.upsert({
      where: { code: region.code },
      update: { name: region.state },
      create: { name: region.state, code: region.code, type: 'STATE' },
    });

    for (const lga of region.lgas) {
      await prisma.region.upsert({
        where: { code: `${region.code}-${lga.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}` },
        update: { name: lga, parentId: state.id },
        create: {
          name: lga,
          code: `${region.code}-${lga.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}`,
          type: 'LGA',
          parentId: state.id,
        },
      });
      lgaCount += 1;
    }
  }

  console.log(`✓ Seeded ${REGIONS.length} states/FCT and ${lgaCount} LGAs`);
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

  // Seed Nigerian region reference data (idempotent via upsert on code)
  await seedRegions();

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
