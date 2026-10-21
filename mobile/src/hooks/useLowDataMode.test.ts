import { act, renderHook } from '@testing-library/react-native';

import { useLowDataMode } from './useLowDataMode';

// --- mocks -----------------------------------------------------------

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import { useNetInfo } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockNetInfo = useNetInfo as jest.MockedFunction<typeof useNetInfo>;
const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

// Helper: resolve the storage promise so hook state settles
async function flushStorage() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useLowDataMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue();
  });

  it('returns isLowData=true on cellular when no override stored', async () => {
    mockNetInfo.mockReturnValue({ type: 'cellular' } as ReturnType<typeof useNetInfo>);
    mockGet.mockResolvedValue(null);

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    expect(result.current.isLowData).toBe(true);
    expect(result.current.isManualOverride).toBe(false);
  });

  it('returns isLowData=false on wifi when no override stored', async () => {
    mockNetInfo.mockReturnValue({ type: 'wifi' } as ReturnType<typeof useNetInfo>);
    mockGet.mockResolvedValue(null);

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    expect(result.current.isLowData).toBe(false);
    expect(result.current.isManualOverride).toBe(false);
  });

  it('persisted override=true forces low-data on wifi', async () => {
    mockNetInfo.mockReturnValue({ type: 'wifi' } as ReturnType<typeof useNetInfo>);
    mockGet.mockResolvedValue('true');

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    expect(result.current.isLowData).toBe(true);
    expect(result.current.isManualOverride).toBe(true);
  });

  it('persisted override=false disables low-data on cellular', async () => {
    mockNetInfo.mockReturnValue({ type: 'cellular' } as ReturnType<typeof useNetInfo>);
    mockGet.mockResolvedValue('false');

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    expect(result.current.isLowData).toBe(false);
    expect(result.current.isManualOverride).toBe(true);
  });

  it('setManualOverride persists to AsyncStorage', async () => {
    mockNetInfo.mockReturnValue({ type: 'wifi' } as ReturnType<typeof useNetInfo>);
    mockGet.mockResolvedValue(null);

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    await act(async () => {
      result.current.setManualOverride(true);
    });

    expect(mockSet).toHaveBeenCalledWith('amana:low_data_mode', 'true');
    expect(result.current.isLowData).toBe(true);
    expect(result.current.isManualOverride).toBe(true);
  });

  it('setManualOverride(false) overrides cellular auto-enable', async () => {
    mockNetInfo.mockReturnValue({ type: 'cellular' } as ReturnType<typeof useNetInfo>);
    mockGet.mockResolvedValue(null);

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    await act(async () => {
      result.current.setManualOverride(false);
    });

    expect(result.current.isLowData).toBe(false);
    expect(mockSet).toHaveBeenCalledWith('amana:low_data_mode', 'false');
  });

  it('falls back gracefully when AsyncStorage.getItem throws', async () => {
    mockNetInfo.mockReturnValue({ type: 'cellular' } as ReturnType<typeof useNetInfo>);
    mockGet.mockRejectedValue(new Error('storage unavailable'));

    const { result } = renderHook(() => useLowDataMode());
    await flushStorage();

    // Falls back to auto-detect (cellular → true)
    expect(result.current.isLowData).toBe(true);
  });
});
