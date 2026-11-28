import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTrades } from '../api/trades';
import type { Trade } from '../types/trade';
import TradeCard from '../components/TradeCard';

function EmptyTradesIllustration() {
  return (
    <svg
      width="160"
      height="160"
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="No trades yet"
    >
      <circle cx="80" cy="80" r="72" fill="#F0FDF4" />
      <path
        d="M80 118c0-22 12-40 32-48-2 24-14 40-32 48Z"
        fill="#86EFAC"
      />
      <path
        d="M80 118c0-22-12-40-32-48 2 24 14 40 32 48Z"
        fill="#4ADE80"
      />
      <path d="M80 118V74" stroke="#16A34A" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M80 74c-8-10-8-22 0-32 8 10 8 22 0 32Z"
        fill="#22C55E"
      />
      <rect x="44" y="118" width="72" height="8" rx="4" fill="#BBF7D0" />
    </svg>
  );
}

export default function Trades() {
  const navigate = useNavigate();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrades()
      .then((data) => {
        if (!cancelled) {
          setTrades(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load trades');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading trades…</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <EmptyTradesIllustration />
        <h2 className="mt-6 text-xl font-semibold text-gray-900">No trades yet</h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          Start your first agricultural trade to track offers, deliveries, and payments in one place.
        </p>
        <button
          type="button"
          onClick={() => navigate('/trades/new')}
          className="mt-6 rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Create your first trade
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">Trades</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>
    </div>
  );
}
