/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, FlatList } from 'react-native';

import TradeListScreen from '../TradeListScreen';
import { useTradeStore } from '../../stores/tradeStore';
import { useAuthStore } from '../../stores/authStore';
import type { AdminErrorView } from '../../api/errors';
import type { Trade } from '../../types/trade';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../stores/tradeStore', () => ({ useTradeStore: jest.fn() }));
jest.mock('../../stores/authStore', () => ({ useAuthStore: jest.fn() }));

const trade = (over: Partial<Trade> = {}): Trade => ({
  id: 1,
  tradeId: 'trade-aaaa-0001',
  buyerAddress: 'GBUYER1111111111111111111111111111111111111111',
  sellerAddress: 'GSELLER111111111111111111111111111111111111111',
  amountUsdc: '250',
  status: 'PENDING',
  ...over,
});

const networkError: AdminErrorView = {
  title: 'Connection problem',
  message: 'You appear to be offline.',
  action: 'retry',
  code: 'NETWORK_ERROR',
};

const fetchTrades = jest.fn();
const clearErrorView = jest.fn();
const clearAuth = jest.fn();

function mockStore(over: Partial<{ trades: Trade[]; isLoading: boolean; errorView: AdminErrorView | null }> = {}) {
  (useTradeStore as unknown as jest.Mock).mockReturnValue({
    trades: [],
    isLoading: false,
    errorView: null,
    fetchTrades,
    clearErrorView,
    ...over,
  });
}

function setup() {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
  const utils = render(<TradeListScreen {...({ navigation, route: { params: undefined } } as any)} />);
  return { navigation, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchTrades.mockResolvedValue(undefined);
  clearAuth.mockResolvedValue(undefined);
  (useAuthStore as unknown as jest.Mock).mockReturnValue({ clearAuth });
  mockStore();
});

describe('TradeListScreen', () => {
  it('fetches all trades on mount', () => {
    setup();
    expect(fetchTrades).toHaveBeenCalledWith(undefined);
  });

  describe('empty state', () => {
    it("renders 'No trades found' when there are no trades", () => {
      const { getByText } = setup();
      expect(getByText('No trades found')).toBeTruthy();
      expect(getByText('You have no trades yet.')).toBeTruthy();
    });

    it('mentions the active filter and refetches with that status', () => {
      const { getByLabelText, getByText } = setup();

      fireEvent.press(getByLabelText('Filter by Disputed'));

      expect(fetchTrades).toHaveBeenLastCalledWith({ status: 'DISPUTED' });
      expect(getByText('No trades found')).toBeTruthy();
      expect(getByText('No trades with status "DISPUTED".')).toBeTruthy();
    });
  });

  describe('populated list', () => {
    const trades = [
      trade(),
      trade({ id: 2, tradeId: 'trade-bbbb-0002', amountUsdc: '900', status: 'DISPUTED' }),
    ];

    it('renders a card per trade and no empty state', () => {
      mockStore({ trades });
      const { getByLabelText, getByText, queryByText } = setup();

      expect(getByLabelText('Trade trade-aa, 250 USDC, status PENDING')).toBeTruthy();
      expect(getByLabelText('Trade trade-bb, 900 USDC, status DISPUTED')).toBeTruthy();
      expect(getByText('900 USDC')).toBeTruthy();
      expect(queryByText('No trades found')).toBeNull();
    });

    it('navigates to the trade detail when a card is pressed', () => {
      mockStore({ trades });
      const { getByLabelText, navigation } = setup();

      fireEvent.press(getByLabelText('Trade trade-bb, 900 USDC, status DISPUTED'));

      expect(navigation.navigate).toHaveBeenCalledWith('TradeDetail', { tradeId: 'trade-bbbb-0002' });
    });

    it('keys rows by tradeId, independent of position', () => {
      mockStore({ trades });
      const { UNSAFE_getByType } = setup();
      const { keyExtractor } = UNSAFE_getByType(FlatList).props;

      expect(keyExtractor(trades[0], 0)).toBe('trade-aaaa-0001');
      expect(keyExtractor(trades[1], 1)).toBe('trade-bbbb-0002');
      // Same item at a different index keeps its key, so a reorder or
      // prepend doesn't remount existing rows.
      expect(keyExtractor(trades[1], 0)).toBe('trade-bbbb-0002');
    });
  });

  describe('loading state', () => {
    it('shows a spinner instead of the list while loading', () => {
      mockStore({ isLoading: true });
      const { UNSAFE_queryByType, queryByText } = setup();

      expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
      expect(UNSAFE_queryByType(FlatList)).toBeNull();
      expect(queryByText('No trades found')).toBeNull();
    });

    it('hides the spinner once loading finishes', () => {
      mockStore({ isLoading: false });
      const { UNSAFE_queryByType } = setup();

      expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
      expect(UNSAFE_queryByType(FlatList)).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('renders the error banner above the list', () => {
      mockStore({ errorView: networkError });
      const { getByTestId, getByText } = setup();

      expect(getByTestId('admin-error-banner')).toBeTruthy();
      expect(getByText('You appear to be offline.')).toBeTruthy();
      expect(getByText('No trades found')).toBeTruthy();
    });

    it('retries with the active filter', () => {
      mockStore({ errorView: networkError });
      const { getByLabelText, getByTestId } = setup();
      fireEvent.press(getByLabelText('Filter by Pending'));
      fetchTrades.mockClear();

      fireEvent.press(getByTestId('admin-error-banner-primary-retry'));

      expect(fetchTrades).toHaveBeenCalledWith({ status: 'PENDING' });
    });

    it('does not render the banner when there is no error', () => {
      const { queryByTestId } = setup();
      expect(queryByTestId('admin-error-banner')).toBeNull();
    });
  });

  it('logs out and returns to wallet connect', async () => {
    const { getByLabelText, navigation } = setup();

    await act(async () => {
      fireEvent.press(getByLabelText('Log out'));
    });

    expect(clearAuth).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('WalletConnect');
  });
});
