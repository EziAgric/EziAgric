import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

const STORAGE_KEY = 'lowBandwidthMode';

function isSlowConnection(state: NetInfoState): boolean {
  const effectiveType = state.details && 'effectiveType' in state.details
    ? (state.details as { effectiveType?: string }).effectiveType
    : undefined;
  return effectiveType === '2g' || effectiveType === 'slow-2g';
}

export interface LowBandwidthState {
  lowBandwidth: boolean;
  setLowBandwidth: (value: boolean) => void;
  autoDetected: boolean;
}

export function useLowBandwidth(): LowBandwidthState {
  const [lowBandwidth, setLowBandwidthState] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (mounted && stored !== null) {
          setLowBandwidthState(stored === 'true');
        }
      })
      .catch(() => undefined);

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      const slow = isSlowConnection(state);
      setAutoDetected(slow);
      if (slow) {
        setLowBandwidthState(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const setLowBandwidth = useCallback((value: boolean) => {
    setLowBandwidthState(value);
    AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false').catch(() => undefined);
  }, []);

  return { lowBandwidth, setLowBandwidth, autoDetected };
}
