import { useCallback, useEffect, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'amana:low_data_mode';

export interface LowDataMode {
  /** True when low-data mode is active (thumbnails only, no autoplay). */
  isLowData: boolean;
  /** Whether the user has explicitly overridden the automatic cellular detection. */
  isManualOverride: boolean;
  /** Toggle the manual override on or off. */
  setManualOverride: (enabled: boolean) => void;
}

/**
 * Returns whether low-data mode should be active.
 *
 * Automatic: enabled whenever the device is on a cellular connection
 *            (type === 'cellular') and the user hasn't overridden it.
 * Manual:    the user can force it on/off via `setManualOverride`; the
 *            preference is persisted to AsyncStorage so it survives app
 *            restarts.
 */
export function useLowDataMode(): LowDataMode {
  const { type } = useNetInfo();
  const isCellular = type === 'cellular';

  // null = "not yet loaded from storage", undefined = "no override stored"
  const [override, setOverride] = useState<boolean | null>(null);

  // Hydrate persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw === 'true') setOverride(true);
        else if (raw === 'false') setOverride(false);
        else setOverride(undefined as unknown as null); // no stored override
      })
      .catch(() => {
        setOverride(undefined as unknown as null);
      });
  }, []);

  const setManualOverride = useCallback((enabled: boolean) => {
    setOverride(enabled);
    AsyncStorage.setItem(STORAGE_KEY, String(enabled)).catch(() => {/* best-effort */});
  }, []);

  // While storage hasn't loaded yet, fall back to the cellular signal
  const resolvedOverride = override === null ? undefined : (override as boolean | undefined);
  const isLowData = resolvedOverride !== undefined ? resolvedOverride : isCellular;
  const isManualOverride = resolvedOverride !== undefined;

  return { isLowData, isManualOverride, setManualOverride };
}
