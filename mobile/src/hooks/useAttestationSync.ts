import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNetworkStatus } from './useNetworkStatus';
import { attestationQueue } from '../services/attestationQueue.service';
import type { FlushResult } from '../lib/attestationQueue';

/**
 * Flushes the offline attestation queue whenever it can make progress: at
 * start, each time connectivity returns, and when the app comes to the
 * foreground. Mounted once at the app root so queued attestations sync even
 * if the driver has left the driver screens. Returns a manual `syncNow`.
 */
export function useAttestationSync(enabled: boolean, onFlushed?: (result: FlushResult) => void) {
  const { isOffline } = useNetworkStatus();
  const callback = useRef(onFlushed);
  callback.current = onFlushed;

  const syncNow = useCallback(async () => {
    const result = await attestationQueue.flush();
    callback.current?.(result);
    return result;
  }, []);

  useEffect(() => {
    if (enabled && !isOffline) void syncNow().catch(() => undefined);
  }, [enabled, isOffline, syncNow]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !isOffline) void syncNow().catch(() => undefined);
    });
    return () => sub.remove();
  }, [enabled, isOffline, syncNow]);

  return { syncNow };
}
