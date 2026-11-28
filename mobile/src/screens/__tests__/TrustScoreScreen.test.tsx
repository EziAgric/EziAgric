import React from 'react';
import { render } from '@testing-library/react-native';
import { TrustScoreScreen } from '../TrustScoreScreen';

// Mock the API and stores
jest.mock('../api/client', () => ({
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    walletAddress: 'GABC123',
    token: 'mock-token',
    isAuthenticated: true,
  }),
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
    params: { address: 'GABC123' },
  }),
}));

const mockTrustScoreData = {
  address: 'GABC123',
  overallScore: 85,
  components: [
    { label: 'Trade History', score: 90, maxScore: 100, detail: 'Completed 50 trades' },
    { label: 'Dispute Rate', score: 95, maxScore: 100, detail: 'Only 2 disputes out of 50' },
    { label: 'Response Time', score: 75, maxScore: 100, detail: 'Average 2 hours' },
  ],
  computedAt: '2025-01-15T10:00:00Z',
};

describe('TrustScoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders trust score correctly', async () => {
    const apiClient = require('../api/client');
    apiClient.default.get.mockResolvedValueOnce({ data: mockTrustScoreData });

    const { toJSON } = render(<TrustScoreScreen /> as any);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows loading state', () => {
    const { toJSON } = render(<TrustScoreScreen /> as any);
    // Initially shows loading
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows error state', async () => {
    const apiClient = require('../api/client');
    apiClient.default.get.mockRejectedValueOnce(new Error('Network error'));

    const { toJSON } = render(<TrustScoreScreen /> as any);
    // Wait for the error to appear
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders low trust score correctly', async () => {
    const lowScoreData = {
      address: 'GDEF456',
      overallScore: 35,
      components: [
        { label: 'Trade History', score: 40, maxScore: 100, detail: 'Only 5 trades' },
        { label: 'Dispute Rate', score: 20, maxScore: 100, detail: '3 disputes out of 5' },
        { label: 'Response Time', score: 50, maxScore: 100, detail: 'Average 24 hours' },
      ],
      computedAt: '2025-01-15T10:00:00Z',
    };

    const apiClient = require('../api/client');
    apiClient.default.get.mockResolvedValueOnce({ data: lowScoreData });

    const { toJSON } = render(<TrustScoreScreen /> as any);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(toJSON()).toMatchSnapshot();
  });
});