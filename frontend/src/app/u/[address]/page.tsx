import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface TrustFactor {
  label: string;
  score: number;
  weight: number;
  description: string;
}

interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface SellerProfile {
  address: string;
  displayName: string;
  trustScore: number;
  completedTrades: number;
  isCooperative: boolean;
  cooperativeName?: string;
  factors: TrustFactor[];
  reviews: Review[];
}

const STELLAR_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

function isValidAddress(address: string): boolean {
  return STELLAR_ADDRESS_PATTERN.test(address);
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

async function getSellerProfile(address: string): Promise<SellerProfile | null> {
  if (!isValidAddress(address)) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (!apiBase) return null;

  try {
    const res = await fetch(`${apiBase}/sellers/${address}/public`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SellerProfile>;
    if (!data || typeof data.trustScore !== 'number') return null;
    return {
      address,
      displayName: data.displayName ?? shortenAddress(address),
      trustScore: data.trustScore,
      completedTrades: data.completedTrades ?? 0,
      isCooperative: Boolean(data.isCooperative),
      cooperativeName: data.cooperativeName,
      factors: Array.isArray(data.factors) ? data.factors : [],
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const profile = await getSellerProfile(params.address);
  const name = profile?.displayName ?? shortenAddress(params.address);
  const title = `${name} — Seller Profile`;
  const description = profile
    ? `Trust score ${profile.trustScore}/100 with ${profile.completedTrades} completed trades on Stellar.`
    : 'Public seller profile on Stellar.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function SellerProfilePage({
  params,
}: {
  params: { address: string };
}) {
  const profile = await getSellerProfile(params.address);
  if (!profile) notFound();

  const shareUrl = `https://stellar.example/u/${profile.address}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{profile.displayName}</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">
            {shortenAddress(profile.address)}
          </p>
        </div>
        {profile.isCooperative && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
            <span aria-hidden="true">✓</span>
            {profile.cooperativeName
              ? `Cooperative: ${profile.cooperativeName}`
              : 'Cooperative member'}
          </span>
        )}
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Trust score</p>
          <p className="text-3xl font-bold">{profile.trustScore}/100</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">Completed trades</p>
          <p className="text-3xl font-bold">{profile.completedTrades}</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Trust score breakdown</h2>
        {profile.factors.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            No trust factors available yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {profile.factors.map((factor) => (
              <li key={factor.label} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{factor.label}</span>
                  <span className="text-sm text-gray-500">
                    {factor.score}/100 · weight {Math.round(factor.weight * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{factor.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {profile.reviews.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No reviews yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {profile.reviews.map((review) => (
              <li key={review.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-gray-500">
                    {shortenAddress(review.author)}
                  </span>
                  <span className="text-sm">{review.rating}/5</span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{review.comment}</p>
                <time className="mt-1 block text-xs text-gray-400">
                  {new Date(review.createdAt).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10">
        <Link
          href={`/u/${profile.address}`}
          className="text-sm text-blue-600 hover:underline"
          aria-label="Share this seller profile"
        >
          Share profile link: {shareUrl}
        </Link>
      </footer>
    </main>
  );
}
