/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import CoopHomeScreen from '../CoopHomeScreen';
import * as cooperativeApiModule from '../../api/cooperative';

jest.mock('../../api/cooperative', () => ({
  cooperativeApi: {
    getHome: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNav = { navigate: jest.fn() } as any;
const mockRoute = { params: { coopId: 'coop-001' } } as any;

const memberData: cooperativeApiModule.CoopHomeData = {
  role: 'MEMBER',
  stats: {
    coopId: 'coop-001',
    name: 'Sunrise Farmers Co-op',
    memberCount: 42,
    activeTrades: 7,
    totalVolumeUsdc: 125000,
  },
  recentTrades: [
    {
      tradeId: 'trade-abc-001',
      buyerAddress: 'GCBUYER111111111111111111111111111111111111111',
      sellerAddress: 'GCSELLER1111111111111111111111111111111111111',
      amountUsdc: 5000,
      status: 'COMPLETED',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
  ],
  announcements: [
    {
      id: 'ann-001',
      title: 'Harvest season reminder',
      body: 'Please submit your yield estimates by Oct 1.',
      publishedAt: '2026-09-15T08:00:00.000Z',
    },
  ],
};

const managerData: cooperativeApiModule.CoopHomeData = {
  ...memberData,
  role: 'MANAGER',
};

describe('CoopHomeScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders stats and trades for a MEMBER', async () => {
    (cooperativeApiModule.cooperativeApi.getHome as jest.Mock).mockResolvedValue(memberData);

    const { getByText } = render(<CoopHomeScreen navigation={mockNav} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Sunrise Farmers Co-op')).toBeTruthy();
      expect(getByText('42')).toBeTruthy();
      expect(getByText('MEMBER')).toBeTruthy();
      expect(getByText('Harvest season reminder')).toBeTruthy();
    });
  });

  it('shows Manager Actions banner only for MANAGER role', async () => {
    (cooperativeApiModule.cooperativeApi.getHome as jest.Mock).mockResolvedValue(managerData);

    const { getByLabelText } = render(<CoopHomeScreen navigation={mockNav} route={mockRoute} />);

    await waitFor(() => {
      expect(getByLabelText('Manager actions area')).toBeTruthy();
      expect(getByLabelText('Post announcement')).toBeTruthy();
    });
  });

  it('does not show Manager Actions banner for MEMBER role', async () => {
    (cooperativeApiModule.cooperativeApi.getHome as jest.Mock).mockResolvedValue(memberData);

    const { queryByLabelText } = render(<CoopHomeScreen navigation={mockNav} route={mockRoute} />);

    await waitFor(() => {
      expect(queryByLabelText('Manager actions area')).toBeNull();
    });
  });

  it('shows error state and retry button on failure', async () => {
    (cooperativeApiModule.cooperativeApi.getHome as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<CoopHomeScreen navigation={mockNav} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText(/Could not load/)).toBeTruthy();
    });

    fireEvent.press(getByText('Retry'));
    expect(cooperativeApiModule.cooperativeApi.getHome).toHaveBeenCalledTimes(2);
  });
});
