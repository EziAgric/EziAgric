import Head from 'next/head';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Listing {
  id: string;
  commodity: string;
  price: number;
  quantity: number;
  unit: string;
  sellerName: string;
  sellerTrustScore: number;
}

const OG_TITLE = 'Public Marketplace | AgriTrust';
const OG_DESCRIPTION =
  'Browse agricultural commodity listings — prices, quantities, and verified seller trust scores. No account or wallet required to explore.';

function TrustBadge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const tone =
    pct >= 80 ? 'bg-green-100 text-green-800' : pct >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      Trust {pct.toFixed(0)}
    </span>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900">{listing.commodity}</h3>
          <TrustBadge score={listing.sellerTrustScore} />
        </div>
        <p className="mt-1 text-sm text-gray-500">Seller: {listing.sellerName}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-gray-500">Price</dt>
            <dd className="font-medium text-gray-900">${listing.price.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Quantity</dt>
            <dd className="font-medium text-gray-900">
              {listing.quantity} {listing.unit}
            </dd>
          </div>
        </dl>
      </div>
      <Link
        href="/connect"
        className="mt-4 inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Connect wallet to trade
      </Link>
    </div>
  );
}

export default function PublicMarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/marketplace/listings');
        if (!res.ok) throw new Error('Failed to load listings');
        const data = (await res.json()) as Listing[];
        if (!cancelled) setListings(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Head>
        <title>{OG_TITLE}</title>
        <meta name="description" content={OG_DESCRIPTION} />
        <meta property="og:title" content={OG_TITLE} />
        <meta property="og:description" content={OG_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="/marketplace" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={OG_TITLE} />
        <meta name="twitter:description" content={OG_DESCRIPTION} />
      </Head>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Public Marketplace</h1>
          <p className="mt-2 text-gray-600">
            Browse commodity listings without an account. Connect a wallet when you are ready to trade.
          </p>
        </header>

        {loading && <p className="text-gray-500">Loading listings…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="text-gray-500">No listings available yet.</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </main>
    </>
  );
}
