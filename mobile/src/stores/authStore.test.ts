import { act } from '@testing-library/react-native';

import { useAuthStore } from './authStore';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';

const mockSet = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const mockGet = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockDelete = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

function resetStore(): void {
  act(() => {
    useAuthStore.setState({ token: null, walletAddress: null, isLoading: true });
  });
}

describe('useAuthStore', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('has null token and walletAddress by default', () => {
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.walletAddress).toBeNull();
    });
  });

  describe('setToken', () => {
    it('persists token to SecureStore and updates state', async () => {
      mockSet.mockResolvedValueOnce();

      await act(async () => {
        await useAuthStore.getState().setToken('tok-abc');
      });

      expect(mockSet).toHaveBeenCalledWith('amana_token', 'tok-abc');
      expect(useAuthStore.getState().token).toBe('tok-abc');
    });

    it('propagates SecureStore write errors to the caller', async () => {
      mockSet.mockRejectedValueOnce(new Error('disk full'));

      await expect(
        act(async () => {
          await useAuthStore.getState().setToken('tok-fail');
        }),
      ).rejects.toThrow('disk full');
    });
  });

  describe('setWalletAddress', () => {
    it('updates walletAddress in state', () => {
      act(() => {
        useAuthStore.getState().setWalletAddress('GABC1234');
      });
      expect(useAuthStore.getState().walletAddress).toBe('GABC1234');
    });

    it('overwrites a previously set address', () => {
      act(() => {
        useAuthStore.getState().setWalletAddress('GABC1111');
        useAuthStore.getState().setWalletAddress('GABC2222');
      });
      expect(useAuthStore.getState().walletAddress).toBe('GABC2222');
    });
  });

  describe('getToken', () => {
    it('reads from SecureStore and syncs state', async () => {
      mockGet.mockResolvedValueOnce('stored-token');

      let result: string | null = null;
      await act(async () => {
        result = await useAuthStore.getState().getToken();
      });

      expect(result).toBe('stored-token');
      expect(useAuthStore.getState().token).toBe('stored-token');
    });

    it('returns null and sets state to null when SecureStore is empty', async () => {
      mockGet.mockResolvedValueOnce(null);

      let result: string | null = 'initial';
      await act(async () => {
        result = await useAuthStore.getState().getToken();
      });

      expect(result).toBeNull();
      expect(useAuthStore.getState().token).toBeNull();
    });

    it('returns null without throwing when SecureStore errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('keychain locked'));

      let result: string | null = 'initial';
      await act(async () => {
        result = await useAuthStore.getState().getToken();
      });

      expect(result).toBeNull();
    });
  });

  describe('clearAuth', () => {
    it('deletes token from SecureStore and clears both state fields', async () => {
      act(() => {
        useAuthStore.setState({ token: 'tok-xyz', walletAddress: 'GABC9999' });
      });
      mockDelete.mockResolvedValueOnce();

      await act(async () => {
        await useAuthStore.getState().clearAuth();
      });

      expect(mockDelete).toHaveBeenCalledWith('amana_token');
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.walletAddress).toBeNull();
    });

    it('propagates SecureStore delete errors to the caller', async () => {
      mockDelete.mockRejectedValueOnce(new Error('cannot delete'));

      await expect(
        act(async () => {
          await useAuthStore.getState().clearAuth();
        }),
      ).rejects.toThrow('cannot delete');
    });
  });

  describe('full auth lifecycle', () => {
    it('set → get → clear round-trips correctly', async () => {
      mockSet.mockResolvedValueOnce();
      mockGet.mockResolvedValueOnce('round-trip-token');
      mockDelete.mockResolvedValueOnce();

      await act(async () => {
        await useAuthStore.getState().setToken('round-trip-token');
        useAuthStore.getState().setWalletAddress('GABC_RT');
      });

      expect(useAuthStore.getState().token).toBe('round-trip-token');
      expect(useAuthStore.getState().walletAddress).toBe('GABC_RT');

      let fetched: string | null = null;
      await act(async () => {
        fetched = await useAuthStore.getState().getToken();
      });
      expect(fetched).toBe('round-trip-token');

      await act(async () => {
        await useAuthStore.getState().clearAuth();
      });

      const final = useAuthStore.getState();
      expect(final.token).toBeNull();
      expect(final.walletAddress).toBeNull();
    });
  });
});
