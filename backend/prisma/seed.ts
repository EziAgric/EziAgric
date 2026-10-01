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

  // Reference data (idempotent upserts)
  await seedCommodities();
  await seedRegions();

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
