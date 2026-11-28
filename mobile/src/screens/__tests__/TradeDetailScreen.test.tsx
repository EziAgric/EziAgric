import React from 'react';
import { render } from '@testing-library/react-native';
import { TradeDetailScreen } from '../TradeDetailScreen';
import type { Trade } from '../types/trade';

// Mock the stores and components
const mockTrade: Trade = {
  id: 1,
  tradeId: 'TRD123',
  buyerAddress: 'GABC123',
  sellerAddress: 'GDEF456',
  amount: '100000',
  amountUsdc: '100000',
  assetCode: 'cNGN',
  status: 'FUNDED',
  buyerLossBps: 5000,
  sellerLossBps: 5000,
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
};

jest.mock('../stores/tradeStore', () => ({
  useTradeStore: () => ({
    trade: mockTrade,
    isLoading: false,
    error: null,
    fetchTrade: jest.fn(),
    updateTrade: jest.fn(),
  }),
}));

jest.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    walletAddress: 'GABC123',
    isAuthenticated: true,
  }),
}));

jest.mock('../api/client', () => ({
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: { tradeId: 'TRD123' },
  }),
}));

jest.mock('../components/AdminErrorBanner', () => ({
  AdminErrorBanner: () => null,
}));

describe('TradeDetailScreen', () => {
  it('renders trade details correctly', () => {
    const { toJSON } = render(<TradeDetailScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows loading state', () => {
    jest.doMock('../stores/tradeStore', () => ({
      useTradeStore: () => ({
        trade: null,
        isLoading: true,
        error: null,
        fetchTrade: jest.fn(),
        updateTrade: jest.fn(),
      }),
    }));
    const { toJSON } = render(<TradeDetailScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows error state', () => {
    jest.doMock('../stores/tradeStore', () => ({
      useTradeStore: () => ({
        trade: null,
        isLoading: false,
        error: { message: 'Trade not found' },
        fetchTrade: jest.fn(),
        updateTrade: jest.fn(),
      }),
    }));
    const { toJSON } = render(<TradeDetailScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders completed trade correctly', () => {
    const completedTrade: Trade = {
      ...mockTrade,
      status: 'COMPLETED',
    };
    jest.doMock('../stores/tradeStore', () => ({
      useTradeStore: () => ({
        trade: completedTrade,
        isLoading: false,
        error: null,
        fetchTrade: jest.fn(),
        updateTrade: jest.fn(),
      }),
    }));
    const { toJSON } = render(<TradeDetailScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders disputed trade correctly', () => {
    const disputedTrade: Trade = {
      ...mockTrade,
      status: 'DISPUTED',
    };
    jest.doMock('../stores/tradeStore', () => ({
      useTradeStore: () => ({
        trade: disputedTrade,
        isLoading: false,
        error: null,
        fetchTrade: jest.fn(),
        updateTrade: jest.fn(),
      }),
    }));
    const { toJSON } = render(<TradeDetailScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });
});