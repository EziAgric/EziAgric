import React from 'react';
import { render } from '@testing-library/react-native';
import { MarketplaceScreen } from '../MarketplaceScreen';

// Mock the hooks and dependencies
jest.mock('../hooks/useListings', () => ({
  useListings: () => ({
    listings: [
      {
        id: '1',
        commodity: 'Cassava',
        pricePerUnit: '50000',
        unit: 'ton',
        quantity: 100,
        region: 'Lagos',
        sellerAddress: 'GABC123',
      },
      {
        id: '2',
        commodity: 'Maize',
        pricePerUnit: '35000',
        unit: 'ton',
        quantity: 50,
        region: 'Kano',
        sellerAddress: 'GDEF456',
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('../api/reference', () => ({
  FALLBACK_COMMODITIES: [
    { id: '1', name: 'Cassava' },
    { id: '2', name: 'Maize' },
  ],
  referenceApi: {
    getCommodities: jest.fn().mockResolvedValue([]),
    getRegions: jest.fn().mockResolvedValue([]),
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
}));

describe('MarketplaceScreen', () => {
  it('renders correctly with listings', () => {
    const { toJSON } = render(<MarketplaceScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows loading state', () => {
    jest.doMock('../hooks/useListings', () => ({
      useListings: () => ({
        listings: [],
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      }),
    }));
    const { toJSON } = render(<MarketplaceScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows empty state when no listings', () => {
    jest.doMock('../hooks/useListings', () => ({
      useListings: () => ({
        listings: [],
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      }),
    }));
    const { toJSON } = render(<MarketplaceScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows error state', () => {
    jest.doMock('../hooks/useListings', () => ({
      useListings: () => ({
        listings: [],
        isLoading: false,
        error: { message: 'Failed to load listings' },
        refetch: jest.fn(),
      }),
    }));
    const { toJSON } = render(<MarketplaceScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });
});