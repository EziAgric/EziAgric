import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isValidStellarAddress } from "@/lib/stellar";
import { getPublicSellerProfile } from "@/lib/reputation";
import { TrustScoreBreakdown } from "@/components/reputation/TrustScoreBreakdown";
import { SellerReviews } from "@/components/reputation/SellerReviews";
import { CooperativeBadge } from "@/components/reputation/CooperativeBadge";
import { ShareProfileButton } from "@/components/reputation/ShareProfileButton";

type Params = { address: string };

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { address } = params;

  if (!isValidStellarAddress(address)) {
    return { title: "Seller not found" };
  }

  const profile = await getPublicSellerProfile(address);
  if (!profile) {
    return { title: "Seller not found" };
  }

  const short = truncateAddress(address);
  const title = `${short} — Seller profile`;
  const description = `Trust score ${profile.trustScore}/100 based on ${profile.completedTrades} completed trades and ${profile.reviewCount} reviews.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `/u/${address}`,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: { canonical: `/u/${address}` },
  };
}

export default async function SellerProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { address } = params;

  if (!isValidStellarAddress(address)) {
    notFound();
  }

  const profile = await getPublicSellerProfile(address);
  if (!profile) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-700">
            {truncateAddress(address).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {profile.displayName ?? truncateAddress(address)}
            </h1>
            <p className="font-mono text-sm text-gray-500">{truncateAddress(address)}</p>
          </div>
          {profile.isCooperative && <CooperativeBadge />}
        </div>
        <ShareProfileButton address={address} />
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Trust score</p>
          <p className="text-2xl font-semibold text-gray-900">{profile.trustScore}/100</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Completed trades</p>
          <p className="text-2xl font-semibold text-gray-900">{profile.completedTrades}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Reviews</p>
          <p className="text-2xl font-semibold text-gray-900">{profile.reviewCount}</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Trust score breakdown</h2>
        <TrustScoreBreakdown factors={profile.factors} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
        <SellerReviews reviews={profile.reviews} />
      </section>

      <div className="mt-8">{children}</div>

      <footer className="mt-10 border-t border-gray-200 pt-4 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">
          Back to marketplace
        </Link>
      </footer>
    </div>
  );
}
