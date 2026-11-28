import { useNetInfo } from '@react-native-community/netinfo';

export interface NetworkStatus {
  /**
   * True when the device is known to be offline.
   *
   * Initial render before netinfo resolves is treated as online (`false`)
   * so we do not flash a "you are offline" banner on a network that simply
   * has not yet reported. Once netinfo reports a value, we trust the
   * `isInternetReachable` flag: this guards against the common "Wi-Fi
   * connected but no internet" case where `isConnected` is true but the
   * device cannot reach the backend.
   */
  isOffline: boolean;
  /**
   * True once netinfo has reported a value. Consumers that buffer actions
   * (e.g. the offline trade queue) use this to avoid treating the initial
   * "unknown" state as a real connectivity transition.
   */
  isResolved: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const { isInternetReachable, isConnected } = useNetInfo();

  // Fail-safe: while netinfo hasn't reported any value yet (both flags
  // are null), report the device as offline. Privileged actions (admin
  // submits) must never be exposed in a "we don't know yet" state, since
  // an offline boot would briefly enable dangerous buttons otherwise.
  if (isInternetReachable === null && isConnected === null) {
    return { isOffline: true, isResolved: false };
  }

  return {
    isOffline: isInternetReachable === false || isConnected === false,
    isResolved: true,
  };
}
