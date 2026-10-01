'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface ListingImage {
  url: string;
  alt: string;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  availability: number;
  images: ListingImage[];
  seller: {
    id: string;
    name: string;
    rating: number;
    trades: number;
  };
  priceHistoryHint: string;
}

const LISTINGS: Record<string, Listing> = {
  '1': {
    id: '1',
    title: 'Organic Arabica Coffee Beans',
    description:
      'Freshly harvested single-origin Arabica beans, roasted to order. Ideal for specialty cafes and home brewers alike.',
    price: 12.5,
    currency: 'USD',
    availability: 40,
    images: [
      { url: '/images/coffee-1.jpg', alt: 'Bag of roasted Arabica coffee beans' },
      { url: '/images/coffee-2.jpg', alt: 'Close-up of coffee beans in a burlap sack' },
      { url: '/images/coffee-3.jpg', alt: 'Coffee beans being poured into a grinder' },
    ],
    seller: { id: 'seller-1', name: 'Highland Roasters', rating: 4.8, trades: 132 },
    priceHistoryHint: 'Price has been stable over the last 30 days.',
  },
};

function getListing(id: string): Listing | undefined {
  return LISTINGS[id];
}

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const listing = useMemo(() => getListing(params?.id ?? ''), [params?.id]);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  if (!listing) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-gray-600">
          The listing you are looking for is unavailable or has been removed.
        </p>
        <Link
          href="/marketplace"
          className="mt-6 inline-block rounded-md bg-black px-4 py-2 text-white"
        >
          Back to marketplace
        </Link>
      </main>
    );
  }

  const maxQuantity = Math.max(1, listing.availability);
  const boundedQuantity = Math.min(Math.max(1, quantity), maxQuantity);

  const handleStartTrade = () => {
    const query = new URLSearchParams({
      listingId: listing.id,
      quantity: String(boundedQuantity),
      price: String(listing.price),
      currency: listing.currency,
    });
    router.push(`/trades/create?${query.toString()}`);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
        <Link href="/marketplace" className="hover:underline">
          Marketplace
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-gray-700">{listing.title}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-label="Listing gallery">
          <div className="overflow-hidden rounded-lg border bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.images[activeImage]?.url}
              alt={listing.images[activeImage]?.alt ?? listing.title}
              className="h-80 w-full object-cover"
            />
          </div>
          <ul className="mt-3 flex gap-3" role="list">
            {listing.images.map((image, index) => (
              <li key={image.url}>
                <button
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Show image: ${image.alt}`}
                  aria-current={index === activeImage}
                  className={`overflow-hidden rounded-md border-2 ${
                    index === activeImage ? 'border-black' : 'border-transparent'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="h-16 w-16 object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Listing details">
          <h1 className="text-2xl font-semibold">{listing.title}</h1>
          <p className="mt-2 text-3xl font-bold">
            {listing.currency} {listing.price.toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-gray-500">{listing.priceHistoryHint}</p>

          <p className="mt-4 text-gray-700">{listing.description}</p>

          <div className="mt-6 rounded-lg border p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Seller
            </h2>
            <p className="mt-1 font-medium">{listing.seller.name}</p>
            <p className="text-sm text-gray-600">
              {listing.seller.rating.toFixed(1)} ★ · {listing.seller.trades} trades
            </p>
          </div>

          <div className="mt-6">
            <label htmlFor="quantity" className="block text-sm font-medium">
              Quantity
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={boundedQuantity <= 1}
                aria-label="Decrease quantity"
                className="h-9 w-9 rounded-md border disabled:opacity-40"
              >
                −
              </button>
              <input
                id="quantity"
                type="number"
                min={1}
                max={maxQuantity}
                value={boundedQuantity}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isNaN(next)) return;
                  setQuantity(Math.min(Math.max(1, next), maxQuantity));
                }}
                className="h-9 w-20 rounded-md border px-2 text-center"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                disabled={boundedQuantity >= maxQuantity}
                aria-label="Increase quantity"
                className="h-9 w-9 rounded-md border disabled:opacity-40"
              >
                +
              </button>
              <span className="ml-2 text-sm text-gray-500">
                {listing.availability} available
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartTrade}
            className="mt-6 w-full rounded-md bg-black px-4 py-3 font-medium text-white"
          >
            Start trade
          </button>
        </section>
      </div>
    </main>
  );
}
