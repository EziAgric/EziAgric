/* eslint-disable no-undef */
import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { BIOMETRICS_PREFERENCE_KEY, useBiometrics } from './useBiometrics';

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<
  typeof AsyncStorage.getItem
>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<
  typeof AsyncStorage.setItem
>;
const mockHasHardware = LocalAuthentication.hasHardwareAsync as jest.MockedFunction<
  typeof LocalAuthentication.hasHardwareAsync
>;
const mockIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.MockedFunction<
  typeof LocalAuthentication.isEnrolledAsync
>;
const mockGetEnrolledLevel =
  LocalAuthentication.getEnrolledLevelAsync as jest.MockedFunction<
    typeof LocalAuthentication.getEnrolledLevelAsync
  >;
const mockAuthenticate =
  LocalAuthentication.authenticateAsync as jest.MockedFunction<
    typeof LocalAuthentication.authenticateAsync
  >;

const success = { success: true } as LocalAuthentication.LocalAuthenticationResult;
const failure = { success: false } as LocalAuthentication.LocalAuthenticationResult;

describe('useBiometrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue();
    mockHasHardware.mockResolvedValue(true);
    mockIsEnrolled.mockResolvedValue(true);
    mockGetEnrolledLevel.mockResolvedValue(
      LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
    );
    mockAuthenticate.mockResolvedValue(success);
  });

  it('detects biometric hardware, enrolment and device PIN availability', async () => {
    const { result } = renderHook(() => useBiometrics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.isDeviceSecure).toBe(true);
    expect(result.current.biometricsEnabled).toBe(true);
  });

  it('hydrates the persisted enable/disable preference', async () => {
    mockGetItem.mockResolvedValue('false');

    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.biometricsEnabled).toBe(false);
  });

  it('reports no biometrics when the device has no enrolled credentials', async () => {
    mockIsEnrolled.mockResolvedValue(false);

    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAvailable).toBe(false);
  });

  it('treats an enrolled PIN as a secure fallback without biometrics', async () => {
    mockIsEnrolled.mockResolvedValue(false);
    mockGetEnrolledLevel.mockResolvedValue(
      LocalAuthentication.SecurityLevel.SECRET
    );

    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.isDeviceSecure).toBe(true);
  });

  it('persists preference changes', async () => {
    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setBiometricsEnabled(false);
    });

    expect(mockSetItem).toHaveBeenCalledWith(BIOMETRICS_PREFERENCE_KEY, 'false');
    expect(result.current.biometricsEnabled).toBe(false);
  });

  it('reverts the preference when persistence fails', async () => {
    mockSetItem.mockRejectedValue(new Error('storage unavailable'));

    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.setBiometricsEnabled(false);
      })
    ).rejects.toThrow('storage unavailable');
    expect(result.current.biometricsEnabled).toBe(true);
  });

  it('prompts with the OS device PIN fallback enabled', async () => {
    mockAuthenticate.mockResolvedValue(success);

    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let authenticated = false;
    await act(async () => {
      authenticated = await result.current.authenticate('Confirm delivery');
    });

    expect(authenticated).toBe(true);
    expect(mockAuthenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: 'Confirm delivery',
        fallbackLabel: 'Use device PIN',
        disableDeviceFallback: false,
      })
    );
  });

  it('returns false when authentication is cancelled or fails', async () => {
    mockAuthenticate.mockResolvedValue(failure);

    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let authenticated = true;
    await act(async () => {
      authenticated = await result.current.authenticate('Release funds');
    });

    expect(authenticated).toBe(false);
  });

  it('re-prompts on every call and never persists an auth result', async () => {
    const { result } = renderHook(() => useBiometrics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.authenticate('Confirm delivery');
    });
    await act(async () => {
      await result.current.authenticate('Confirm delivery');
    });

    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
