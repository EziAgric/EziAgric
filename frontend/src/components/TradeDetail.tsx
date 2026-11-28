import { useEffect, useState } from 'react';
import CountdownTimer from './CountdownTimer';

interface TradeDetailProps {
  tradeId: string;
}

interface Trade {
  id: string;
  seller: string;
  buyer: string;
  amount: string;
  status: string;
  evidenceDeadline: string;
}

export default function TradeDetail({ tradeId }: TradeDetailProps) {
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trades/${tradeId}`);
        if (!res.ok) {
          throw new Error(`Failed to load trade (${res.status})`);
        }
        const data = (await res.json()) as Trade;
        if (!cancelled) {
          setTrade(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load trade');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading trade…</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  if (!trade) {
    return <div className="p-6 text-gray-500">Trade not found.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Trade {trade.id}</h1>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-gray-500">Seller</dt>
        <dd>{trade.seller}</dd>

        <dt className="text-gray-500">Buyer</dt>
        <dd>{trade.buyer}</dd>

        <dt className="text-gray-500">Amount</dt>
        <dd>{trade.amount}</dd>

        <dt className="text-gray-500">Status</dt>
        <dd>{trade.status}</dd>

        <dt className="text-gray-500">Evidence deadline</dt>
        <dd className="flex items-center gap-2">
          <span>{new Date(trade.evidenceDeadline).toLocaleString()}</span>
          <CountdownTimer deadline={trade.evidenceDeadline} />
        </dd>
      </dl>
    </div>
  );
}
