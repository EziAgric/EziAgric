/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { fireEvent, render } from '@testing-library/react-native';

import MediatorDisputeListScreen from '../MediatorDisputeListScreen';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../stores/authStore', () => ({ useAuthStore: jest.fn() }));

const mockGet = apiClient.get as jest.Mock;

const dispute = (over: Record<string, unknown> = {}) => ({
  id: 'dispute-0000000001',
  tradeId: 'trade-11111111111111',
  reason: 'Maize arrived wet and partially spoiled',
  status: 'OPEN',
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

function setup() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = render(<MediatorDisputeListScreen {...({ navigation, route: { params: undefined } } as any)} />);
  return { navigation, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: 'tok-123' });
});

describe('MediatorDisputeListScreen', () => {
  it('requests open and under-review disputes with the auth token', async () => {
    mockGet.mockResolvedValue({ data: { disputes: [] } });
    const { findByText } = setup();
    await findByText('No open disputes');

    expect(mockGet).toHaveBeenCalledWith('/mediator/disputes', {
      params: { status: 'OPEN,UNDER_REVIEW' },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it("shows 'No open disputes' when the queue is empty", async () => {
    mockGet.mockResolvedValue({ data: { disputes: [] } });
    const { findByText } = setup();
    expect(await findByText('No open disputes')).toBeTruthy();
  });

  it('renders each dispute with its status and SLA', async () => {
    mockGet.mockResolvedValue({
      data: {
        disputes: [
          dispute(),
          dispute({
            id: 'dispute-0000000002',
            reason: 'Seller never shipped',
            status: 'UNDER_REVIEW',
            slaDeadlineAt: '2020-01-01T00:00:00.000Z',
          }),
        ],
      },
    });
    const { findByText, getByText, queryByText } = setup();

    expect(await findByText('Maize arrived wet and partially spoiled')).toBeTruthy();
    expect(getByText('Seller never shipped')).toBeTruthy();
    expect(getByText('OPEN')).toBeTruthy();
    expect(getByText('UNDER REVIEW')).toBeTruthy();
    expect(getByText('⏱ No SLA')).toBeTruthy();
    expect(getByText('⏱ Overdue')).toBeTruthy();
    expect(queryByText('No open disputes')).toBeNull();
  });

  it('accepts a bare array response', async () => {
    mockGet.mockResolvedValue({ data: [dispute()] });
    const { findByText } = setup();
    expect(await findByText('Maize arrived wet and partially spoiled')).toBeTruthy();
  });

  it('opens the review screen for the pressed dispute', async () => {
    mockGet.mockResolvedValue({ data: { disputes: [dispute()] } });
    const { findByText, navigation } = setup();

    fireEvent.press(await findByText('Maize arrived wet and partially spoiled'));

    expect(navigation.navigate).toHaveBeenCalledWith('MediatorDisputeReview', {
      disputeId: 'dispute-0000000001',
    });
  });

  it('shows the error message when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('Request failed with status code 500'));
    const { findByText } = setup();
    expect(await findByText('Request failed with status code 500')).toBeTruthy();
  });
});
