import { useEffect, useState } from 'react';
import { FALLBACK_COMMODITIES, referenceApi, type ReferenceItem } from '../api/reference';

/** Commodity and region pickers, loaded from the reference APIs. */
export function useReferenceData() {
  const [commodities, setCommodities] = useState<ReferenceItem[]>(FALLBACK_COMMODITIES);
  const [regions, setRegions] = useState<ReferenceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    referenceApi
      .listCommodities()
      .then((c) => !cancelled && c.length > 0 && setCommodities(c))
      .catch(() => undefined); // keep the built-in commodity list
    referenceApi
      .listRegions()
      .then((r) => !cancelled && setRegions(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load regions'));
    return () => {
      cancelled = true;
    };
  }, []);

  return { commodities, regions, error };
}
