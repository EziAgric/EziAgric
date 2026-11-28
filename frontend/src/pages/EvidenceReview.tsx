import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';

interface EvidenceData {
  tradeId: string;
  cid: string;
  thumbnailUrl?: string;
  submittedAt?: string;
}

export default function EvidenceReview() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tradeId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trades/${tradeId}/evidence`);
        if (!res.ok) throw new Error('Failed to load evidence');
        const data = (await res.json()) as EvidenceData;
        if (!cancelled) setEvidence(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load evidence');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading evidence…</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!evidence) {
    return <div className="p-6 text-sm text-gray-600">No evidence found for this trade.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900">Evidence Review</h1>
        <p className="text-sm text-gray-600">Trade {evidence.tradeId}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-800">Proof of Delivery</h2>
        <VideoPlayer cid={evidence.cid} thumbnailUrl={evidence.thumbnailUrl} />
        <p className="text-sm text-gray-600">
          IPFS CID:{' '}
          <a
            className="text-blue-600 underline hover:text-blue-700"
            href={`https://ipfs.io/ipfs/${evidence.cid}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {evidence.cid}
          </a>
        </p>
      </section>
    </div>
  );
}
