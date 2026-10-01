/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAttestationSync } from './useAttestationSync';
import { useNetworkStatus } from './useNetworkStatus';
import { attestationQueue } from '../services/attestationQueue.service';

jest.mock('./useNetworkStatus', () => ({ useNetworkStatus: jest.fn() }));
jest.mock('../services/attestationQueue.service', () => ({
  attestationQueue: { flush: jest.fn().mockResolvedValue({ sent: 0, failed: 0, remaining: 0 }) },
}));

const flush = attestationQueue.flush as jest.Mock;
const setOffline = (isOffline: boolean) => (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline });

beforeEach(() => {
  jest.clearAllMocks();
  flush.mockResolvedValue({ sent: 0, failed: 0, remaining: 0 });
});

describe('useAttestationSync', () => {
  it('does not sync while offline, and syncs as soon as connectivity returns', async () => {
    setOffline(true);
    const { rerender } = renderHook(({ enabled }) => useAttestationSync(enabled), { initialProps: { enabled: true } });
    expect(flush).not.toHaveBeenCalled();

    setOffline(false);
    await act(async () => rerender({ enabled: true }));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled (signed out)', () => {
    setOffline(false);
    renderHook(() => useAttestationSync(false));
    expect(flush).not.toHaveBeenCalled();
  });

  it('syncs when the app returns to the foreground while online', async () => {
    setOffline(false);
    let handler: ((s: string) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
      handler = h;
      return { remove };
    }) as any);
    const { unmount } = renderHook(() => useAttestationSync(true));
    await act(async () => undefined);
    flush.mockClear();

    await act(async () => handler?.('background'));
    expect(flush).not.toHaveBeenCalled();
    await act(async () => handler?.('active'));
    expect(flush).toHaveBeenCalledTimes(1);

    unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('syncNow returns the flush result and notifies the callback', async () => {
    setOffline(false);
    const result = { sent: 2, failed: 0, remaining: 0 };
    flush.mockResolvedValue(result);
    const onFlushed = jest.fn();
    const { result: hook } = renderHook(() => useAttestationSync(true, onFlushed));
    let r;
    await act(async () => {
      r = await hook.current.syncNow();
    });
    expect(r).toEqual(result);
    expect(onFlushed).toHaveBeenCalledWith(result);
  });
});
