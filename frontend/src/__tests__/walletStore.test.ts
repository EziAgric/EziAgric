import { useWalletStore } from '../stores/walletStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Wallet Store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useWalletStore.setState({
      publicKey: null,
      network: 'public',
      balances: {},
      isConnected: false,
      isConnecting: false,
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct default state', () => {
      const state = useWalletStore.getState();
      expect(state.publicKey).toBeNull();
      expect(state.network).toBe('public');
      expect(state.balances).toEqual({});
      expect(state.isConnected).toBe(false);
      expect(state.isConnecting).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect wallet and update state', () => {
      const store = useWalletStore.getState();
      store.connect('GC1234...', 'testnet');

      const state = useWalletStore.getState();
      expect(state.publicKey).toBe('GC1234...');
      expect(state.network).toBe('testnet');
      expect(state.isConnected).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should clear connection and reset state', () => {
      useWalletStore.setState({
        publicKey: 'GC1234...',
        network: 'testnet',
        balances: { XLM: '100' },
        isConnected: true,
      });

      const store = useWalletStore.getState();
      store.disconnect();

      const state = useWalletStore.getState();
      expect(state.publicKey).toBeNull();
      expect(state.network).toBe('public');
      expect(state.balances).toEqual({});
      expect(state.isConnected).toBe(false);
    });
  });

  describe('setBalances', () => {
    it('should update token balances', () => {
      const store = useWalletStore.getState();
      store.setBalances({ XLM: '50', USDC: '12.5' });

      const state = useWalletStore.getState();
      expect(state.balances).toEqual({ XLM: '50', USDC: '12.5' });
    });
  });

  describe('reset', () => {
    it('should reset all state values', () => {
      useWalletStore.setState({
        publicKey: 'GC1234...',
        network: 'testnet',
        balances: { XLM: '100' },
        isConnected: true,
        isConnecting: true,
      });

      const store = useWalletStore.getState();
      store.reset();

      const state = useWalletStore.getState();
      expect(state.publicKey).toBeNull();
      expect(state.network).toBe('public');
      expect(state.balances).toEqual({});
      expect(state.isConnected).toBe(false);
      expect(state.isConnecting).toBe(false);
    });
  });
});
