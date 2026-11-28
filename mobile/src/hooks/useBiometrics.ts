import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Only the user's preference is persisted here. An authentication result is
 * never cached: every protected action calls `authenticate` again so the OS
 * prompts on each use, even if an earlier action succeeded in this session.
 */
export const BIOMETRICS_PREFERENCE_KEY = 'amana:biometrics_enabled';

export interface UseBiometricsResult {
  /** Biometric hardware is present and the user has enrolled credentials. */
  isAvailable: boolean;
  /** The device has a secure fallback (PIN/pattern/password). */
  isDeviceSecure: boolean;
  /** Persisted user preference; defaults to enabled. */
  biometricsEnabled: boolean;
  loading: boolean;
  setBiometricsEnabled: (enabled: boolean) => Promise<void>;
  /** Runs a fresh OS authentication prompt and returns whether it succeeded. */
  authenticate: (reason: string) => Promise<boolean>;
}

export function useBiometrics(): UseBiometricsResult {
  const [biometricsEnabled, setEnabledState] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isDeviceSecure, setIsDeviceSecure] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      try {
        const [stored, hardware, enrolled, enrolledLevel] = await Promise.all([
          AsyncStorage.getItem(BIOMETRICS_PREFERENCE_KEY),
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.getEnrolledLevelAsync(),
        ]);
        if (!active) return;
        setEnabledState(stored !== 'false');
        setIsAvailable(hardware && enrolled);
        // A PIN/pattern/password counts as a secure fallback even when no
        // biometric credential is enrolled.
        setIsDeviceSecure(
          enrolledLevel !== LocalAuthentication.SecurityLevel.NONE
        );
      } catch {
        // Fail closed: keep biometrics enabled and let the OS decide whether
        // a prompt is possible. No authentication state is persisted.
        if (active) {
          setEnabledState(true);
          setIsAvailable(false);
          setIsDeviceSecure(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const setBiometricsEnabled = useCallback(async (enabled: boolean) => {
    setEnabledState(enabled);
    try {
      await AsyncStorage.setItem(
        BIOMETRICS_PREFERENCE_KEY,
        enabled ? 'true' : 'false',
      );
    } catch (error) {
      setEnabledState(!enabled);
      throw error;
    }
  }, []);

  const authenticate = useCallback(
    async (reason: string): Promise<boolean> => {
      // `disableDeviceFallback: false` lets the OS offer the device PIN when
      // biometrics are unavailable (or the user opted out in settings).
      // Each call is a new prompt — never memoise or store the result.
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: biometricsEnabled
            ? reason
            : `${reason} — use your device PIN`,
          fallbackLabel: 'Use device PIN',
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });
        return result.success === true;
      } catch {
        return false;
      }
    },
    [biometricsEnabled],
  );

  return {
    isAvailable,
    isDeviceSecure,
    biometricsEnabled,
    loading,
    setBiometricsEnabled,
    authenticate,
  };
}
