import { useCallback, useEffect, useState } from 'react';
import { attestationQueue } from '../services/attestationQueue.service';
import type { QueuedAttestation } from '../types/driver';

/** Live view of the offline attestation queue (re-reads whenever it changes). */
export function useAttestationQueueItems() {
  const [items, setItems] = useState<QueuedAttestation[]>([]);

  const refresh = useCallback(async () => {
    setItems(await attestationQueue.items());
  }, []);

  useEffect(() => {
    void refresh();
    return attestationQueue.subscribe(() => void refresh());
  }, [refresh]);

  return {
    items,
    pending: items.filter((i) => i.status === 'PENDING'),
    failed: items.filter((i) => i.status === 'FAILED'),
    refresh,
  };
}
